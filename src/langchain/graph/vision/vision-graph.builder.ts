import { StateGraph, START, END } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Repository } from 'typeorm';
import type { QiniuService } from '../../../modules/qiniu/qiniu.service';
import type { FinanceExtractedRecord } from '../../../modules/finance/entities/finance-extracted-record.entity';
import { VisionStateAnnotation } from './vision-state.annotation';
import { buildDownloadNode } from '../nodes/download.node';
import { buildNormalizeNode } from '../nodes/normalize.node';
import { buildExtractNode } from '../nodes/extract.node';
import { buildExtractDateNode } from '../nodes/extract-date.node';
import { buildMergeNode } from '../nodes/merge.node';
import { buildPersistNode } from '../nodes/persist.node';

export const buildVisionGraph = (deps: {
  qiniuService: QiniuService;
  normalizerDeps: Parameters<typeof buildNormalizeNode>[0];
  modelProvider: {
    getVisionModel: () => BaseChatModel;
  };
  repo: Repository<FinanceExtractedRecord>;
  checkpointer?: BaseCheckpointSaver;
}) => {
  const graph = new StateGraph(VisionStateAnnotation)
    .addNode('download', buildDownloadNode(deps.qiniuService))
    .addNode('normalize', buildNormalizeNode(deps.normalizerDeps))
    .addNode('extract', buildExtractNode(deps.modelProvider.getVisionModel))
    .addNode(
      'extract-date',
      buildExtractDateNode(deps.modelProvider.getVisionModel),
    )
    .addNode('merge', buildMergeNode())
    .addNode('persist', buildPersistNode(deps.repo))
    .addEdge(START, 'download')
    .addEdge('download', 'normalize')
    .addEdge('normalize', 'extract')
    .addEdge('extract', 'extract-date')
    .addEdge('extract-date', 'merge')
    .addEdge('merge', 'persist')
    .addEdge('persist', END);

  return graph.compile({
    checkpointer: deps.checkpointer,
  });
};
