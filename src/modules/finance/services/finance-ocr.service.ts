import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fsp from 'fs/promises';
import { ocr } from 'tencentcloud-sdk-nodejs-ocr';
import type {
  FinanceVatInvoiceRecord,
  FinanceVatInvoiceOcrResult,
} from '../../../types/finance.type';
const OcrClient = ocr.v20181119.Client;

@Injectable()
export class FinanceOcrService {
  private readonly logger = new Logger(FinanceOcrService.name);
  private readonly client: InstanceType<typeof OcrClient>;

  constructor(private readonly configService: ConfigService) {
    const secretId = configService.get<string>('TENCENT_OCR_SECRET_ID');
    const secretKey = configService.get<string>('TENCENT_OCR_SECRET_KEY');

    if (!secretId || !secretKey) {
      this.logger.warn(
        'OCR 密钥缺失，请在环境变量中配置 TENCENT_OCR_SECRET_ID 和 TENCENT_OCR_SECRET_KEY',
      );
    }
    this.client = new OcrClient({
      credential: {
        secretId,
        secretKey,
      },
      region: '',
      profile: {
        httpProfile: {
          endpoint: 'ocr.tencentcloudapi.com',
        },
      },
    });
  }

  async recognizeVatInvoice(params: {
    localPath: string;
    isPdf?: boolean;
    pdfPageNumber?: number;
  }): Promise<FinanceVatInvoiceOcrResult> {
    const { localPath, isPdf = false, pdfPageNumber = 1 } = params;

    // 文件大小已在 parser 中检查（限制 7MB），这里仅做二次校验
    const stat = await fsp.stat(localPath);
    if (stat.size > 7 * 1024 * 1024) {
      return {
        record: null,
        rawText: '',
        warnings: ['文件过大，无法进行 OCR 识别（原文件应小于 7MB）'],
        fields: {},
        items: [],
        rawResponse: null,
      };
    }

    const buffer = await fsp.readFile(localPath);
    const imageBase64 = buffer.toString('base64');

    const request: Record<string, any> = {
      ImageBase64: imageBase64,
    };

    if (isPdf) {
      request.IsPdf = true;
      request.PdfPageNumber = pdfPageNumber;
    }

    try {
      const response = await this.client.VatInvoiceOCR(request);

      const infos = response.VatInvoiceInfos || [];
      const items = response.Items || [];

      if (infos.length === 0) {
        return {
          record: null,
          rawText: '',
          warnings: ['未能识别到发票有效字段信息'],
          fields: {},
          items: [],
          rawResponse: response,
        };
      }

      // 将数组转换为字典，方便后续读取
      const fields: Record<string, string> = {};
      for (const info of infos) {
        if (info.Name && info.Value) {
          fields[info.Name] = info.Value;
        }
      }

      const getVal = (name: string) => fields[name] || null;

      const seller = getVal('销售方名称');
      // buyer 已在 record 对象中使用 getVal('购买方名称') 获取

      // 提取金额并去除可能存在的非数字字符（保留小数点和负号）
      const parseAmount = (...keys: string[]): number => {
        for (const key of keys) {
          const valStr = getVal(key);
          if (valStr) {
            const parsed = parseFloat(valStr.replace(/[^\d.-]/g, ''));
            if (!isNaN(parsed)) return parsed;
          }
        }
        return 0;
      };

      const amount = parseAmount('合计金额', '金额');
      const taxAmount = parseAmount('合计税额', '税额');
      // 优先使用小写金额（数字格式），价税合计可能是中文大写
      const totalAmount = parseAmount('价税合计(小写)', '小写金额', '价税合计');

      // 提取税率（从第一条明细项获取）
      const taxRateRaw = items[0]?.TaxRate || null;
      const taxRate = taxRateRaw
        ? parseFloat(String(taxRateRaw).replace(/[^\d.]/g, '')) / 100
        : null;

      // 发票分类推断
      const rawServiceType = getVal('服务类型') || getVal('发票消费类型');
      const itemNames = items.map((it) => it.Name || '').join(',');

      let category = '其他费用';

      // 尝试从明细项名称中的 * 分类 * 提取
      const firstItemNameRaw = items[0]?.Name || '';
      const categoryMatch = firstItemNameRaw.match(/\*(.*?)\*/);

      if (categoryMatch && categoryMatch[1]) {
        category = categoryMatch[1];
      } else if (rawServiceType) {
        if (
          rawServiceType.includes('运输') ||
          rawServiceType.includes('物流')
        ) {
          category = '物流费用';
        } else if (rawServiceType.includes('餐饮')) {
          category = '餐饮招待';
        } else if (
          rawServiceType.includes('咨询') ||
          rawServiceType.includes('服务')
        ) {
          category = '外部服务';
        } else {
          category = rawServiceType;
        }
      } else if (itemNames) {
        if (/(笔|纸|本|文具)/.test(itemNames)) category = '办公用品';
        else if (
          /(手机|智能手机|iphone|小米|华为|oppo|vivo)/i.test(itemNames)
        ) {
          category = '电子产品';
        } else if (
          /(电脑|笔记本|显示器|打印机|复印机|扫描仪|服务器)/.test(itemNames)
        ) {
          category = '办公设备';
        } else if (/(快递|运费|物流)/.test(itemNames)) category = '物流费用';
        else if (/(餐饮|餐费|招待)/.test(itemNames)) category = '餐饮招待';
        else category = '通用采购';
      }

      const firstItemName = items[0]?.Name || category;
      const summary = seller
        ? `向 ${seller} 采购：${firstItemName}`
        : `采购：${firstItemName}`;

      const record: FinanceVatInvoiceRecord = {
        // 基础信息
        recordType: 'invoice',
        invoiceCode: getVal('发票代码'),
        invoiceNo: getVal('发票号码'),
        date: getVal('开票日期'),

        // 金额相关
        amount:
          amount > 0 ? amount : totalAmount > 0 ? totalAmount - taxAmount : 0,
        taxAmount,
        totalAmount,
        taxRate,

        // 购买方信息
        buyer: getVal('购买方名称'),
        buyerTaxId: getVal('购买方识别号'),
        buyerAddressPhone: getVal('购买方地址电话'),
        buyerBankInfo: getVal('购买方开户行及账号'),

        // 销售方信息
        seller: getVal('销售方名称'),
        sellerTaxId: getVal('销售方识别号'),
        sellerAddressPhone: getVal('销售方地址电话'),
        sellerBankInfo: getVal('销售方开户行及账号'),

        // 其他信息
        category,
        counterparty: seller,
        confidence: 0.95,
        summary,

        // 备注和开票人信息
        remark: getVal('备注'),
        payee: getVal('收款人'),
        checker: getVal('复核'),
        issuer: getVal('开票人'),

        // 发票类型信息
        invoiceType: getVal('发票类型'),
        serviceType: getVal('服务类型') || getVal('发票消费类型'),
      };

      // 清洗 items：将带千分位的金额字符串转换为标准数字，供大模型更好分析
      const cleanedItems = items.map((item) => {
        const parseItemNum = (
          val: string | number | undefined | null,
        ): number | string | null => {
          if (val == null || val === '') return null;
          const strVal = typeof val === 'number' ? val.toString() : val;
          const parsed = parseFloat(strVal.replace(/[^\d.-]/g, ''));
          return isNaN(parsed) ? strVal : parsed;
        };

        const taxRateRaw = item.TaxRate as string | number | undefined | null;
        let taxRateParsed: number | null = null;
        if (typeof taxRateRaw === 'string' || typeof taxRateRaw === 'number') {
          taxRateParsed =
            parseFloat(taxRateRaw.toString().replace(/[^\d.]/g, '')) / 100;
        }

        return {
          ...item,
          Quantity: parseItemNum(
            item.Quantity as string | number | undefined | null,
          ),
          UnitPrice: parseItemNum(
            item.UnitPrice as string | number | undefined | null,
          ),
          AmountWithoutTax: parseItemNum(
            item.AmountWithoutTax as string | number | undefined | null,
          ),
          TaxAmount: parseItemNum(
            item.TaxAmount as string | number | undefined | null,
          ),
          TaxRate:
            taxRateParsed != null && !isNaN(taxRateParsed)
              ? taxRateParsed
              : taxRateRaw,
        };
      });

      return {
        record,
        rawText: '',
        warnings: [],
        fields,
        items: cleanedItems,
        rawResponse: response,
      };
    } catch (error) {
      this.logger.error('发票OCR识别异常', error);
      throw error;
    }
  }
}
