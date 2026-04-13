import { Module } from '@nestjs/common';
import { SeedService } from './seed.service';
import { SeedController } from './seed.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goods } from '../../goods/entities/goods.entity';
import { GoodsSku } from '../../goods/entities/goods_sku.entity';
import { Categories } from '../../goods/entities/categories.entity';
import { Spec } from '../../goods/entities/spec.entity';
import { SpecValue } from '../../goods/entities/spec_value.entity';
import { Merchant } from '../../merchant/entities/merchant.entity';
import { GoodsInfo } from '../../goods/entities/goodInfo.entity';
import { User } from '../../user/entities/user.entity';
import { Role } from '../../role/entities/role.entity';
import { HomeBanner } from '../../clientHome/entities/home-banner.entity';
import { HomeCategory } from '../../clientHome/entities/home-category.entity';
import { InventoryModule } from '../../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      Goods,
      GoodsSku,
      Categories,
      Spec,
      SpecValue,
      Merchant,
      GoodsInfo,
      HomeBanner,
      HomeCategory,
    ]),
    InventoryModule,
  ],
  providers: [SeedService],
  controllers: [SeedController],
})
export class SeedModule {}
