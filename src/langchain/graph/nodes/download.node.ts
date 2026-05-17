// src/langchain/graph/vision/nodes/download.node.ts
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { QiniuService } from '../../../modules/qiniu/qiniu.service';
import type { VisionStateType } from '../vision/vision-state.annotation';

const TMP_DIR = path.resolve(process.cwd(), '.vision-tmp');

export const buildDownloadNode = (qiniuService: QiniuService) => {
  return async (state: VisionStateType) => {
    const dir = path.join(TMP_DIR, `${state.sourceFileId}`);
    await fsp.mkdir(dir, { recursive: true });
    const ext = path.extname(state.qiniuKey) || '.bin';
    const localFilePath = path.join(dir, `source${ext}`);
    await qiniuService.downloadToLocal(state.qiniuKey, localFilePath);
    return { localFilePath };
  };
};
