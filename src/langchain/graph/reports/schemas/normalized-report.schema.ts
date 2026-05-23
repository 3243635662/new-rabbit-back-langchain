import { z } from 'zod';

const MoneyItemSchema = z.object({
  date: z.string().describe('日期，建议为 ISO 字符串或 YYYY-MM-DD'),
  amount: z.number().describe('金额，必须是数字'),
  source: z
    .string()
    .describe('数据来源，如 order / invoice / finance_resource'),
  title: z.string().describe('项目标题'),
  category: z.string().optional().describe('项目分类'),
});

const SalesByCategorySchema = z.object({
  categoryName: z.string(),
  salesAmount: z.number(),
  quantity: z.number(),
});

const SalesByGoodsSchema = z.object({
  goodsName: z.string(),
  salesAmount: z.number(),
  quantity: z.number(),
  costAmount: z.number(),
});

const InventoryItemSchema = z.object({
  goodsName: z.string(),
  categoryName: z.string(),
  stock: z.number(),
  costPrice: z.number(),
  inventoryValue: z.number(),
});

const CashflowItemSchema = z.object({
  date: z.string(),
  type: z.enum(['inflow', 'outflow']),
  amount: z.number(),
  title: z.string(),
  category: z.string().optional(),
});

export const normalizedReportDataSchema = z.object({
  incomeItems: z.array(MoneyItemSchema),
  costItems: z.array(MoneyItemSchema),
  salesByCategory: z.array(SalesByCategorySchema),
  salesByGoods: z.array(SalesByGoodsSchema),
  inventoryItems: z.array(InventoryItemSchema),
  cashflowItems: z.array(CashflowItemSchema),
});

export type NormalizedReportDataSchemaType = z.infer<
  typeof normalizedReportDataSchema
>;
