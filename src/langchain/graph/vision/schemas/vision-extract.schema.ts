// src/langchain/graph/vision/schemas/vision-extract.schema.ts
import { z } from 'zod';

export const visionExtractSchema = z.object({
  documentType: z.string(),
  title: z.string().nullable(),
  summary: z.string(),
  occurredAt: z.string().nullable(),
  amount: z.number().nullable(),
  totalAmount: z.number().nullable(),
  currency: z.string().default('CNY'),
  counterparty: z.string().nullable(),
  category: z.string().nullable(),
  keyFields: z.record(z.string(), z.any()).default({}),
  warnings: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.8),
});

export type VisionExtractRecord = z.infer<typeof visionExtractSchema>;
