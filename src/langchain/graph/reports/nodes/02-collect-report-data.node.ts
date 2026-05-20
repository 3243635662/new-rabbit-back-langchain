import { Between, IsNull, Repository, ObjectLiteral } from 'typeorm';
import { Order } from '../../../../modules/order/entities/orders.entity';
import { Inventory } from '../../../../modules/inventory/entities/inventory.entity';
import { InventoryLog } from '../../../../modules/inventory/entities/inventory_logs.entity';
import { FinanceExtractedRecord } from '../../../../modules/finance/entities/finance-extracted-record.entity';
import { Merchant } from '../../../../modules/merchant/entities/merchant.entity';
import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
import type {
  ReportRawData,
  OrderReportRecord,
  InvoiceReportRecord,
  FinanceResourceRecord,
  InventoryReportRecord,
  InventoryLogReportItem,
} from '../../../../types/reports/report-raw-data.type';
import { getComparisonRange } from '../../../../utils/timeFormat.util';
import type { ComparisonRange } from '../../../../types/reports/comparison-range.type';

interface OcrRawField {
  name: string;
  desc?: string;
  value?: any;
}

interface OcrRawStructure {
  document_type?: string;
  summary?: string;
  structured_fields?: OcrRawField[];
}

const getErrorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

export const collectReportDataNode = async (
  state: FinanceReportGraphState,
  config?: { configurable?: FinanceReportNodeDeps },
): Promise<Partial<FinanceReportGraphState>> => {
  const deps = config?.configurable;
  if (!deps) {
    throw new Error('未提供图节点所需的依赖（deps）配置');
  }

  const anyRepo = (deps.orderRepo ||
    deps.inventoryRepo ||
    deps.invoiceRepo ||
    deps.financeRecordRepo) as {
    manager: {
      getRepository: <T extends ObjectLiteral>(
        entity: new (...args: any[]) => T,
      ) => Repository<T>;
    };
  };
  if (!anyRepo) {
    throw new Error('未在 deps 中提供任何数据库 Repository 实例');
  }

  const getRepo = <T extends ObjectLiteral>(
    entity: new (...args: any[]) => T,
  ): Repository<T> => {
    return anyRepo.manager.getRepository(entity);
  };

  const merchantId = state.user?.merchantId;
  if (!merchantId) {
    return {
      rawData: {
        orders: [],
        inventory: [],
        inventoryLogs: [],
        invoices: [],
        financeResources: [],
      },
      logs: ['商户ID缺失，跳过财务原始数据收集'],
    };
  }

  const dataScopes = state.request.dataScopes || [];
  const logs: string[] = [];

  // 获取商户名称（用于匹配发票的收支类型）
  let merchantName = '';
  try {
    const merchantRepository = getRepo(Merchant);
    const merchant = await merchantRepository.findOne({
      where: { id: merchantId },
    });
    if (merchant) {
      merchantName = merchant.name;
    }
  } catch (err) {
    logs.push(
      `获取商户名称失败，将使用默认规则判定发票类型: ${getErrorMessage(err)}`,
    );
  }

  // 封装统一的原始数据抓取逻辑
  const fetchReportRawData = async (
    start: Date,
    end: Date,
    periodLabel: string,
    isComparison = false,
  ): Promise<ReportRawData> => {
    const rawData: ReportRawData = {
      orders: [],
      inventory: [],
      inventoryLogs: [],
      invoices: [],
      financeResources: [],
    };

    // 1. 查询订单数据
    if (dataScopes.includes('order')) {
      try {
        const orderRepository = getRepo(Order);
        const orders = await orderRepository.find({
          where: {
            createdAt: Between(start, end),
            user: {
              merchant: {
                id: merchantId,
              },
            },
          },
          relations: [
            'user',
            'user.merchant',
            'items',
            'items.sku',
            'items.sku.goods',
            'items.sku.goods.category',
          ],
        });

        rawData.orders = orders.map((order): OrderReportRecord => {
          return {
            id: Number(order.id),
            orderNo: order.orderNo,
            createdAt: order.createdAt.toISOString(),
            payAmount: Number(order.payAmount),
            items: (order.items || []).map((item) => {
              const salePrice = Number(item.price || 0);
              return {
                goodsId: item.sku?.goodsId || 0,
                goodsName: item.sku?.goods?.name || item.skuName || '',
                categoryName: item.sku?.goods?.category?.name || '',
                quantity: item.count || 0,
                salePrice,
                costPrice: salePrice * 0.7,
                totalAmount: Number(item.totalPrice || 0),
              };
            }),
          };
        });

        logs.push(
          `[${periodLabel}] 成功收集到 ${rawData.orders.length} 条订单数据`,
        );
      } catch (err) {
        logs.push(`[${periodLabel}] 查询订单数据失败: ${getErrorMessage(err)}`);
      }
    }

    // 2. 查询库存数据（智能区分当前数据 / 对比数据）
    if (dataScopes.includes('inventory')) {
      try {
        // 2.1 当前库存快照（仅当前数据，对比数据不需要）
        if (!isComparison) {
          const inventoryRepository = getRepo(Inventory);
          const inventories = await inventoryRepository.find({
            where: {
              sku: {
                goods: {
                  merchantId,
                },
              },
            },
            relations: ['sku', 'sku.goods', 'sku.goods.category'],
          });

          rawData.inventory = inventories.map((inv): InventoryReportRecord => {
            const salePrice = Number(inv.sku?.price || 0);
            return {
              goodsId: inv.sku?.goodsId || 0,
              goodsName: inv.sku?.goods?.name || '',
              categoryName: inv.sku?.goods?.category?.name || '',
              stock: inv.stock || 0,
              costPrice: salePrice * 0.7,
            };
          });

          logs.push(
            `[${periodLabel}] 成功收集到 ${rawData.inventory.length} 条库存数据（当前库存状态）`,
          );
        }

        // 2.2 时间范围内的库存变动日志（当前数据和对比数据都需要）
        const logRepository = getRepo(InventoryLog);
        const logEntities = await logRepository.find({
          where: {
            inventory: {
              sku: {
                goods: {
                  merchantId,
                },
              },
            },
            createdAt: Between(start, end),
          },
          relations: [
            'inventory',
            'inventory.sku',
            'inventory.sku.goods',
            'inventory.sku.goods.category',
          ],
          order: { createdAt: 'ASC' },
        });

        rawData.inventoryLogs = logEntities.map(
          (log): InventoryLogReportItem => {
            return {
              id: log.id,
              goodsName: log.inventory?.sku?.goods?.name || '',
              categoryName: log.inventory?.sku?.goods?.category?.name || '',
              change: log.change,
              currentStock: log.currentStock,
              type: log.type,
              createdAt: log.createdAt.toISOString(),
            };
          },
        );

        if (rawData.inventoryLogs.length > 0) {
          logs.push(
            `[${periodLabel}] 成功收集到 ${rawData.inventoryLogs.length} 条库存变动日志`,
          );
        }
      } catch (err) {
        logs.push(`[${periodLabel}] 查询库存数据失败: ${getErrorMessage(err)}`);
      }
    }

    // 3. 查询财务提取记录（包含发票和财务资源），在内存中过滤和归类
    const queryInvoice = dataScopes.includes('invoice');
    const queryResource = dataScopes.includes('finance_resource');

    if (queryInvoice || queryResource) {
      try {
        const recordRepository = getRepo(FinanceExtractedRecord);
        // 优先按 extractedDate 过滤，未提取实际日期的按 createdAt 兜底
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        const records = await recordRepository.find({
          where: [
            {
              extractedDate: Between(startStr, endStr),
              sourceFile: { merchantId },
            },
            {
              extractedDate: IsNull(),
              createdAt: Between(start, end),
              sourceFile: { merchantId },
            },
          ],
          relations: ['sourceFile'],
        });

        const getFieldValue = (fields: OcrRawField[], name: string): string => {
          const f = fields?.find((field) => field.name === name);
          return f && f.value !== undefined && f.value !== null
            ? String(f.value)
            : '';
        };

        // 提取发票数据
        if (queryInvoice) {
          const invoices = records.filter((r) => r.recordType === 'invoice');
          rawData.invoices = invoices.map((record): InvoiceReportRecord => {
            const rawDataObj = (record.raw as unknown as OcrRawStructure) || {};
            const structuredFields = rawDataObj.structured_fields || [];
            const buyer = getFieldValue(structuredFields, 'buyer');
            const seller = getFieldValue(structuredFields, 'seller');

            // 判断收支类型
            let type: 'income' | 'expense' = 'expense';
            if (merchantName) {
              if (
                buyer.includes(merchantName) ||
                merchantName.includes(buyer)
              ) {
                type = 'expense';
              } else if (
                seller.includes(merchantName) ||
                merchantName.includes(seller)
              ) {
                type = 'income';
              }
            } else if (buyer) {
              type = 'expense';
            }

            const invoiceNo =
              getFieldValue(structuredFields, 'invoiceNo') ||
              getFieldValue(structuredFields, 'invoiceCode') ||
              '';

            const invoiceDate = record.extractedDate
              ? new Date(record.extractedDate + 'T00:00:00').toISOString()
              : getFieldValue(structuredFields, 'date') ||
                record.createdAt.toISOString();

            const totalAmount = Number(
              getFieldValue(structuredFields, 'totalAmount') ||
                getFieldValue(structuredFields, 'amount') ||
                0,
            );

            const title =
              seller ||
              buyer ||
              String(rawDataObj.summary || '') ||
              `发票_${invoiceNo}`;

            const category =
              getFieldValue(structuredFields, 'category') ||
              getFieldValue(structuredFields, 'serviceType') ||
              undefined;

            return {
              id: record.id,
              invoiceNo,
              invoiceDate,
              amount: totalAmount,
              type,
              title,
              category,
            };
          });

          logs.push(
            `[${periodLabel}] 成功收集到 ${rawData.invoices.length} 条发票数据`,
          );
        }

        // 提取其他财务资源数据
        if (queryResource) {
          const resources = records.filter((r) => r.recordType !== 'invoice');
          rawData.financeResources = resources.map(
            (record): FinanceResourceRecord => {
              const rawDataObj =
                (record.raw as unknown as OcrRawStructure) || {};
              const structuredFields = rawDataObj.structured_fields || [];

              // 提取金额
              let amount: number | undefined = undefined;
              const amountField = structuredFields.find(
                (f) =>
                  f.name === 'amount' ||
                  f.name === 'totalAmount' ||
                  f.name === 'money' ||
                  f.desc?.includes('金额') ||
                  f.desc?.includes('总额'),
              );
              if (
                amountField &&
                amountField.value !== undefined &&
                amountField.value !== null
              ) {
                const val = Number(amountField.value);
                if (!Number.isNaN(val)) {
                  amount = val;
                }
              }

              // 提取标题
              let title = String(rawDataObj.summary || '');
              const titleField = structuredFields.find(
                (f) =>
                  f.name === 'title' ||
                  f.name === 'name' ||
                  f.desc?.includes('标题') ||
                  f.desc?.includes('名称') ||
                  f.desc?.includes('合同名称'),
              );
              if (titleField && titleField.value) {
                title = String(titleField.value);
              }

              return {
                id: record.id,
                recordType: record.recordType || 'general_image',
                createdAt: record.extractedDate
                  ? new Date(record.extractedDate + 'T00:00:00').toISOString()
                  : record.createdAt.toISOString(),
                amount,
                title,
                structuredFields,
              };
            },
          );

          logs.push(
            `[${periodLabel}] 成功收集到 ${rawData.financeResources.length} 条其他财务资源数据`,
          );
        }
      } catch (err) {
        logs.push(
          `[${periodLabel}] 查询财务资源/发票数据失败: ${getErrorMessage(err)}`,
        );
      }
    }

    return rawData;
  };

  // 开始拉取当前区间数据
  const startDate = new Date(state.request.startDate);
  const endDate = new Date(state.request.endDate);
  logs.push(
    `开始收集当前区间数据: ${state.request.startDate} 至 ${state.request.endDate}`,
  );
  const rawData = await fetchReportRawData(
    startDate,
    endDate,
    '当前区间',
    false,
  );

  let comparisonRawData: ReportRawData | undefined = undefined;
  let comparisonRange: ComparisonRange | undefined = undefined;

  // 如果开启了同比环比对比选项，拉取对比时间段的数据
  if (state.request.options?.comparisonAnalysis) {
    try {
      comparisonRange = getComparisonRange(
        state.request.startDate,
        state.request.endDate,
      );
      logs.push(
        `已开启对比分析。对比区间: ${comparisonRange.compareStartDate} 至 ${comparisonRange.compareEndDate} (模式: ${comparisonRange.compareMode})`,
      );

      const compStart = new Date(comparisonRange.compareStartDate);
      const compEnd = new Date(comparisonRange.compareEndDate);
      comparisonRawData = await fetchReportRawData(
        compStart,
        compEnd,
        '对比区间',
        true,
      );
    } catch (err) {
      logs.push(`计算或收集对比区间数据失败: ${getErrorMessage(err)}`);
    }
  }

  return {
    rawData,
    comparisonRawData,
    comparisonRange,
    logs,
  };
};
