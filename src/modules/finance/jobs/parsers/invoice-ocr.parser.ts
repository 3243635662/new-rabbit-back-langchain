import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  FinanceSourceProgressPhase,
  type FinanceSourceFileJobData,
  type FinanceSourceProgressPhaseValue,
} from '../../../../types/finance.type';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class InvoiceOcrParser {
  private readonly logger = new Logger(InvoiceOcrParser.name);

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
    this.logger.log(`开始处理发票文件: ${fileName}`);

    await pushProgress(
      job,
      10,
      FinanceSourceProgressPhase.PARSING,
      '正在调用腾讯 OCR 进行识别...',
    );

    // TODO: 接入真实的腾讯 OCR
    await sleep(1500);
  }
}
