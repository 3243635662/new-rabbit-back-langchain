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
      const buyer = getVal('购买方名称');

      // 提取金额并去除可能存在的非数字字符（保留小数点和负号）
      const parseAmount = (key1: string, key2?: string): number => {
        const valStr = getVal(key1) || (key2 ? getVal(key2) : null) || '0';
        const parsed = parseFloat(valStr.replace(/[^\d.-]/g, ''));
        return isNaN(parsed) ? 0 : parsed;
      };

      const amount = parseAmount('合计金额', '金额');
      const taxAmount = parseAmount('合计税额', '税额');
      // 优先使用小写金额（数字格式），价税合计可能是中文大写
      const totalAmount = parseAmount('小写金额', '价税合计');

      // 发票分类推断
      const rawServiceType = getVal('服务类型') || getVal('发票消费类型');
      const itemNames = items.map((it) => it.Name || '').join(',');

      let category = '其他费用';
      if (rawServiceType) {
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
        else if (/(电脑|桌|椅|机)/.test(itemNames)) category = '办公设备';
        else if (/(快递|运费|物流)/.test(itemNames)) category = '物流费用';
        else if (/(餐饮|餐费|招待)/.test(itemNames)) category = '餐饮招待';
        else category = '通用采购';
      }

      const firstItemName = items[0]?.Name || category;
      const summary = seller
        ? `向 ${seller} 采购：${firstItemName}`
        : `采购：${firstItemName}`;

      const record: FinanceVatInvoiceRecord = {
        recordType: 'invoice',
        date: getVal('开票日期'),
        amount: amount || totalAmount - taxAmount,
        taxAmount,
        totalAmount,
        seller,
        buyer,
        category,
        invoiceNo: getVal('发票号码'),
        counterparty: seller,
        confidence: 0.95,
        summary,
      };

      return {
        record,
        rawText: '',
        warnings: [],
        fields,
        items,
        rawResponse: response,
      };
    } catch (error) {
      this.logger.error('发票OCR识别异常', error);
      throw error;
    }
  }
}
