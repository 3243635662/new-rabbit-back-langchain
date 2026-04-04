import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goods } from '../goods/entities/goods.entity';
import { Categories } from '../goods/entities/categories.entity';
import { Spec } from '../goods/entities/spec.entity';
import { SpecValue } from '../goods/entities/spec_value.entity';
import { GoodsInfo } from '../goods/entities/goodInfo.entity';
import { GoodsSku } from '../goods/entities/goods_sku.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  controllers: [AdminController],
  providers: [AdminService],
  imports: [
    AuthModule,
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
})
export class AdminModule {}
