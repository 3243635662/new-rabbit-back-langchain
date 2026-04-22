import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Sse,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import Redis from 'ioredis';
import { KnowledgeBaseService } from './knowledge-base.service';
import { RedisService } from '../../modules/db/redis/redis.service';
import { resFormatMethod } from '../../utils/resFormat.util';
import { JwtPayloadType } from '../../types/auth.type';
import { RedisKeys } from '../../common/constants/redis-key.constant';

interface ProgressPayload {
  status: string;
  progress?: number;
  message?: string;
  failReason?: string;
  [key: string]: unknown;
}

interface SseEvent {
  data: unknown;
}

@Controller('knowledge-base')
export class KnowledgeBaseController {
  private readonly logger = new Logger(KnowledgeBaseController.name);

  constructor(
    private readonly kbService: KnowledgeBaseService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * GET /knowledge-base/presign?fileName=xxx
   * 客户端请求直传七牛的凭证（uploadToken + key + domain）
   * 服务器不接触文件内容，零内存/带宽消耗
   */
  @Get('presign')
  async presign(
    @Query('fileName') fileName: string,
    @Req() req: { user: JwtPayloadType },
  ) {
    if (!fileName) {
      return resFormatMethod(1, 'fileName 不能为空', null);
    }
    const result = await this.kbService.generatePresign(fileName, req.user.id);
    return resFormatMethod(0, 'success', result);
  }

  /**
   * POST /knowledge-base/confirm
   * 客户端直传七牛成功后，回调此接口确认 → 入库 + 入队
   * Body: { qiniuKey, fileName, mimeType, fileSize }
   */
  @Post('confirm')
  async confirm(
    @Body()
    body: {
      qiniuKey: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
    },
    @Req() req: { user: JwtPayloadType },
  ) {
    const result = await this.kbService.confirmUpload(body, req.user.id);
    return resFormatMethod(0, '已入队，处理中', result);
  }

  /**
   * GET /knowledge-base/task/:taskId
   * 查询任务处理进度
   */
  @Get('task/:taskId')
  async getTaskStatus(@Param('taskId') taskId: string) {
    const result = await this.kbService.getTaskStatus(taskId);
    return resFormatMethod(0, 'success', result);
  }

  /**
   * GET /knowledge-base/list
   * 查询当前商户的知识库文档列表
   */
  @Get('list')
  async list(@Req() req: { user: JwtPayloadType }) {
    const result = await this.kbService.listByMerchant(req.user.id);
    return resFormatMethod(0, 'success', result);
  }

  /**
   * DELETE /knowledge-base/:id
   * 删除知识库文档
   */
  @Delete(':id')
  async remove(@Param('id') id: number, @Req() req: { user: JwtPayloadType }) {
    const result = await this.kbService.remove(id, req.user.id);
    return resFormatMethod(0, '删除成功', result);
  }

  /**
   * SSE /knowledge-base/progress/:taskId
   * 实时推送 RAG 解析进度（EventSource）
   */
  @Sse('progress/:taskId')
  progressSse(@Param('taskId') taskId: string): Observable<SseEvent> {
    return new Observable((observer) => {
      const channel = RedisKeys.RAG.getProgressChannel(taskId);
      let subClient: Redis | null = null;

      const init = async () => {
        try {
          //  先推缓存的最新状态
          const cached = (await this.redisService.getProgressCache(
            taskId,
          )) as ProgressPayload | null;
          if (cached) {
            observer.next({ data: cached });
            if (cached.status === 'completed' || cached.status === 'failed') {
              observer.complete();
              return;
            }
          }

          //  Redis 订阅
          subClient = this.redisService.createSubscriber();
          void subClient.subscribe(channel, (err: Error | null) => {
            if (err) {
              this.logger.error(`SSE 订阅失败 [${taskId}]: ${err.message}`);
              observer.error(err);
            }
          });

          subClient.on('message', (_: string, message: string) => {
            try {
              const data = JSON.parse(message) as ProgressPayload;
              observer.next({ data });
              if (data.status === 'completed' || data.status === 'failed') {
                observer.complete();
                if (subClient) {
                  subClient.unsubscribe(channel).catch(() => {});
                }
              }
            } catch {
              observer.next({ data: message });
            }
          });
        } catch (err) {
          observer.error(err);
        }
      };
      //  不等待它执行完，让 Observable 立即返回，订阅逻辑异步执行。
      void init();

      // 清理 防内存泄露
      return () => {
        if (subClient) {
          subClient.unsubscribe(channel).catch(() => {});
          subClient.quit().catch(() => {});
        }
      };
    });
  }
}
