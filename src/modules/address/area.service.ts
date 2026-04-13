import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Area } from './entities/area.entity';
import { RedisService } from '../db/redis/redis.service';
import { RedisKeys } from '../../common/constants/redis-key.constant';
import { RedisTTL } from '../../common/constants/redis-TTL.constant';

@Injectable()
export class AreaService implements OnModuleInit {
  private readonly logger = new Logger(AreaService.name);

  constructor(
    @InjectRepository(Area)
    private readonly areaRepo: Repository<Area>,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit() {
    await this.warmUpAreaCache();
  }

  /**
   * 预热区划缓存：将所有区划 ext_id 写入布隆过滤器 + 预热省级缓存
   */
  async warmUpAreaCache() {
    try {
      const areas = await this.areaRepo.find({ select: ['extId'] });
      const bloomKey = RedisKeys.BLOOM.AREA_IDS;

      for (const area of areas) {
        await this.redisService.addItem(bloomKey, area.extId);
      }

      this.logger.log(
        `✅ 区划缓存预热完成，共加载 ${areas.length} 条区划到布隆过滤器`,
      );

      // 预热省级数据（pid=0）
      void this.getChildren(0);
    } catch (error) {
      this.logger.error('❌ 区划缓存预热失败:', error);
    }
  }

  /**
   * 检查区划编码是否存在（布隆过滤器，防缓存穿透）
   */
  async areaCodeExists(extId: string): Promise<boolean> {
    return this.redisService.itemExists(RedisKeys.BLOOM.AREA_IDS, extId);
  }

  /**
   * 根据父级ID获取下级区划列表（级联选择用）
   * 三防缓存：布隆防穿透 + 互斥锁防击穿 + 随机TTL防雪崩
   * @param pid 父级ID，0 表示查省级
   */
  async getChildren(pid = 0): Promise<Area[]> {
    const cacheKey = RedisKeys.AREA.getCascadeAreaKey(String(pid));

    // 1. 查缓存（带逻辑过期，防雪崩）
    const { data: cached, isExpired } =
      await this.redisService.getWithLogicExpire<Area[]>(cacheKey);

    if (cached && !isExpired) {
      return cached;
    }

    // 2. 缓存失效，加互斥锁回源（防击穿）
    const hasLock = await this.redisService.tryCascadeAreaLock(pid);

    if (hasLock) {
      try {
        const areas = await this.areaRepo.find({
          where: { pid },
          order: { id: 'ASC' },
        });

        // 设置缓存，带逻辑过期 + 随机偏移（防雪崩）
        const expireSeconds =
          Number(RedisTTL.CACHE.AREA_CASCADE) +
          Math.floor(Math.random() * 3600);
        await this.redisService.setWithLogicExpire(
          cacheKey,
          areas,
          expireSeconds,
        );

        return areas;
      } finally {
        await this.redisService.unlockCascadeAreaLock(pid);
      }
    } else {
      // 没拿到锁，返回旧数据或等重试
      if (cached) {
        return cached;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.getChildren(pid);
    }
  }

  /**
   * 根据行政区划编码获取单个区划
   */
  async getByCode(extId: string) {
    return this.areaRepo.findOne({ where: { extId } });
  }

  /**
   * 批量根据编码获取名称（用于 Address 列表回填）
   */
  async getNamesByCodes(codes: string[]) {
    if (!codes || codes.length === 0) return {};
    const areas = await this.areaRepo.find({
      where: codes.map((code) => ({ extId: code })),
    });
    return Object.fromEntries(areas.map((a) => [a.extId, a.name]));
  }

  /**
   * 模糊搜索区划（支持拼音首字母和名称）
   */
  async search(keyword: string, limit = 20) {
    if (!keyword || keyword.trim().length === 0) return [];
    const kw = keyword.trim();
    return this.areaRepo.find({
      where: [
        { name: Like(`%${kw}%`) },
        { pinyinPrefix: Like(`%${kw}%`) },
        { pinyin: Like(`%${kw}%`) },
      ],
      take: limit,
      order: { deep: 'ASC', id: 'ASC' },
    });
  }

  /**
   * 根据区划编码追溯完整层级路径
   * 返回 { province, city, district, street } 的 Area 对象
   */
  async getFullAreaPath(extId: string): Promise<{
    province: Area | null;
    city: Area | null;
    district: Area | null;
    street: Area | null;
  }> {
    const result = {
      province: null as Area | null,
      city: null as Area | null,
      district: null as Area | null,
      street: null as Area | null,
    };

    const area = await this.areaRepo.findOne({ where: { extId } });
    if (!area) return result;

    // 按层级直接赋值，然后沿 pid 向上追溯
    const deepMap: Record<number, keyof typeof result> = {
      0: 'province',
      1: 'city',
      2: 'district',
      3: 'street',
    };

    result[deepMap[area.deep]] = area;

    // 向上追溯（最多4层）
    let current = area;
    for (let i = 0; i < 4 && current.pid !== 0; i++) {
      const parent = await this.areaRepo.findOne({
        where: { id: current.pid },
      });
      if (!parent) break;
      result[deepMap[parent.deep]] = parent;
      current = parent;
    }

    return result;
  }
}
