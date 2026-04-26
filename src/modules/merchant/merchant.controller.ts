import { Body, Controller, Get, Post, Req, Query } from '@nestjs/common';
import { MerchantService } from './merchant.service';
import { resFormatMethod } from '../../utils/resFormat.util';
import { JwtPayloadType } from '../../types/auth.type';
import { PaginateOptions } from '../../common/decorators/pagination.decorator';
import type { PaginationOptionsType } from '../../types/pagination.type';
import { createGoodsDto } from './dto/createGoods.dto';
import { ShippingStatus } from '../order/entities/order_items.entity';

@Controller('merchant')
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  /**
   * 获取商家的商品列表
   * (迁移自 GoodsController)
   */
  @Get('list')
  async getGoodsList(
    @Req() req: { user: JwtPayloadType },
    @PaginateOptions({ defaultLimit: 10, maxLimit: 50 })
    paginationOptions: PaginationOptionsType,
  ) {
    const payload = req.user;
    const goodsList = await this.merchantService.getGoodsList(
      payload,
      paginationOptions,
    );
    return resFormatMethod(0, '商品列表查询成功', goodsList);
  }

  /**
   * 获取商家的商品分类树 (用于侧边栏筛选)
   */
  @Get('categories')
  async getCategories(@Req() req: { user: JwtPayloadType }) {
    const payload = req.user;
    const categories =
      await this.merchantService.getMerchantCategories(payload);
    return resFormatMethod(0, '获取成功', categories);
  }

  /**
   * 创建商品
   */
  @Post('createGoods')
  async createGoods(
    @Req() req: { user: JwtPayloadType },
    @Body() body: createGoodsDto,
  ) {
    console.log('body', body);
    const payload = req.user;
    const goods = await this.merchantService.createGoods(payload, body);
    return resFormatMethod(0, '创建成功', goods);
  }

  /**
   * 创建父分类
   */
  @Post('createParentCategory')
  async createParentCategory(
    @Req() req: { user: JwtPayloadType },
    @Body() body: { name: string },
  ) {
    const payload = req.user;
    const categories = await this.merchantService.createParentCategory(
      payload,
      body.name,
    );
    return resFormatMethod(0, '创建成功', categories);
  }

  /**
   * 创建子分类
   */
  @Post('createChildCategory')
  async createChildCategory(
    @Req() req: { user: JwtPayloadType },
    @Body() body: { name: string; parentId: number },
  ) {
    const payload = req.user;
    const categories = await this.merchantService.createChildCategory(
      payload,
      body.name,
      body.parentId,
    );
    return resFormatMethod(0, '创建成功', categories);
  }

  /**
   * 查找对应子分类
   */
  @Get('childCategories')
  async getChildCategories(
    @Req() req: { user: JwtPayloadType },
    @Query('parentId') parentId: string,
  ) {
    const payload = req.user;
    const categories = await this.merchantService.getChildCategories(
      payload,
      Number(parentId),
    );
    return resFormatMethod(0, '获取成功', categories);
  }

  /**
   * 获取商家旗下的品牌列表
   */
  @Get('brands')
  async getBrands(@Req() req: { user: JwtPayloadType }) {
    const brands = await this.merchantService.getMerchantBrands(req.user);
    return resFormatMethod(0, '获取品牌列表成功', brands);
  }

  /**
   * 按品牌获取商品列表（商品/SPU维度）
   */
  @Get('brand-goods')
  async getGoodsByBrand(
    @Req() req: { user: JwtPayloadType },
    @Query('brandId') brandId: string,
    @PaginateOptions() paginationOptions: PaginationOptionsType,
  ) {
    const goods = await this.merchantService.getGoodsByBrand(
      req.user,
      Number(brandId),
      paginationOptions,
    );
    return resFormatMethod(0, '获取品牌商品成功', goods);
  }

  /**
   * 根据商品ID获取SKU列表
   */
  @Get('goods-skus')
  async getSkusByGoodsId(
    @Req() req: { user: JwtPayloadType },
    @Query('goodsId') goodsId: string,
    @PaginateOptions() paginationOptions: PaginationOptionsType,
  ) {
    const skus = await this.merchantService.getSkusByGoodsId(
      req.user,
      Number(goodsId),
      paginationOptions,
    );
    return resFormatMethod(0, '获取商品SKU成功', skus);
  }

  /**
   * 获取商家的订单列表（含分页、状态筛选、时间范围）
   */
  @Get('orders')
  async getOrders(
    @Req() req: { user: JwtPayloadType },
    @PaginateOptions({ defaultLimit: 10, maxLimit: 50 })
    paginationOptions: PaginationOptionsType,
  ) {
    const result = await this.merchantService.getMerchantOrders(
      req.user,
      paginationOptions,
    );
    return resFormatMethod(0, '订单列表查询成功', result);
  }

  /**
   * 导出商家订单
   */
  @Get('orders/export')
  async exportOrders(
    @Req() req: { user: JwtPayloadType },
    @PaginateOptions() paginationOptions: PaginationOptionsType,
  ) {
    const list = await this.merchantService.exportMerchantOrders(
      req.user,
      paginationOptions,
    );
    return resFormatMethod(0, '导出成功', list);
  }

  /**
   * 批量更新订单项状态（OrderItem 级别）
   */
  @Post('orders/batch-item-status')
  async batchUpdateOrderItemStatus(
    @Req() req: { user: JwtPayloadType },
    @Body() body: { orderItemIds: string[]; targetStatus: number },
  ) {
    const result = await this.merchantService.batchUpdateOrderItemStatus(
      req.user,
      body.orderItemIds,
      body.targetStatus as ShippingStatus,
    );
    return resFormatMethod(0, '批量操作成功', result);
  }

  /**
   * 商家确认发货（OrderItem 级别）
   */
  @Post('orders/ship')
  async shipOrderItems(
    @Req() req: { user: JwtPayloadType },
    @Body() body: { orderItemId: string },
  ) {
    const result = await this.merchantService.shipOrderItems(
      req.user,
      body.orderItemId,
    );
    return resFormatMethod(0, '发货成功', result);
  }

  /**
   * 确认收货（OrderItem 级别）
   */
  @Post('orders/confirm')
  async confirmOrderItems(
    @Req() req: { user: JwtPayloadType },
    @Body() body: { orderItemId: string },
  ) {
    const result = await this.merchantService.confirmOrderItems(
      req.user,
      body.orderItemId,
    );
    return resFormatMethod(0, '确认收货成功', result);
  }

  /**
   * 申请售后（OrderItem 级别）
   */
  @Post('orders/after-sale')
  async applyAfterSale(
    @Req() req: { user: JwtPayloadType },
    @Body() body: { orderItemId: string },
  ) {
    const result = await this.merchantService.applyAfterSale(
      req.user,
      body.orderItemId,
    );
    return resFormatMethod(0, '售后申请成功', result);
  }
}
