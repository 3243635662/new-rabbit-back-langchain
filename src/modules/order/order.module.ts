import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '../address/entities/address.entity';
import { GoodsSku } from '../goods/entities/goods_sku.entity';
import { OrderController } from './order.controller';
import { OrderItem } from './entities/order_items.entity';
import { Order } from './entities/orders.entity';
import { OrderService } from './order.service';
import { OrderTimeoutScheduler } from './order-timeout.scheduler';
import { SnowflakeIdService } from '../../common/services/snowflake-id.service';
import { CommonModule } from '../../common/common.module';
import { CouponModule } from '../coupon/coupon.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, GoodsSku, Address]),
    CommonModule,
    CouponModule,
    InventoryModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, SnowflakeIdService, OrderTimeoutScheduler],
  exports: [OrderService],
})
export class OrderModule {}
