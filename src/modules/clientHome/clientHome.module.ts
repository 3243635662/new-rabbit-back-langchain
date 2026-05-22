import { Module } from '@nestjs/common';
import { ClientHomeController } from './clientHome.controller';
import { ClientHomeService } from './clientHome.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../db/redis/redis.module';
import { HomeBanner } from './entities/home-banner.entity';
import { HomeCategory } from './entities/home-category.entity';
import { Goods } from '../goods/entities/goods.entity';
import { GoodsSku } from '../goods/entities/goods_sku.entity';
import { GoodsInfo } from '../goods/entities/goodInfo.entity';
import { Inventory } from '../inventory/entities/inventory.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HomeBanner,
      HomeCategory,
      Goods,
      GoodsSku,
      GoodsInfo,
      Inventory,
    ]),
    RedisModule,
  ],
  controllers: [ClientHomeController],
  providers: [ClientHomeService],
})
export class ClientHomeModule {}
