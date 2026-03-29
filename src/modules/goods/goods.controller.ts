import { Controller } from '@nestjs/common';
import { GoodsService } from './goods.service';
import { type Request } from 'express';
@Controller('goods')
export class GoodsController {
  constructor(private readonly goodsService: GoodsService) {}
}
