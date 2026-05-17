export interface ExtractedField {
  name: string;
  desc: string;
  value: unknown;
}

/**
 * 🛠️ 财务抽取数据二次优化与标准化工具 🛠️
 * 将 AI/OCR 返回的各种特定、扁平或混乱的字段映射优化为统一的前端友好型 [{ name, desc, value }] 结构。
 */
export function normalizeExtractedFields(
  recordData: Record<string, any>,
): ExtractedField[] {
  const fields: ExtractedField[] = [];

  // 1. 标准核心财务字段映射定义
  const coreFieldsConfig = [
    { key: 'recordType', name: 'recordType', desc: '单据类型' },
    { key: 'occurredAt', name: 'occurredAt', desc: '发生日期' },
    { key: 'amount', name: 'amount', desc: '金额 (不含税)' },
    { key: 'taxAmount', name: 'taxAmount', desc: '税额' },
    { key: 'totalAmount', name: 'totalAmount', desc: '含税总额' },
    { key: 'taxRate', name: 'taxRate', desc: '税率' },
    { key: 'currency', name: 'currency', desc: '币种' },
    { key: 'counterparty', name: 'counterparty', desc: '交易对方' },
    { key: 'category', name: 'category', desc: '业务分类' },
    { key: 'documentNo', name: 'documentNo', desc: '单据编号' },
    { key: 'summary', name: 'summary', desc: '内容摘要' },
  ];

  for (const config of coreFieldsConfig) {
    const val = recordData[config.key] as unknown;
    if (
      val !== null &&
      val !== undefined &&
      val !== '' &&
      val !== '0.00' &&
      val !== '0.0000'
    ) {
      let formattedVal: unknown = val;
      // 数值或税率格式化
      if (['amount', 'taxAmount', 'totalAmount'].includes(config.name)) {
        formattedVal = Number(val);
      } else if (config.name === 'taxRate') {
        formattedVal = `${(Number(val as any) * 100).toFixed(0)}%`;
      } else if (config.name === 'occurredAt') {
        formattedVal =
          val instanceof Date
            ? val.toISOString().split('T')[0]
            : typeof val === 'string' || typeof val === 'number'
              ? String(val).split('T')[0]
              : '';
      }
      fields.push({
        name: config.name,
        desc: config.desc,
        value: formattedVal,
      });
    }
  }

  // 2. 深度处理并规一化特定要素字典 (从 keyFields / record 或顶层提取)
  const keyFields = (recordData.keyFields ||
    recordData.record ||
    recordData ||
    {}) as Record<string, unknown>;

  // 常见财务/契约中文 Key 与英文 CamelCase 变量名的完美映射词典
  const commonKeyMap: Record<string, { name: string; desc: string }> = {
    发票号码: { name: 'invoiceNo', desc: '发票号码' },
    发票代码: { name: 'invoiceCode', desc: '发票代码' },
    开票日期: { name: 'issueDate', desc: '开票日期' },
    购方名称: { name: 'buyerName', desc: '购方名称' },
    购方识别号: { name: 'buyerTaxId', desc: '购方纳税人识别号' },
    购方地址电话: { name: 'buyerAddressPhone', desc: '购方地址电话' },
    购方开户行及账号: { name: 'buyerBankInfo', desc: '购方开户行及账号' },
    销方名称: { name: 'sellerName', desc: '销方名称' },
    销方识别号: { name: 'sellerTaxId', desc: '销方纳税人识别号' },
    销方地址电话: { name: 'sellerAddressPhone', desc: '销方地址电话' },
    销方开户行及账号: { name: 'sellerBankInfo', desc: '销方开户行及账号' },
    项目名称: { name: 'itemName', desc: '项目名称' },
    规格型号: { name: 'specification', desc: '规格型号' },
    单位: { name: 'unit', desc: '单位' },
    数量: { name: 'quantity', desc: '数量' },
    单价: { name: 'unitPrice', desc: '单价' },
    金额: { name: 'amount', desc: '金额' },
    税率: { name: 'taxRate', desc: '税率' },
    税额: { name: 'taxAmount', desc: '税额' },
    价税合计: { name: 'totalAmount', desc: '价税合计' },
    '价税合计(大写)': { name: 'totalAmountWords', desc: '价税合计(大写)' },
    收款人: { name: 'payee', desc: '收款人' },
    复核: { name: 'checker', desc: '复核人' },
    开票人: { name: 'issuer', desc: '开票人' },
    合同名称: { name: 'contractName', desc: '合同名称' },
    合同编号: { name: 'contractNo', desc: '合同编号' },
    签约时间: { name: 'signDate', desc: '签约时间' },
    签约双方: { name: 'signParties', desc: '签约双方' },
    签约对方: { name: 'counterparty', desc: '签约对方' },
    寄件人: { name: 'sender', desc: '寄件人' },
    收件人: { name: 'recipient', desc: '收件人' },
    托寄物内容: { name: 'itemDescription', desc: '托寄物内容' },
    实际重量: { name: 'weight', desc: '实际重量' },
    快递单号: { name: 'expressNo', desc: '快递单号' },
    运单号: { name: 'waybillNo', desc: '运单号' },
    车牌号: { name: 'plateNumber', desc: '车牌号' },
    备注: { name: 'remarks', desc: '备注' },
  };

  const excludeKeys = [
    'documentType',
    'title',
    'summary',
    'occurredAt',
    'amount',
    'taxAmount',
    'totalAmount',
    'taxRate',
    'currency',
    'counterparty',
    'category',
    'documentNo',
    'warnings',
    'confidence',
    'raw',
    'id',
    'createdAt',
    'sourceFileId',
    'recordType',
  ];

  if (typeof keyFields === 'object' && keyFields !== null) {
    for (const [key, val] of Object.entries(keyFields)) {
      if (excludeKeys.includes(key)) {
        continue;
      }

      if (val !== null && val !== undefined && val !== '') {
        const mapped = commonKeyMap[key];
        if (mapped) {
          if (!fields.some((f) => f.name === mapped.name)) {
            fields.push({
              name: mapped.name,
              desc: mapped.desc,
              value: val,
            });
          }
        } else {
          // 自定义英文变量名：过滤非英文字符并生成英文命名标识
          const safeName = key.replace(/[^\w\u4e00-\u9fa5]/g, '').toLowerCase();
          if (!fields.some((f) => f.name === safeName || f.desc === key)) {
            fields.push({
              name: safeName,
              desc: key,
              value: val,
            });
          }
        }
      }
    }
  }

  return fields;
}
