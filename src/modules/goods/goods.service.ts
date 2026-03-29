import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Goods } from './entities/goods.entity';
import { Repository } from 'typeorm';
import { GoodsSku } from './entities/goods_sku.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
@Injectable()
export class GoodsService {
  constructor(
    @InjectRepository(Goods) private readonly goodsRepo: Repository<Goods>,
    @InjectRepository(GoodsSku) private readonly skuRepo: Repository<GoodsSku>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
  ) {}
}
