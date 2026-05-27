import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ModelProviderService } from './model-provider.service';
import { AgentsService } from './agents/agents.service';
import { Merchant } from '../modules/merchant/entities/merchant.entity';
import { JwtPayloadType } from '../types/auth.type';
import { AgentRuntimeContext } from '../types/agent.type';

@Injectable()
export class LangChainService {
  private readonly logger = new Logger(LangChainService.name);
  /** 每个 session 当前 SSE 流对应的 AbortController（供 stop 接口中断） */
  private readonly activeStreams = new Map<string, AbortController>();

  constructor(
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    private readonly modelProviderService: ModelProviderService,
    @Inject(forwardRef(() => AgentsService))
    private readonly agentsService: AgentsService,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
  ) {}

  getModel = () => this.modelProviderService.getModel();

  /** SSE 长连接：关闭代理缓冲、取消服务端超时 */
  prepareStreamingChatResponse(res: Response): void {
    res.setTimeout(0);
    res.setHeader('X-Accel-Buffering', 'no');
  }

  /**
   * 中断指定 session 的流式对话（若存在进行中的 SSE）
   * @returns 是否成功触发了 abort
   */
  tryAbortStreamingChat(sessionId: string): boolean {
    const controller = this.activeStreams.get(sessionId);
    if (controller && !controller.signal.aborted) {
      controller.abort();
      return true;
    }
    return false;
  }

  // 构建 Agent 运行上下文
  private buildAgentContext = async (
    req: { user: JwtPayloadType; merchantId?: string; goodsId?: string },
    sessionId?: string,
  ): Promise<AgentRuntimeContext> => {
    let merchantId: string | undefined;

    if (req.user.roleId === 2) {
      // 商家：从数据库查询关联的 merchantId
      const merchant = await this.merchantRepo.findOne({
        where: { userId: req.user.id },
        select: ['id'],
      });
      if (merchant) {
        merchantId = merchant.id.toString();
      }
    } else if (req.user.roleId === 3) {
      // 客户：从请求参数中获取当前商家 ID
      merchantId = req.merchantId;
    }

    // 构建当前时间字符串，供 LLM 理解时间上下文
    const now = new Date();
    const currentTime =
      `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ` +
      `(${now.toLocaleDateString('zh-CN', { weekday: 'long' })}) ` +
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    console.log(
      '所有的上下文 user:',
      req.user,
      'sessionId',
      sessionId,
      'merchantId',
      merchantId,
      'goodsId',
      req.goodsId,
      'currentTime',
      currentTime,
    );

    return {
      ...req.user,
      sessionId: sessionId || 'default-session',
      merchantId,
      goodsId: req.goodsId || undefined,
      currentTime,
    };
  };

  /**
   * 智能对话流式 SSE：Agent 生成 → 逐块推送 → 落 Redis / 异步同步 MySQL
   * @param merchantId 商家 ID（客户端用户访问时从 URL 参数传递）
   */
  createStreamingChatObservable(
    sessionId: string,
    message: string,
    req: { user: JwtPayloadType; merchantId?: string },
    res: Response,
  ): Observable<MessageEvent> {
    const abortController = new AbortController();
    this.activeStreams.set(sessionId, abortController);

    res.on('close', () => {
      abortController.abort();
      this.activeStreams.delete(sessionId);
    });

    return new Observable<MessageEvent>((subscriber) => {
      void (async () => {
        try {
          const context = await this.buildAgentContext(req, sessionId);

          await this.chatService.appendMessage(sessionId, 'human', message);

          const agentStream = this.agentsService.runAgentStream(
            message,
            context,
            abortController.signal,
          );

          let fullContent = '';
          let fullReasoning = '';
          const toolEvents: Array<Record<string, unknown>> = [];

          for await (const chunk of agentStream) {
            if (abortController.signal.aborted) {
              break;
            }

            fullContent += chunk.content || '';
            if (chunk.type === 'content') {
              fullReasoning += chunk.reasoning || '';
            }
            if (chunk.type === 'tool_start' || chunk.type === 'tool_end') {
              toolEvents.push(chunk as unknown as Record<string, unknown>);
            }
            subscriber.next({
              data: JSON.stringify(chunk),
            } as MessageEvent);
          }

          if (abortController.signal.aborted) {
            subscriber.next({
              data: JSON.stringify({ type: 'stopped', content: fullContent }),
            } as MessageEvent);
          }

          if (fullContent) {
            await this.chatService.appendMessage(
              sessionId,
              'ai',
              fullContent,
              fullReasoning || undefined,
              toolEvents.length > 0 ? toolEvents : undefined,
            );

            this.chatService.syncToMySQL(sessionId).catch((err) => {
              this.logger.error(`异步同步失败:`, err);
            });
          }

          subscriber.complete();
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          // AbortError 是客户端主动断开 SSE 连接触发的正常取消，不属于异常
          if (err.name === 'AbortError') {
            this.logger.log(
              `[SSE] session=${sessionId} 连接已中断，流式输出取消`,
            );
          } else {
            this.logger.error(
              `[SSE] session=${sessionId} error=${err.message}`,
              err.stack,
            );
          }
          subscriber.error(e);
        } finally {
          this.activeStreams.delete(sessionId);
        }
      })();
    });
  }
}
