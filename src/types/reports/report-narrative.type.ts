export type ReportNarrative = {
  summary: string;
  keyFindings: string[];
  comparison?: string;
  forecast?: string;
  risks: Array<{
    title: string;
    level: 'low' | 'medium' | 'high';
    description: string;
  }>;
  suggestions: string[];
};
