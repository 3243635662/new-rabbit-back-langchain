import { Injectable } from '@nestjs/common';
import { RedisService } from '../db/redis/redis.service';
import {
  CarouselData,
  CarouselSideRecommendation,
} from '../../composables/useClientHomeData';
import { RedisKeys } from '../../common/constants/redis-key.constant';

@Injectable()
export class ClientHomeService {
  constructor(private readonly redisService: RedisService) {}

  // *获取首页轮播图
  async getCarousel() {
    const redisKey = RedisKeys.CLIENT_HOME.CAROUSEL;
    const cachedData = await this.redisService.get(redisKey);
    if (cachedData) {
      return cachedData;
    } else {
      await this.redisService.set(redisKey, CarouselData, 60 * 60 * 24);

      return CarouselData;
    }
  }

  // *获取轮播图侧边推荐
  async getCarouselSideRecommendation() {
    const redisKey = RedisKeys.CLIENT_HOME.SIDE_RECOMMENDATION;
    const cachedData = await this.redisService.get(redisKey);
    if (cachedData) {
      return cachedData;
    } else {
      await this.redisService.set(
        redisKey,
        CarouselSideRecommendation,
        60 * 60 * 24,
      );
      return CarouselSideRecommendation;
    }
  }
}
