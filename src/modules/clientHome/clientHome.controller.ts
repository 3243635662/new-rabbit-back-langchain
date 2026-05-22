import { Controller, Get, Param } from '@nestjs/common';
import { ClientHomeService } from './clientHome.service';
import { Public } from '../../common/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { resFormatMethod } from '../../utils/resFormat.util';

@Controller('clientHome')
export class ClientHomeController {
  constructor(private readonly clientHomeService: ClientHomeService) {}

  // *获取首页轮播图
  @Public()
  @ResponseMessage('获取轮播图成功')
  @Get('carousel')
  async getCarousel() {
    const data = await this.clientHomeService.getCarousel();
    return resFormatMethod(0, '获取轮播图成功', data);
  }

  @Public()
  @ResponseMessage('获取轮播图侧边推荐成功')
  @Get('carouselSideRecommendation')
  async getCarouselSideRecommendation() {
    const data = await this.clientHomeService.getCarouselSideRecommendation();
    return resFormatMethod(0, '获取轮播图侧边推荐成功', data);
  }

  // *获取推荐商品列表（客户端首页）
  @Public()
  @ResponseMessage('获取推荐商品列表成功')
  @Get('recommended-goods')
  async getRecommendedGoods() {
    const data = await this.clientHomeService.getRecommendedGoods();
    return resFormatMethod(0, '获取推荐商品列表成功', data);
  }

  // *获取商品详情（购买页）
  @Public()
  @ResponseMessage('获取商品详情成功')
  @Get('goods-detail/:id')
  async getGoodsDetail(@Param('id') id: string) {
    const data = await this.clientHomeService.getGoodsDetail(Number(id));
    return resFormatMethod(0, '获取商品详情成功', data);
  }
}
