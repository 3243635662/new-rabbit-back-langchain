import { Module } from '@nestjs/common';
import { GoodsController } from './goods.controller';
import { GoodsService } from './goods.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goods } from './entities/goods.entity';
import { Categories } from './entities/categories.entity';
import { Spec } from './entities/spec.entity';
import { SpecValue } from './entities/spec_value.entity';
import { GoodsInfo } from './entities/goodInfo.entity';
import { GoodsSku } from './entities/goods_sku.entity';
import { Merchant } from '../merchant/entities/merchant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Goods,
      Categories,
      Spec,
      SpecValue,
      GoodsInfo,
      GoodsSku,
      Merchant,
    ]),
  ],
  controllers: [GoodsController],
  providers: [GoodsService],
})
export class GoodsModule {}
