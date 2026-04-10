import {
  IsArray,
  IsNotEmpty,
  ValidateNested,
  IsInt,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsInt()
  @Min(1)
  skuId: number; // 商品SKU ID

  @IsInt()
  @Min(1)
  count: number; // 购买数量
}

export class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[]; // 订单商品列表

  @IsNotEmpty()
  @Type(() => String)
  addressId: string; // 用户选择的地址ID（用于获取地址快照）

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  couponId?: number; // 用户优惠券ID（user_coupon表的id），可选
}
