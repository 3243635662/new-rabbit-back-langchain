/**
 * 财务报表生成任务状态枚举
 * 对应 finance_report 表的 status 字段
 */
export enum FinanceReportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * 财务报表生成进度阶段常量
 * 用于 SSE / Redis 进度推送的 status 字段
 */
export const FinanceReportProgressPhase = {
  RECEIVED: 'received',
  STARTED: 'started',
  VALIDATING: 'validating',
  COLLECTING: 'collecting',
  COLLECTING_COMPARISON: 'collectingComparison',
  NORMALIZING: 'normalizing',
  CALCULATING: 'calculating',
  BUILDING_CHARTS: 'buildingCharts',
  GENERATING_NARRATIVE: 'generatingNarrative',
  GENERATING_HTML: 'generatingHtml',
  RENDERING: 'rendering',
  UPLOADING: 'uploading',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type FinanceReportProgressPhaseValue =
  (typeof FinanceReportProgressPhase)[keyof typeof FinanceReportProgressPhase];
