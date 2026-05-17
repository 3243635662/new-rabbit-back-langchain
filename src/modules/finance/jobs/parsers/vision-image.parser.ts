// src/modules/finance/parsers/vision-image.parser.ts
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { FinanceVisionService } from '../../services/finance-vision.service';
import {
  FinanceSourceProgressPhase,
  type FinanceSourceFileJobData,
  type FinanceSourceProgressPhaseValue,
} from '../../../../types/finance.type';
import { DocType } from '../../../../types/file.type';

@Injectable()
export class VisionImageParser {
  constructor(private readonly visionService: FinanceVisionService) {}

  async parse(
    job: Job<FinanceSourceFileJobData>,
    pushProgress: (
      job: Job<FinanceSourceFileJobData>,
      progress: number,
      status: FinanceSourceProgressPhaseValue,
      message: string,
    ) => Promise<void>,
  ) {
    const { sourceFileId, qiniuKey, docType } = job.data;

    const mapped =
      docType === DocType.PDF
        ? 'pdf'
        : docType === DocType.DOCX
          ? 'docx'
          : 'image';

    await pushProgress(
      job,
      10,
      FinanceSourceProgressPhase.PARSING,
      '准备视觉抽取...',
    );
    await this.visionService.run({ sourceFileId, qiniuKey, docType: mapped });
    await pushProgress(
      job,
      100,
      FinanceSourceProgressPhase.COMPLETED,
      '视觉抽取完成',
    );
  }
}
