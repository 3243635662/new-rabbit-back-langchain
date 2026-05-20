import { z } from 'zod';

export const ReportNarrativeRiskSchema = z.object({
  title: z.string().min(1).max(80),
  level: z.enum(['low', 'medium', 'high']),
  description: z.string().min(1).max(300),
});

export const LLMReportNarrativeSchema = z.object({
  summary: z.string().min(1).max(800),
  keyFindings: z.array(z.string().min(1).max(300)).min(1).max(8),
  comparison: z.string().max(600).optional(),
  forecast: z.string().max(600).optional(),
  risks: z.array(ReportNarrativeRiskSchema).max(6),
  suggestions: z.array(z.string().min(1).max(300)).min(1).max(8),
});

export type LLMReportNarrative = z.infer<typeof LLMReportNarrativeSchema>;
