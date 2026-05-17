// src/langchain/graph/vision/schemas/vision-extract.schema.ts
import { z } from 'zod';

export const visionExtractSchema = z.object({
  document_type: z.string().default('unknown'),
  summary: z.string().default(''),
  process_time: z.string().default(() => new Date().toISOString()),
  structured_fields: z
    .array(
      z.object({
        name: z.string(),
        desc: z.string(),
        value: z.any(),
        confidence: z.number().default(0.9),
      }),
    )
    .default([]),
});

export type VisionExtractRecord = z.infer<typeof visionExtractSchema>;
