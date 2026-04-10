---
name: remove-unused-userCouponRepo
overview: 移除 CouponService 中未使用的 userCouponRepo 注入属性，保留 CouponModule 中 UserCoupon 的 forFeature 注册以确保 manager 查询正常工作
todos:
  - id: remove-user-coupon-repo
    content: 移除 coupon.service.ts 中 userCouponRepo 注入属性
    status: completed
---

移除 coupon.service.ts 中未使用的 `userCouponRepo` 注入属性，保持 UserCoupon 实体在 CouponModule 中的注册不变，确保 `manager.findOne(UserCoupon, ...)` 等操作仍正常工作。

## 修改内容

- `coupon.service.ts`：移除构造函数中 `@InjectRepository(UserCoupon) private userCouponRepo: Repository<UserCoupon>` 参数，保留 `UserCoupon` import（`manager.findOne`/`manager.update` 仍需要）
- `coupon.module.ts`：无需修改，`TypeOrmModule.forFeature([Coupon, UserCoupon])` 已注册 UserCoupon 实体，移除 service 注入不影响实体注册