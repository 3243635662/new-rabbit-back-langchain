import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  Sse,
} from '@nestjs/common';
import type { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatService } from './chat.service';
import { AgentsService } from './agents/agents.service';
import { resFormatMethod } from '../utils/resFormat.util';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { CreateSessionDto, UpdateSessionTitleDto } from './dto/session.dto';
import { JwtPayloadType } from '../types/auth.type';
import { Merchant } from '../modules/merchant/entities/merchant.entity';
import { Public } from '../common/decorators/public.decorator';
import { AgentRuntimeContext } from '../types/agent.type';

@Controller('ai')
export class LangChainController {
  constructor(
    private readonly chatService: ChatService,
    private readonly agentsService: AgentsService,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
  ) {}

  /** 根据用户身份构建 Agent 运行时上下文 */
  private buildAgentContext = async (
    req: { user: JwtPayloadType },
    sessionId?: string,
  ): Promise<AgentRuntimeContext> => {
    let merchantId: string | undefined;

    if (req.user.roleId === 2) {
      const merchant = await this.merchantRepo.findOne({
        where: { userId: req.user.id },
        select: ['id'],
      });
      if (merchant) {
        merchantId = merchant.id.toString();
      }
    }

    return {
      ...req.user,
      sessionId: sessionId || 'default-session',
      merchantId,
    };
  };

  // ══════════════════════════════════════════════════════
  // 智能对话核心接口（基于 Agent，Redis + MySQL 持久化）
  // ══════════════════════════════════════════════════════

  /**
   * 创建新会话
   * POST /ai/session
   */
  @Post('session')
  async createSession(
    @Body() dto: CreateSessionDto,
    @Req() req: { user: JwtPayloadType },
  ) {
    const session = await this.chatService.createSession(
      req.user.id,
      dto.title,
    );
    return resFormatMethod(0, 'success', session);
  }

  /**
   * 获取用户的会话列表
   * GET /ai/session/list
   */
  @Get('session/list')
  async getSessionList(@Req() req: { user: JwtPayloadType }) {
    const sessions = await this.chatService.getUserSessions(req.user.id);
    return resFormatMethod(0, 'success', sessions);
  }

  /**
   * 获取单个会话详情
   * GET /ai/session/:sessionId
   */
  @Get('session/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const session = await this.chatService.getSession(sessionId);
    return resFormatMethod(0, 'success', session);
  }

  /**
   * 更新会话标题
   * POST /ai/session/:sessionId/title
   */
  @Post('session/:sessionId/title')
  async updateSessionTitle(
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateSessionTitleDto,
  ) {
    await this.chatService.updateSessionTitle(sessionId, dto.title);
    return resFormatMethod(0, 'success', '标题已更新');
  }

  /**
   * 结束会话（同步到 MySQL 并标记为已结束）
   * POST /ai/session/:sessionId/end
   */
  @Post('session/:sessionId/end')
  async endSession(@Param('sessionId') sessionId: string) {
    await this.chatService.endSession(sessionId);
    return resFormatMethod(0, 'success', '会话已结束并同步');
  }

  /**
   * 删除会话
   * DELETE /ai/session/:sessionId
   */
  @Delete('session/:sessionId')
  async deleteSession(@Param('sessionId') sessionId: string) {
    await this.chatService.deleteSession(sessionId);
    return resFormatMethod(0, 'success', '会话已删除');
  }

  /**
   * 智能对话核心接口（带持久化记忆，流式输出）
   * SSE /ai/session/:sessionId/streaming-chat
   *
   * 流程：
   * 1. 从 Redis/MySQL 获取历史消息
   * 2. 构建 Agent 上下文（含 merchantId）
   * 3. Agent 自主决策（是否调用知识库等工具）→ 流式生成回答
   * 4. Human + AI 消息追加到 Redis（TTL 续期）
   * 5. 异步同步到 MySQL
   *
   * SSE 无法设置 Authorization header，token 通过 query 传入，AuthGuard 内部兼容。
   */
  @Public()
  @Sse('session/:sessionId/streaming-chat')
  streamingChat(
    @Param('sessionId') sessionId: string,
    @Query('message') message: string,
    @Req() req: { user: JwtPayloadType },
    @Res({ passthrough: true }) res: Response,
  ): Observable<MessageEvent> {
    // 禁用 SSE 超时，避免长推理被断开
    res.setTimeout(0);
    res.setHeader('X-Accel-Buffering', 'no');

    return new Observable((subscriber) => {
      void (async () => {
        try {
          // ① 从 Redis/MySQL 获取历史消息
          const history = await this.chatService.getMessages(sessionId);

          // ② 构建 Agent 上下文
          const context = await this.buildAgentContext(req, sessionId);

          // ③ 记录用户消息到 Redis
          await this.chatService.appendMessage(sessionId, 'human', message);

          // ④ 流式 Agent 运行
          let fullContent = '';
          let fullReasoning = '';
          for await (const chunk of this.agentsService.runAgentStream(
            message,
            context,
            history,
          )) {
            fullContent += chunk.content || '';
            if (chunk.type === 'content') {
              fullReasoning += chunk.reasoning || '';
            }
            subscriber.next({
              data: JSON.stringify(chunk),
            } as MessageEvent);
          }

          // ⑤ AI 完整回复追加到 Redis
          await this.chatService.appendMessage(
            sessionId,
            'ai',
            fullContent,
            fullReasoning || undefined,
          );

          // ⑥ 异步同步到 MySQL
          this.chatService.syncToMySQL(sessionId).catch((err) => {
            this.chatService['logger'].error(`异步同步失败:`, err);
          });

          subscriber.complete();
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          this.chatService['logger'].error(
            `[SSE] session=${sessionId} error=${err.message}`,
            err.stack,
          );
          subscriber.error(e);
        }
      })();
    });
  }

  /**
   * 获取会话的消息记录（从 Redis 优先，降级 MySQL）
   * GET /ai/session/:sessionId/messages
   */
  @Get('session/:sessionId/messages')
  async getSessionMessages(@Param('sessionId') sessionId: string) {
    const messages = await this.chatService.getRawMessages(sessionId);
    return resFormatMethod(0, 'success', messages);
  }

  /**
   * 手动触发同步（Redis → MySQL）
   * POST /ai/session/:sessionId/sync
   */
  @Post('session/:sessionId/sync')
  async syncSession(@Param('sessionId') sessionId: string) {
    await this.chatService.syncToMySQL(sessionId);
    return resFormatMethod(0, 'success', '同步完成');
  }
}
