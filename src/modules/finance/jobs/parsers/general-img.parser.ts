import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  FinanceSourceProgressPhase,
  type FinanceSourceFileJobData,
  type FinanceSourceProgressPhaseValue,
} from '../../../../types/finance.type';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class GeneralImgParser {
  private readonly logger = new Logger(GeneralImgParser.name);

  async parse(
    job: Job<FinanceSourceFileJobData>,
    pushProgress: (
      job: Job<FinanceSourceFileJobData>,
      progress: number,
      status: FinanceSourceProgressPhaseValue,
      message: string,
    ) => Promise<void>,
  ) {
    const { fileName } = job.data;
    this.logger.log(`开始处理通用图片: ${fileName}`);

    await pushProgress(
      job,
      10,
      FinanceSourceProgressPhase.PARSING,
      '正在调用视觉 LLM 进行扫描...',
    );

    // TODO: 接入真实的视觉 LLM
    await sleep(1500);
  }
}
