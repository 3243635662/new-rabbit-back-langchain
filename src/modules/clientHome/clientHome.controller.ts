import { Controller, Get } from '@nestjs/common';
import { ClientHomeService } from './clientHome.service';
import { Public } from '../../common/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
@Controller('clientHome')
export class ClientHomeController {
  constructor(private readonly clientHomeService: ClientHomeService) {}

  // *获取首页轮播图
  @Public()
  @ResponseMessage('获取轮播图成功')
  @Get('carousel')
  async getCarousel() {
    return this.clientHomeService.getCarousel();
  }

  @Public()
  @ResponseMessage('获取轮播图侧边推荐成功')
  @Get('carouselSideRecommendation')
  async getCarouselSideRecommendation() {
    return this.clientHomeService.getCarouselSideRecommendation();
  }
}
