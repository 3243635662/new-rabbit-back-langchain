import { Between, IsNull, Repository, ObjectLiteral } from 'typeorm';
import { Order } from '../../../../modules/order/entities/orders.entity';
import { Inventory } from '../../../../modules/inventory/entities/inventory.entity';
import { InventoryLog } from '../../../../modules/inventory/entities/inventory_logs.entity';
import { FinanceExtractedRecord } from '../../../../modules/finance/entities/finance-extracted-record.entity';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { FinanceReportGraphState } from '../finance-report.annotation';
import type {
  ReportRawData,
  OrderReportRecord,
  FinanceExtractedRecordReport,
  InventoryReportRecord,
  InventoryLogReportItem,
} from '../../../../types/reports/report-raw-data.type';
import { getComparisonRange } from '../../../../utils/timeFormat.util';
import type { ComparisonRange } from '../../../../types/reports/comparison-range.type';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
import { FinanceReportProgressPhase } from '../../../../types/reports/report-status.type';

const getErrorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

export const buildCollectReportDataNode = (deps: FinanceReportNodeDeps) => {
  const anyRepo = (deps.orderRepo ||
    deps.inventoryRepo ||
    deps.financeRecordRepo) as {
    manager: {
      getRepository: <T extends ObjectLiteral>(
        entity: new (...args: any[]) => T,
      ) => Repository<T>;
    };
  };
  const getRepo = <T extends ObjectLiteral>(
    entity: new (...args: any[]) => T,
  ): Repository<T> => {
    return anyRepo.manager.getRepository(entity);
  };

  return async (
    state: FinanceReportGraphState,
    config?: RunnableConfig,
  ): Promise<Partial<FinanceReportGraphState>> => {
    console.log('[Node 2] 进入节点：收集基础业务数据');
    const pushProgress = config?.configurable?.pushProgress as
      | ((progress: number, status: string, message: string) => Promise<void>)
      | undefined;

    await pushProgress?.(
      15,
      FinanceReportProgressPhase.COLLECTING,
      '正在收集基础业务数据...',
    );

    const merchantId = state.user?.merchantId;
    if (!merchantId) {
      return {
        rawData: {
          orders: [],
          inventory: [],
          inventoryLogs: [],
          financeRecords: [],
        },
        logs: ['商户ID缺失，跳过财务原始数据收集'],
      };
    }

    const dataScopes = state.request.dataScopes || [];
    const logs: string[] = [];

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
        financeRecords: [],
      };

      // 1. 查询订单数据（商家收到的订单 = 订单项中 goods.merchantId 匹配的订单）
      // 订单是客户下的，不能按 userId 过滤；应走 items → sku → goods 链找商家的商品
      if (dataScopes.includes('order') && merchantId) {
        try {
          const orderRepository = getRepo(Order);
          const orders = await orderRepository
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.user', 'user')
            .leftJoinAndSelect('user.merchant', 'userMerchant')
            .innerJoin('order.items', 'items')
            .leftJoinAndSelect('items.sku', 'sku')
            .leftJoinAndSelect('sku.goods', 'goods')
            .leftJoinAndSelect('goods.category', 'category')
            .where('order.createdAt BETWEEN :start AND :end', { start, end })
            .andWhere('goods.merchantId = :merchantId', { merchantId })
            .distinct(true)
            .getMany();

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
          logs.push(
            `[${periodLabel}] 查询订单数据失败: ${getErrorMessage(err)}`,
          );
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

            rawData.inventory = inventories.map(
              (inv): InventoryReportRecord => {
                const salePrice = Number(inv.sku?.price || 0);
                return {
                  goodsId: inv.sku?.goodsId || 0,
                  goodsName: inv.sku?.goods?.name || '',
                  categoryName: inv.sku?.goods?.category?.name || '',
                  stock: inv.stock || 0,
                  costPrice: salePrice * 0.7,
                };
              },
            );

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
          logs.push(
            `[${periodLabel}] 查询库存数据失败: ${getErrorMessage(err)}`,
          );
        }
      }

      // 3. 查询财务提取记录（发票 + 合同 + 通用图片等，统一归类）
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

          logs.push(`[${periodLabel}] 查询到 ${records.length} 条财务提取记录`);

          // 按 dataScopes 过滤 recordType
          const filtered: typeof records = [];
          for (const r of records) {
            const rt = r.recordType || '';
            if (queryInvoice && rt === 'invoice') {
              filtered.push(r);
            } else if (queryResource && rt !== 'invoice') {
              filtered.push(r);
            }
          }

          rawData.financeRecords = filtered.map(
            (record): FinanceExtractedRecordReport => ({
              id: record.id,
              recordType: record.recordType || 'general_image',
              extractedDate: record.extractedDate || null,
              raw: record.raw || {},
            }),
          );

          if (rawData.financeRecords.length > 0) {
            logs.push(
              `[${periodLabel}] 归类结果：${rawData.financeRecords.filter((r) => r.recordType === 'invoice').length} 条发票，${rawData.financeRecords.filter((r) => r.recordType !== 'invoice').length} 条其他资源`,
            );
          }
        } catch (err) {
          logs.push(
            `[${periodLabel}] 查询财务提取记录失败: ${getErrorMessage(err)}`,
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
        await pushProgress?.(
          22,
          FinanceReportProgressPhase.COLLECTING_COMPARISON,
          '正在收集对比区间数据...',
        );
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

    console.log('[Node 2] 离开节点，返回数据');
    return {
      rawData,
      comparisonRawData,
      comparisonRange,
      logs,
    };
  };
};
