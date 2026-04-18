import { Body, Controller, Post, Query, Req, Sse } from '@nestjs/common';
import { LangChainService } from './langchain.service';
import { EmbeddingService } from './embedding.service';
import { resFormatMethod } from '../utils/resFormat.util';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ChatDto } from './dto/chat.dto';
import { TranslateChainDto, ProductNamingChainDto } from './dto/chain.dto';
import { JwtPayloadType } from '../types/auth.type';
import { HandleTokenService } from '../modules/auth/utils/handToken.util';
import { getRoleTypeByRoleId } from './prompts/agent.prompt';

@Controller('ai')
export class LangChainController {
  constructor(
    private readonly langChainService: LangChainService,
    private readonly embeddingService: EmbeddingService,
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
          // 从 query token 中验证用户身份
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

  // 翻译链 - 流式输出翻译结果
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

  // 产品命名链 - 流式输出命名结果
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
}
