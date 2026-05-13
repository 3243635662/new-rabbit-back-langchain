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
import { ChatService } from './chat.service';
import { LangChainService } from './langchain.service';
import { resFormatMethod } from '../utils/resFormat.util';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { CreateSessionDto, UpdateSessionTitleDto } from './dto/session.dto';
import { JwtPayloadType } from '../types/auth.type';
import { Public } from '../common/decorators/public.decorator';

@Controller('ai')
export class LangChainController {
  constructor(
    private readonly chatService: ChatService,
    private readonly langChainService: LangChainService,
  ) {}

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
    this.langChainService.prepareStreamingChatResponse(res);
    return this.langChainService.createStreamingChatObservable(
      sessionId,
      message,
      req,
      res,
    );
  }

  /**
   * 停止当前进行中的对话（中断 SSE 流式输出）
   * POST /ai/session/:sessionId/stop
   */
  @Post('session/:sessionId/stop')
  async stopStreamingChat(
    @Param('sessionId') sessionId: string,
    @Req() req: { user: JwtPayloadType },
  ) {
    const session = await this.chatService.getSession(sessionId);
    if (!session || session.userId !== req.user.id) {
      return resFormatMethod(1, '无权操作此会话', null);
    }

    if (this.langChainService.tryAbortStreamingChat(sessionId)) {
      return resFormatMethod(0, 'success', '对话已停止');
    }
    return resFormatMethod(1, '当前没有进行中的对话', null);
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
