import { Body, Controller, Post, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentsService } from './agents.service';
import { JwtPayloadType } from '../../types/auth.type';
import { resFormatMethod } from '../../utils/resFormat.util';
import { Merchant } from '../../modules/merchant/entities/merchant.entity';

@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
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
      currentTime: (() => {
        const now = new Date();
        return (
          `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ` +
          `(${now.toLocaleDateString('zh-CN', { weekday: 'long' })}) ` +
          `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
        );
      })(),
    };

    const result = await this.agentsService.runAgent(dto.message, context);
    return resFormatMethod(0, 'success', result);
  }
}
