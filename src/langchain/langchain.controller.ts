import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import { LangChainService } from './langchain.service';
import { EmbeddingService } from './embedding.service';
import { ChatService } from './chat.service';
import { resFormatMethod } from '../utils/resFormat.util';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ChatDto } from './dto/chat.dto';
import {
  ChatMemoryDto,
  CreateSessionDto,
  UpdateSessionTitleDto,
} from './dto/chat-memory.dto';
import { JwtPayloadType } from '../types/auth.type';
import { HandleTokenService } from '../modules/auth/utils/handToken.util';
import { getRoleTypeByRoleId } from './prompts/agent.prompt';

@Controller('ai')
export class LangChainController {
  constructor(
    private readonly langChainService: LangChainService,
    private readonly embeddingService: EmbeddingService,
    private readonly chatService: ChatService,
    private readonly handleTokenService: HandleTokenService,
  ) {}

  @Post('chat')
  async chat(@Body() dto: ChatDto, @Req() req: { user: JwtPayloadType }) {
    const role = getRoleTypeByRoleId(req.user.roleId);
    const reply = await this.langChainService.chat(dto.message, role);
    return resFormatMethod(0, 'success', reply);
  }

  @Public()
  @Sse('streaming-chat')
  streamingChat(
    @Query('message') message: string,
    @Query('token') token: string,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      void (async () => {
        try {
          const payload =
            await this.handleTokenService.verifyTokenFromQuery(token);
          const role = getRoleTypeByRoleId(payload.roleId);

          for await (const chunk of this.langChainService.streamChat(
            message,
            role,
          )) {
            subscriber.next({
              data: JSON.stringify(chunk),
            } as MessageEvent);
          }
          subscriber.complete();
        } catch (e) {
          subscriber.error(e);
        }
      })();
    });
  }

  @Post('embed')
  async embed(@Body() dto: ChatDto) {
    const vector = await this.embeddingService.embedQuery(dto.message);
    return resFormatMethod(0, 'success', {
      dimension: vector.length,
      preview: vector.slice(0, 5),
    });
  }

  @Post('few-shot')
  async fewShot(@Body() dto: ChatDto) {
    const reply = await this.langChainService.fewShotChat(dto.message);
    return resFormatMethod(0, 'success', reply);
  }

  @Post('chat-with-history')
  async chatWithHistory(
    @Body() dto: ChatDto,
    @Req() req: { user: JwtPayloadType },
  ) {
    const role = getRoleTypeByRoleId(req.user.roleId);
    const reply = await this.langChainService.chatWithHistory(
      dto.message,
      role,
    );
    return resFormatMethod(0, 'success', reply);
  }

  // ========== Chain 链式接口（SSE 流式） ==========

  @Public()
  @Sse('chain/translate')
  streamTranslateChain(
    @Query('text') text: string,
    @Query('inputLanguage') inputLanguage: string,
    @Query('outputLanguage') outputLanguage: string,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      void (async () => {
        try {
          for await (const chunk of this.langChainService.streamTranslateChain(
            text,
            inputLanguage || '中文',
            outputLanguage || '英语',
          )) {
            subscriber.next({
              data: JSON.stringify(chunk),
            } as MessageEvent);
          }
          subscriber.complete();
        } catch (e) {
          subscriber.error(e);
        }
      })();
    });
  }

  @Public()
  @Sse('chain/product-naming')
  streamProductNamingChain(
    @Query('product') product: string,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      void (async () => {
        try {
          for await (const chunk of this.langChainService.streamProductNamingChain(
            product,
          )) {
            subscriber.next({
              data: JSON.stringify(chunk),
            } as MessageEvent);
          }
          subscriber.complete();
        } catch (e) {
          subscriber.error(e);
        }
      })();
    });
  }

  // ========== 自定义函数链接口 ==========

  @Public()
  @Post('chain/custom')
  async customChain(@Body() dto: ChatDto) {
    const reply = await this.langChainService.customChainChat(dto.message);
    return resFormatMethod(0, 'success', reply);
  }

  // ========== 会话记忆接口（旧版 InMemory，保留兼容） ==========

  @Public()
  @Post('chat-memory')
  async chatWithMemory(@Body() dto: ChatMemoryDto) {
    const reply = await this.langChainService.chatWithMemory(
      dto.message,
      dto.sessionId,
    );
    return resFormatMethod(0, 'success', reply);
  }

  @Public()
  @Post('chat-memory/history')
  async getChatHistory(@Query('sessionId') sessionId: string) {
    const history = await this.langChainService.getChatHistory(sessionId);
    return resFormatMethod(0, 'success', history);
  }

  @Public()
  @Post('chat-memory/clear')
  clearChatHistory(@Query('sessionId') sessionId: string) {
    this.langChainService.clearChatHistory(sessionId);
    return resFormatMethod(0, 'success', '已清除');
  }

  // ══════════════════════════════════════════════════════
  // AI 记忆对话接口（Redis + MySQL 持久化）
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
   * 带持久化记忆的聊天（核心接口）
   * POST /ai/session/:sessionId/chat
   *
   * 流程：
   * 1. 从 Redis 读取历史 → 拼 LLM → 生成回答
   * 2. Human + AI 消息追加到 Redis（TTL 续期）
   * 3. 异步同步到 MySQL
   */
  @Post('session/:sessionId/chat')
  async chatWithPersistentMemory(
    @Param('sessionId') sessionId: string,
    @Body() dto: ChatDto,
    @Req() req: { user: JwtPayloadType },
  ) {
    const role = getRoleTypeByRoleId(req.user.roleId);

    // ① 从 Redis/MySQL 获取历史消息
    const history = await this.chatService.getMessages(sessionId);

    // ② 拼消息列表 → LLM 生成回答
    const reply = await this.langChainService.chatWithHistory(
      dto.message,
      role,
      history,
    );

    // ③ Human + AI 消息追加到 Redis
    await this.chatService.appendMessage(sessionId, 'human', dto.message);
    await this.chatService.appendMessage(sessionId, 'ai', reply as string);

    // ④ 异步同步到 MySQL（不阻塞响应）
    this.chatService.syncToMySQL(sessionId).catch((err) => {
      this.chatService['logger'].error(`异步同步失败:`, err);
    });

    return resFormatMethod(0, 'success', reply);
  }

  /**
   * 带持久化记忆的流式聊天（核心接口）
   * SSE /ai/session/:sessionId/streaming-chat
   *
   * 流程与 chatWithPersistentMemory 一致，但响应是流式
   * SSE 无法设置 Authorization header，token 通过 query 传入，AuthGuard 内部兼容
   */
  @Sse('session/:sessionId/streaming-chat')
  streamingChatWithPersistentMemory(
    @Param('sessionId') sessionId: string,
    @Query('message') message: string,
    @Req() req: { user: JwtPayloadType },
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      void (async () => {
        try {
          const role = getRoleTypeByRoleId(req.user.roleId);

          // ① 从 Redis/MySQL 获取历史消息
          const history = await this.chatService.getMessages(sessionId);

          // ② 记录用户消息到 Redis
          await this.chatService.appendMessage(sessionId, 'human', message);

          // ③ 流式调用 LLM
          let fullContent = '';
          let fullReasoning = '';

          for await (const chunk of this.langChainService.streamChat(
            message,
            role,
            history,
          )) {
            fullContent += chunk.content;
            fullReasoning += chunk.reasoning || '';
            subscriber.next({
              data: JSON.stringify(chunk),
            } as MessageEvent);
          }

          // ④ AI 完整回复追加到 Redis
          await this.chatService.appendMessage(
            sessionId,
            'ai',
            fullContent,
            fullReasoning || undefined,
          );

          // ⑤ 异步同步到 MySQL
          this.chatService.syncToMySQL(sessionId).catch((err) => {
            this.chatService['logger'].error(`异步同步失败:`, err);
          });

          subscriber.complete();
        } catch (e) {
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
