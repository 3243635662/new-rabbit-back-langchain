import { Body, Controller, Post, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentsService } from './agents.service';
import { JwtPayloadType } from '../../types/auth.type';
import { resFormatMethod } from '../../utils/resFormat.util';
import { Merchant } from '../../modules/merchant/entities/merchant.entity';
import { LangGraphConfigService } from '../persistence/langgraph-config.service';

@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly langGraphConfig: LangGraphConfigService,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
  ) {}

  @Post('run')
  async runAgent(
    @Body() dto: { message: string; sessionId?: string },
    @Req() req: { user: JwtPayloadType },
  ) {
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

    const context = {
      ...req.user,
      sessionId: dto.sessionId || 'default-session',
      merchantId,
    };

    const result = this.langGraphConfig.useLangGraph
      ? await this.agentsService.runAgentWithLangGraph(dto.message, context)
      : await this.agentsService.runAgent(dto.message, context);
    return resFormatMethod(0, 'success', result);
  }
}
