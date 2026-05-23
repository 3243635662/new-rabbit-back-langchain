import { z } from 'zod';

/**
 * ECharts option 的安全 Schema
 * - series 不可为空（每条图表至少一组数据）
 * - 使用 passthrough 允许 ECharts 其他合法字段（如 color、backgroundColor）
 * - 不在此处校验业务逻辑（如 xAxis/yAxis 存在性 → 放在 sanitize 环节）
 */
export const EchartsOptionSchema = z
  .object({
    title: z.any().optional(),
    tooltip: z.any().optional(),
    legend: z.any().optional(),
    grid: z.any().optional(),
    xAxis: z.any().optional(),
    yAxis: z.any().optional(),
    series: z.array(z.any()).min(1).max(8),
  })
  .passthrough();

/**
 * LLM 输出的单条图表 Schema
 * - id: 只允许小写字母、数字、连字符
 * - title / description: 短字符串，防止过度内容
 * - type: 限定 bar / line / pie
 */
export const LLMReportChartSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, {
      message: '图表 id 只能包含小写字母、数字和连字符',
    }),
  title: z.string().min(1).max(80),
  // 不限制图表类型，交给 LLM 自由发挥（bar、line、pie、radar、gauge、funnel、scatter、heatmap 等均可）
  type: z.string().min(1).max(20),
  description: z.string().max(300).optional(),
  echartsOption: EchartsOptionSchema,
});

/**
 * LLM 输出整体结构：charts 数组
 * - max(5) 匹配 rich 模式上限
 * - basic 模式 2−3、rich 模式 4−5 的校验放在 chart-sanitize 业务逻辑中
 */
export const LLMReportChartResultSchema = z.object({
  charts: z.array(LLMReportChartSchema).min(1).max(5),
});

export type LLMReportChart = z.infer<typeof LLMReportChartSchema>;
export type LLMReportChartResult = z.infer<typeof LLMReportChartResultSchema>;
