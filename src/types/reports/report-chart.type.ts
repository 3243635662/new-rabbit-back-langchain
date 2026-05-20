export type ReportChart = {
  id: string;
  title: string;
  type: string; // 不限制图表类型，交给 LLM 自由发挥
  echartsOption: unknown;
  description?: string;
};

export type ReportChartResult = {
  charts: ReportChart[];
};
