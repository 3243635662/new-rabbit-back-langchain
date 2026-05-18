import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { FinanceVisionService } from '../../services/finance-vision.service';
import {
  FinanceSourceProgressPhase,
  type FinanceSourceFileJobData,
  type FinanceSourceProgressPhaseValue,
} from '../../../../types/finance.type';
import { DocType } from '../../../../types/file.type';

/**
 * 合同解析器
 * 合同通常为 PDF 或 DOCX，走视觉 + 文本双通道解析。
 * 与 VisionImageParser 共用同一个 VisionService 入口，
 * 仅在进度消息上区分语义，方便后续针对合同的特殊逻辑扩展。
 */
@Injectable()
export class ContractParser {
  private readonly logger = new Logger(ContractParser.name);

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
    const { sourceFileId, qiniuKey, docType, fileName } = job.data;
    this.logger.log(`开始处理合同文件: ${fileName}`);

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
      '正在解析合同结构...',
    );

    // 绑定 job，传给 visionService 以便 LangGraph 内也能推送进度
    const boundProgress = (
      progress: number,
      status: FinanceSourceProgressPhaseValue,
      message: string,
    ) => pushProgress(job, progress, status, message);

    await this.visionService.run(
      { sourceFileId, qiniuKey, docType: mapped },
      boundProgress,
    );

    await pushProgress(
      job,
      90,
      FinanceSourceProgressPhase.PERSISTING,
      '合同数据持久化中...',
    );
  }
}
