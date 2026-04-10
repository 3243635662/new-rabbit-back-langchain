import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { Coupon } from './entities/coupon.entity';
import { UserCoupon } from './entities/user-coupon.entity';

export interface OrderItemForDiscount {
  skuId: number;
  goodsId: number;
  categoryId: number | null;
  totalPrice: number;
}

export interface DiscountResult {
  discountAmount: number; // 优惠金额
  payAmount: number; // 实付金额
}

@Injectable()
export class CouponService {
  constructor(
    @InjectRepository(Coupon)
    private couponRepo: Repository<Coupon>,
  ) {}

  /**
   * 验证用户优惠券并计算折扣
   * @param userId 用户ID
   * @param couponId 用户优惠券ID (user_coupon.id)
   * @param orderItems 订单项列表（用于 scopeType=CATEGORY/GOODS 时筛选命中项）
   * @param totalAmount 订单原价总额
   * @param queryRunner 事务查询器（可选，用于事务内查询）
   */
  async calculateDiscount(
    userId: string,
    couponId: number | undefined,
    orderItems: OrderItemForDiscount[],
    totalAmount: number,
    queryRunner?: QueryRunner,
  ): Promise<DiscountResult> {
    // 没有使用优惠券
    if (!couponId) {
      return { discountAmount: 0, payAmount: totalAmount };
    }

    const manager = queryRunner?.manager ?? this.couponRepo.manager;

    // 查询用户优惠券
    const userCoupon = await manager.findOne(UserCoupon, {
      where: { id: couponId, userId },
      relations: ['coupon'],
      lock: { mode: 'pessimistic_write' },
    });

    if (!userCoupon) {
      return { discountAmount: 0, payAmount: totalAmount };
    }

    // 校验优惠券状态
    if (userCoupon.status !== 'UNUSED') {
      throw new BadRequestException('优惠券已使用或已过期');
    }

    // 校验过期时间
    if (new Date() > userCoupon.expireTime) {
      throw new BadRequestException('优惠券已过期');
    }

    const coupon = userCoupon.coupon;

    // 校验优惠券是否启用
    if (!coupon.status) {
      throw new BadRequestException('优惠券已禁用');
    }

    // 校验优惠券是否在有效期内
    const now = new Date();
    if (now < coupon.startTime || now > coupon.endTime) {
      throw new BadRequestException('优惠券不在有效期内');
    }

    // 根据 scopeType 计算命中金额
    const matchedAmount = this.calculateMatchedAmount(
      coupon.scopeType,
      coupon.scopeIds,
      orderItems,
    );

    // 校验门槛金额
    // 对于 CATEGORY/GOODS 类型，门槛基于命中商品金额；对于 ALL 类型，门槛基于订单总额
    const thresholdAmount =
      coupon.scopeType === 'ALL' ? totalAmount : matchedAmount;

    if (thresholdAmount < Number(coupon.minAmount)) {
      throw new BadRequestException(`未满足满${coupon.minAmount}元的使用条件`);
    }

    // 根据优惠券类型计算折扣
    const discountAmount = this.calculateDiscountAmount(
      coupon.type,
      Number(coupon.value),
      matchedAmount,
      totalAmount,
    );

    // 实付金额 = 原价 - 优惠（不低于0）
    const payAmount = Math.max(0, totalAmount - discountAmount);

    return {
      discountAmount: Math.round(discountAmount * 100) / 100,
      payAmount: Math.round(payAmount * 100) / 100,
    };
  }

  /**
   * 标记用户优惠券为已使用
   */
  async markCouponUsed(
    couponId: number,
    orderId: string,
    queryRunner?: QueryRunner,
  ): Promise<void> {
    if (!couponId) return;

    const manager = queryRunner?.manager ?? this.couponRepo.manager;
    await manager.update(UserCoupon, couponId, {
      status: 'USED',
      orderId: Number(orderId),
    });
  }

  /**
   * 根据 scopeType 计算命中商品的金额
   */
  private calculateMatchedAmount(
    scopeType: string,
    scopeIds: number[] | null,
    orderItems: OrderItemForDiscount[],
  ): number {
    if (scopeType === 'ALL') {
      return orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
    }

    if (!scopeIds || scopeIds.length === 0) {
      return 0;
    }

    const scopeIdSet = new Set(scopeIds);

    if (scopeType === 'CATEGORY') {
      return orderItems
        .filter((item) => item.categoryId && scopeIdSet.has(item.categoryId))
        .reduce((sum, item) => sum + item.totalPrice, 0);
    }

    if (scopeType === 'GOODS') {
      return orderItems
        .filter((item) => scopeIdSet.has(item.goodsId))
        .reduce((sum, item) => sum + item.totalPrice, 0);
    }

    return 0;
  }

  /**
   * 根据优惠券类型计算优惠金额
   * @param type 优惠券类型: FULL_REDUCTION-满减, DISCOUNT-打折, NO_THRESHOLD-无门槛
   * @param value 优惠值: 满减/无门槛为金额, 打折为折扣率(如 8.8 表示88折)
   * @param matchedAmount 命中商品总金额
   * @param totalAmount 订单总金额
   */
  private calculateDiscountAmount(
    type: string,
    value: number,
    matchedAmount: number,
    totalAmount: number,
  ): number {
    switch (type) {
      case 'FULL_REDUCTION':
        // 满减：直接减去固定金额，不超过命中金额
        return Math.min(value, matchedAmount);

      case 'DISCOUNT': {
        // 打折：value 存折扣率，如 8.8 表示88折，优惠金额 = 命中金额 * (1 - value/10)
        // 如果 value < 1 则视为 0.xx 格式（如 0.88 表示88折）
        const discountRate = value < 1 ? value : value / 10;
        return matchedAmount * (1 - discountRate);
      }

      case 'NO_THRESHOLD':
        // 无门槛：直接减去固定金额，不超过订单总额
        return Math.min(value, totalAmount);

      default:
        return 0;
    }
  }
}
