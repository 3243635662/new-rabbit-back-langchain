import { Module } from '@nestjs/common';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merchant } from './entities/merchant.entity';
import { Goods } from '../goods/entities/goods.entity';
import { Categories } from '../goods/entities/categories.entity';
import { GoodsSku } from '../goods/entities/goods_sku.entity';

import { Spec } from '../goods/entities/spec.entity';
import { SpecValue } from '../goods/entities/spec_value.entity';
import { GoodsInfo } from '../goods/entities/goodInfo.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Merchant,
      Goods,
      Categories,
      GoodsSku,
      Spec,
      SpecValue,
      GoodsInfo,
    ]),
  ],
  controllers: [MerchantController],
  providers: [MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}
