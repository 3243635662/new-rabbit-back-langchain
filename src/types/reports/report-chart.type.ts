export type ReportChart = {
  id: string;
  title: string;
  type: 'bar' | 'line' | 'pie';
  echartsOption: any;
  description?: string;
};

export type ReportChartResult = {
  charts: ReportChart[];
};
