import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  FinanceSourceProgressPhase,
  type FinanceSourceFileJobData,
  type FinanceSourceProgressPhaseValue,
} from '../../../../types/finance.type';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class ContractParser {
  private readonly logger = new Logger(ContractParser.name);

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
    this.logger.log(`开始处理合同文件: ${fileName}`);

    await pushProgress(
      job,
      10,
      FinanceSourceProgressPhase.PARSING,
      '正在提取合同文字结构...',
    );

    // TODO: 接入真实的文本提取逻辑
    await sleep(1500);
  }
}
