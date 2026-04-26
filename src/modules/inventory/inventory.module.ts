import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { Inventory } from './entities/inventory.entity';
import { InventoryLog } from './entities/inventory_logs.entity';
import { Goods } from '../goods/entities/goods.entity';
import { GoodsSku } from '../goods/entities/goods_sku.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { RedisService } from '../db/redis/redis.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Inventory,
      InventoryLog,
      Goods,
      GoodsSku,
      Merchant,
    ]),
  ],
  providers: [InventoryService, RedisService],
  controllers: [InventoryController],
  exports: [InventoryService, TypeOrmModule],
})
export class InventoryModule {}
