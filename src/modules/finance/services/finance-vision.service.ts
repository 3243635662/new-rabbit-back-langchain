import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { QiniuService } from '../../qiniu/qiniu.service';
import { FinanceExtractedRecord } from '../entities/finance-extracted-record.entity';
import { buildVisionGraph } from '../../../langchain/graph/vision/vision-graph.builder';
import { DocumentNormalizerService } from './document-normalizer.service';
import { ModelProviderService } from '../../../langchain/model-provider.service';
import { PostgresCheckpointerProvider } from '../../../langchain/persistence/postgres-checkpointer.provider';
import type { FinanceSourceProgressPhaseValue } from '../../../types/finance.type';

type ProgressFn = (
  progress: number,
  status: FinanceSourceProgressPhaseValue,
  message: string,
) => Promise<void>;

@Injectable()
export class FinanceVisionService implements OnModuleInit {
  private readonly logger = new Logger(FinanceVisionService.name);
  private compiledGraph: ReturnType<typeof buildVisionGraph>;

  constructor(
    private readonly qiniuService: QiniuService,
    @InjectRepository(FinanceExtractedRecord)
    private readonly repo: Repository<FinanceExtractedRecord>,
    private readonly normalizer: DocumentNormalizerService,
    private readonly modelProvider: ModelProviderService,
    private readonly checkpointerProvider: PostgresCheckpointerProvider,
  ) {}

  onModuleInit() {
    const checkpointer = this.checkpointerProvider.getCheckpointer();

    this.compiledGraph = buildVisionGraph({
      qiniuService: this.qiniuService,
      normalizerDeps: {
        pdfToText: (file: string) => this.normalizer.pdfToText(file),
        pdfToImages: (file: string) => this.normalizer.pdfToImages(file),
        docxToText: (file: string) => this.normalizer.docxToText(file),
        docxToImages: (file: string) => this.normalizer.docxToImages(file),
      },
      modelProvider: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        getVisionModel: () => this.modelProvider.getVisionModel() as any,
      },
      repo: this.repo,
      checkpointer,
    });
  }

  async run(
    input: {
      sourceFileId: number;
      qiniuKey: string;
      docType: 'image' | 'pdf' | 'docx';
    },
    pushProgress?: ProgressFn,
  ) {
    try {
      return await this.compiledGraph.invoke(input, {
        configurable: {
          thread_id: `vision::${input.sourceFileId}`,
          pushProgress,
        },
      });
    } finally {
      const TMP_DIR = path.resolve(process.cwd(), '.vision-tmp');
      const dir = path.join(TMP_DIR, `${input.sourceFileId}`);
      try {
        await fsp.rm(dir, { recursive: true, force: true });
        this.logger.log(
          `[sourceFileId:${input.sourceFileId}] 视觉解析临时目录已自动清理: ${dir}`,
        );
      } catch (err) {
        this.logger.warn(`清理视觉解析临时目录失败: ${dir}`, err);
      }
    }
  }
}
