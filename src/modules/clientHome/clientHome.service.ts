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
    return this.getCachedDataWithLogicExpire(
      RedisKeys.CLIENT_HOME.CAROUSEL,
      CarouselData,
    );
  }

  // *获取轮播图侧边推荐
  async getCarouselSideRecommendation() {
    return this.getCachedDataWithLogicExpire(
      RedisKeys.CLIENT_HOME.SIDE_RECOMMENDATION,
      CarouselSideRecommendation,
    );
  }

  /**
   * 通用逻辑过期处理逻辑 (解决缓存雪崩/击穿)
   * @param key Redis 键
   * @param dataFetcher 数据获取函数 (这里暂时直接传入数据，实际业务中应为异步回调)
   * @param logicExpireSeconds 逻辑过期时间 (秒)
   */
  private async getCachedDataWithLogicExpire<T>(
    key: string,
    fallbackData: T,
    logicExpireSeconds = 60 * 60 * 24, // 默认1天
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
      if (await this.redisService.tryLock(key, 10)) {
        // 获取锁成功，开启异步更新
        // 注意：不 await，不影响当前请求返回旧数据
        void (async () => {
          try {
            // 模拟从数据库重新查询数据并更新缓存
            // 在实际项目中，这里应该是 await fetchFromDB();
            await this.redisService.setWithLogicExpire(
              key,
              fallbackData,
              logicExpireSeconds,
            );
          } finally {
            // 释放锁
            await this.redisService.unlock(key);
          }
        })();
      }

      // 无论获取锁成功与否，逻辑过期期间均先返回旧数据
      return cache.data;
    }

    // 3. 缓存未击中 (或者物理过期)
    // 尝试获取互斥锁进行同步数据重建
    if (await this.redisService.tryLock(key, 10)) {
      try {
        // 再次检查 (双重检查锁)
        const secondCheck = await this.redisService.getWithLogicExpire<T>(key);
        if (secondCheck.data) return secondCheck.data;

        // 加载数据并设置缓存
        await this.redisService.setWithLogicExpire(
          key,
          fallbackData,
          logicExpireSeconds,
        );
        return fallbackData;
      } finally {
        await this.redisService.unlock(key);
      }
    } else {
      // 未抢到锁的请求，等待一段时间后重试 (此时热点数据应该已由抢到锁的请求重建)
      await new Promise((resolve) => setTimeout(resolve, 50));
      return this.getCachedDataWithLogicExpire(
        key,
        fallbackData,
        logicExpireSeconds,
      );
    }
  }
}
