import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../db/redis/redis.service';
import {
  CarouselData,
  CarouselSideRecommendation,
} from '../../composables/useClientHomeData';
import { RedisKeys } from '../../common/constants/redis-key.constant';
import { RedisTTL } from '../../common/constants/redis-TTL.constant';
import { HomeBanner } from './entities/home-banner.entity';
import { HomeCategory } from './entities/home-category.entity';

@Injectable()
export class ClientHomeService {
  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(HomeBanner)
    private readonly homeBannerRepo: Repository<HomeBanner>,
    @InjectRepository(HomeCategory)
    private readonly homeCategoryRepo: Repository<HomeCategory>,
  ) {}

  // *获取首页轮播图
  async getCarousel() {
    return this.getCachedDataWithLogicExpire(
      RedisKeys.CLIENT_HOME.CAROUSEL,
      () => this.redisService.tryClientHomeCarouselLock(10),
      () => this.redisService.unlockClientHomeCarouselLock(),
      async () => {
        const banners = await this.homeBannerRepo.find({
          where: { isActive: true },
          order: { sort: 'ASC' },
        });

        return banners.length > 0 ? banners : CarouselData;
      },
    );
  }

  // *获取轮播图侧边推荐
  async getCarouselSideRecommendation() {
    return this.getCachedDataWithLogicExpire(
      RedisKeys.CLIENT_HOME.SIDE_RECOMMENDATION,
      () => this.redisService.tryClientHomeSideRecommendationLock(10),
      () => this.redisService.unlockClientHomeSideRecommendationLock(),
      async () => {
        const categories = await this.homeCategoryRepo.find({
          where: { isActive: true },
          order: { sort: 'ASC' },
        });
        return categories.length > 0 ? categories : CarouselSideRecommendation;
      },
    );
  }

  /**
   * 通用逻辑过期处理逻辑 (解决缓存雪崩/击穿)
   * @param key Redis 键
   * @param dataFetcher 数据获取函数 (异步回调)
   * @param logicExpireSeconds 逻辑过期时间 (秒)
   */
  private async getCachedDataWithLogicExpire<T>(
    key: string,
    tryBusinessLock: () => Promise<boolean>,
    unlockBusinessLock: () => Promise<void>,
    dataFetcher: () => Promise<T>,
    logicExpireSeconds = RedisTTL.CACHE.CLIENT_HOME_DEFAULT, // 默认1天
  ): Promise<T> {
    // 1. 获取带有逻辑过期信息的缓存数据
    const cache = await this.redisService.getWithLogicExpire<T>(key);

    // 2. 如果命中缓存 (物理未过期)
    if (cache.data) {
      // 2.1 检查逻辑是否过期
      if (!cache.isExpired) {
        // 未过期，直接返回
        return cache.data;
      }

      // 2.2 逻辑已过期，尝试获取互斥锁异步刷新
      if (await tryBusinessLock()) {
        // 获取锁成功，开启异步更新
        void (async () => {
          try {
            // 从数据库重新查询数据并更新缓存
            const dbData = await dataFetcher();
            await this.redisService.setWithLogicExpire(
              key,
              dbData,
              logicExpireSeconds,
            );
          } finally {
            // 释放锁
            await unlockBusinessLock();
          }
        })();
      }

      // 无论获取锁成功与否，逻辑过期期间均先返回旧数据
      return cache.data;
    }

    // 3. 缓存未击中 (或者物理过期)
    // 尝试获取互斥锁进行同步数据重建
    if (await tryBusinessLock()) {
      try {
        // 再次检查 (双重检查锁)
        const secondCheck = await this.redisService.getWithLogicExpire<T>(key);
        if (secondCheck.data) return secondCheck.data;

        // 加载数据并设置缓存
        const dbData = await dataFetcher();
        await this.redisService.setWithLogicExpire(
          key,
          dbData,
          logicExpireSeconds,
        );
        return dbData;
      } finally {
        await unlockBusinessLock();
      }
    } else {
      // 未抢到锁的请求，等待一段时间后重试
      await new Promise((resolve) => setTimeout(resolve, 50));
      return this.getCachedDataWithLogicExpire(
        key,
        tryBusinessLock,
        unlockBusinessLock,
        dataFetcher,
        logicExpireSeconds,
      );
    }
  }
}
