import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RedisService } from '../db/redis/redis.service';
import {
  CarouselData,
  CarouselSideRecommendation,
} from '../../composables/useClientHomeData';
import { RedisKeys } from '../../common/constants/redis-key.constant';
import { RedisTTL } from '../../common/constants/redis-TTL.constant';
import { HomeBanner } from './entities/home-banner.entity';
import { HomeCategory } from './entities/home-category.entity';
import { Goods } from '../goods/entities/goods.entity';
import { GoodsSku } from '../goods/entities/goods_sku.entity';
import { GoodsInfo } from '../goods/entities/goodInfo.entity';
import { Inventory } from '../inventory/entities/inventory.entity';

@Injectable()
export class ClientHomeService {
  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(HomeBanner)
    private readonly homeBannerRepo: Repository<HomeBanner>,
    @InjectRepository(HomeCategory)
    private readonly homeCategoryRepo: Repository<HomeCategory>,
    @InjectRepository(Goods)
    private readonly goodsRepo: Repository<Goods>,
    @InjectRepository(GoodsSku)
    private readonly skuRepo: Repository<GoodsSku>,
    @InjectRepository(GoodsInfo)
    private readonly goodsInfoRepo: Repository<GoodsInfo>,
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
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

  // *获取推荐商品列表（客户端首页）
  async getRecommendedGoods() {
    // 比赛项目：直接写死推荐的商品ID（merchant为1，goodId为2,3,4,22）
    const fixedGoodsIds = [2, 3, 4, 22];

    const goods = await this.goodsRepo.find({
      where: {
        id: In(fixedGoodsIds),
        merchantId: 1,
        isReviewed: true,
        isReviewedSeccuss: true,
        status: true,
      },
    });

    const result = await Promise.all(
      goods.map(async (goodsItem) => {
        // 获取该商品的所有SKU（先尝试已上架的，如果没有则获取所有）
        let skus = await this.skuRepo.find({
          where: { goodsId: goodsItem.id, isLaunching: true },
        });

        // 如果没有已上架的SKU，则获取所有SKU
        if (skus.length === 0) {
          skus = await this.skuRepo.find({
            where: { goodsId: goodsItem.id },
          });
        }

        // 计算最低价格
        let minPrice = '0.00';
        if (skus.length > 0) {
          const prices = skus
            .map((sku) => Number(sku.price))
            .filter((price) => !isNaN(price) && price > 0);

          if (prices.length > 0) {
            minPrice = Math.min(...prices).toFixed(2);
          }
        }

        return {
          id: goodsItem.id,
          name: goodsItem.name,
          desc: goodsItem.description,
          price: minPrice,
          picture: goodsItem.mainPicture || '',
        };
      }),
    );

    return result;
  }

  // *获取商品详情（购买页）
  async getGoodsDetail(goodsId: number) {
    const goods = await this.goodsRepo.findOne({
      where: {
        id: goodsId,
        isReviewed: true,
        isReviewedSeccuss: true,
        status: true,
      },
      relations: ['category', 'merchant', 'brandRelation'],
    });

    if (!goods) {
      throw new Error('商品不存在');
    }

    const goodsInfo = await this.goodsInfoRepo.findOne({
      where: { goodsId: goods.id },
    });

    // 获取该商品的所有SKU（先尝试已上架的，如果没有则获取所有）
    let skus = await this.skuRepo.find({
      where: { goodsId: goods.id, isLaunching: true },
    });

    // 如果没有已上架的SKU，则获取所有SKU
    if (skus.length === 0) {
      skus = await this.skuRepo.find({
        where: { goodsId: goods.id },
      });
    }

    const skuIds = skus.map((sku) => sku.id);
    const inventories = await this.inventoryRepo.find({
      where: { skuId: In(skuIds) },
    });

    const inventoryMap = new Map(inventories.map((inv) => [inv.skuId, inv]));

    const totalInventory = inventories.reduce((sum, inv) => sum + inv.stock, 0);

    const skuList = skus.map((sku) => {
      const inventory = inventoryMap.get(sku.id);
      return {
        skusId: sku.id,
        skuCode: sku.skuCode || '',
        price: Number(sku.price).toFixed(2),
        oldPrice: Number(sku.price).toFixed(2),
        inventory: inventory ? inventory.stock : 0,
        picture: sku.picture || '',
        specs: sku.specs || [],
      };
    });

    const specMap = new Map<
      string,
      { name: string; picture: string; desc: string; inventory: number }[]
    >();
    for (const sku of skus) {
      const inventory = inventoryMap.get(sku.id);
      const skuInventory = inventory ? inventory.stock : 0;
      for (const spec of sku.specs || []) {
        const key = spec.name;
        if (!specMap.has(key)) {
          specMap.set(key, []);
        }
        const values = specMap.get(key)!;
        if (!values.some((v) => v.name === spec.value)) {
          values.push({
            name: spec.value,
            picture: sku.picture || '',
            desc: '',
            inventory: skuInventory,
          });
        }
      }
    }

    const specs = Array.from(specMap.entries()).map(([name, values]) => ({
      name,
      id: `1-${name}`,
      values,
    }));

    const categories: Array<{
      id: string;
      name: string;
      layer: number;
      parent: null;
    }> = [];
    if (goods.category) {
      categories.push({
        id: String(goods.category.id),
        name: goods.category.name,
        layer: 2,
        parent: null,
      });
    }

    return {
      id: String(goods.id),
      name: goods.name,
      spuCode: `goods-spu-${goods.id}`,
      desc: goods.description,
      price: skus.length > 0 ? Number(skus[0].price).toFixed(2) : '0.00',
      oldPrice: skus.length > 0 ? Number(skus[0].price).toFixed(2) : '0.00',
      discount: 1,
      inventory: totalInventory,
      brand: goods.merchant?.name || '',
      merchantId: goods.merchant?.id || null, // 返回商家ID，供AI对话使用
      salesCount: goodsInfo?.salesCount || 0,
      commentCount: goodsInfo?.commentCount || 0,
      collectCount: goodsInfo?.collectCount || 0,
      mainVideos: goodsInfo?.videoUrl ? [goodsInfo.videoUrl] : [],
      videoScale: null,
      smallPictures: goodsInfo?.smallPictures || [],
      bigPictures: goodsInfo?.bigPictures || [],
      skus: skuList,
      specs,
      categories,
    };
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
