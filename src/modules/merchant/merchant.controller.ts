import { Body, Controller, Get, Post, Req, Query } from '@nestjs/common';
import { MerchantService } from './merchant.service';
import { resFormatMethod } from '../../utils/resFormat.util';
import { JwtPayloadType } from '../../types/auth.type';
import { PaginateOptions } from '../../common/decorators/pagination.decorator';
import type { PaginationOptionsType } from '../../types/pagination.type';
import { createGoodsDto } from './dto/createGoods.dto';

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
   * 按品牌获取商品列表
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
}
