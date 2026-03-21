import { Injectable } from '@nestjs/common';
import { RedisService } from '../db/redis/redis.service';
import { resFormatMethod } from '../../utils/resFormat.util';
import {
  CarouselData,
  CarouselSideRecommendation,
} from '../../composables/useClientHomeData';
@Injectable()
export class ClientHomeService {
  constructor(private readonly redisService: RedisService) {}

  // *获取首页轮播图
  async getCarousel() {
    const redisKey = 'clientHome:carousel';
    const cachedData = await this.redisService.get(redisKey);
    if (cachedData) {
      return resFormatMethod(0, '获取成功', cachedData);
    } else {
      await this.redisService.set(redisKey, CarouselData, 60 * 60 * 24);

      return resFormatMethod(0, '获取成功', CarouselData);
    }
  }

  // *获取轮播图侧边推荐
  async getCarouselSideRecommendation() {
    const redisKey = 'clientHome:carouselSideRecommendation';
    const cachedData = await this.redisService.get(redisKey);
    if (cachedData) {
      return resFormatMethod(0, '获取成功', cachedData);
    } else {
      await this.redisService.set(
        redisKey,
        CarouselSideRecommendation,
        60 * 60 * 24,
      );
      return resFormatMethod(0, '获取成功', CarouselSideRecommendation);
    }
  }
}
