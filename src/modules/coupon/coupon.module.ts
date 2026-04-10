import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CouponService } from './coupon.service';
import { CouponController } from './coupon.controller';
import { Coupon } from './entities/coupon.entity';
import { UserCoupon } from './entities/user-coupon.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Coupon, UserCoupon])],
  providers: [CouponService],
  controllers: [CouponController],
  exports: [CouponService],
})
export class CouponModule {}
