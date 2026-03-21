import { Controller, Get } from '@nestjs/common';
import { ClientHomeService } from './clientHome.service';
import { Public } from '../../common/decorators/public.decorator';
@Controller('clientHome')
export class ClientHomeController {
  constructor(private readonly clientHomeService: ClientHomeService) {}

  // *获取首页轮播图
  @Public()
  @Get('carousel')
  async getCarousel() {
    return this.clientHomeService.getCarousel();
  }

  @Public()
  @Get('carouselSideRecommendation')
  async getCarouselSideRecommendation() {
    return this.clientHomeService.getCarouselSideRecommendation();
  }
}
