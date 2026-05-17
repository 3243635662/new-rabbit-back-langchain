import { StateGraph, START, END } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Repository } from 'typeorm';
import type { QiniuService } from '../../../modules/qiniu/qiniu.service';
import type { FinanceExtractedRecord } from '../../../modules/finance/entities/finance-extracted-record.entity';
import {
  VisionStateAnnotation,
  VisionStateType,
} from './vision-state.annotation';
import { buildDownloadNode } from '../nodes/download.node';
import { buildNormalizeNode } from '../nodes/normalize.node';
import { buildExtractNode } from '../nodes/extract.node';
import { buildMergeNode } from '../nodes/merge.node';
import { buildUpgradeExtractNode } from '../nodes/upgrade-extract.node';
import { buildPersistNode } from '../nodes/persist.node';

export const buildVisionGraph = (deps: {
  qiniuService: QiniuService;
  normalizerDeps: Parameters<typeof buildNormalizeNode>[0];
  modelProvider: {
    getVisionModel: () => BaseChatModel;
    getStrongVisionModel: () => BaseChatModel;
  };
  repo: Repository<FinanceExtractedRecord>;
  checkpointer?: BaseCheckpointSaver;
}) => {
  const confidenceGate = (state: VisionStateType) => {
    const c = state.merged?.confidence ?? 0;
    if (state.upgraded) return 'persist';
    return c >= 0.85 ? 'persist' : 'upgrade';
  };

  const graph = new StateGraph(VisionStateAnnotation)
    .addNode('download', buildDownloadNode(deps.qiniuService))
    .addNode('normalize', buildNormalizeNode(deps.normalizerDeps))
    .addNode('extract', buildExtractNode(deps.modelProvider.getVisionModel))
    .addNode('merge', buildMergeNode())
    .addNode(
      'upgrade',
      buildUpgradeExtractNode(deps.modelProvider.getStrongVisionModel),
    )
    .addNode('persist', buildPersistNode(deps.repo))
    .addEdge(START, 'download')
    .addEdge('download', 'normalize')
    .addEdge('normalize', 'extract')
    .addEdge('extract', 'merge')
    .addConditionalEdges('merge', confidenceGate, {
      upgrade: 'upgrade',
      persist: 'persist',
    })
    .addEdge('upgrade', 'merge')
    .addEdge('persist', END);

  return graph.compile({
    checkpointer: deps.checkpointer,
  });
};
