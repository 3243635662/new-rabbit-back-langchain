import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import {
  RedisLogicExpireData,
  WhetherRedisLogicExpireDataType,
} from '../../../types/redis.type';
import { RedisKeys } from '../../../common/constants/redis-key.constant';
import { RedisTTL } from '../../../common/constants/redis-TTL.constant';
// 定义不同的布隆过滤器键名
export const BloomFilters = RedisKeys.BLOOM;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly configService: ConfigService) {}
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);

  getClient(): Redis {
    return this.client;
  }
  private readonly BLOOM_KEY = RedisKeys.BLOOM.USER_IDS;
  private readonly BLOOM_INITIAL_CAPACITY = 100000; // 初始容量
  private readonly BLOOM_ERROR_RATE = 0.01; // 误判率

  async onModuleInit() {
    const redisConfig = {
      port: this.configService.get<number>('REDIS_PORT'),
      host: this.configService.get<string>('REDIS_HOST'),
      enableAutoPipelining: true,
      retryStrategy: (times: number) => {
        if (times > 10) {
          return null; // 超过10次放弃重连
        }
        return Math.min(times * 50, 2000); //  重连间隔：50ms → 2000ms
      },
    };
    this.client = new Redis(redisConfig);
    this.client.on('connect', () => {
      this.logger.log('✅ Redis connected');
    });
    try {
      await this.ensureFilterExists(BloomFilters.USER_IDS);
      await this.ensureFilterExists(BloomFilters.ORDER_IDS);
      await this.ensureFilterExists(BloomFilters.ROLE_IDS);
      await this.ensureFilterExists(BloomFilters.AREA_IDS);
      this.logger.log('✅ 布隆过滤器已初始化');
    } catch (error) {
      this.logger.error('❌ 初始化布隆过滤器失败:', error);
    }

    this.watchOnLoad();
  }

  /**
   * ?确保指定的布隆过滤器已存在  解决缓存穿透
   * @param filterKey 过滤器的 Key
   */
  private async ensureFilterExists(filterKey: string): Promise<void> {
    try {
      await this.client.call('bf.info', [filterKey]);
    } catch {
      await this.client.call('bf.reserve', [
        filterKey,
        this.BLOOM_ERROR_RATE.toString(),
        this.BLOOM_INITIAL_CAPACITY.toString(),
      ]);
    }
  }

  // *通用检查项是否存在
  async itemExists(
    filterKey: string,
    value: string | number,
  ): Promise<boolean> {
    const result = await this.client.call('bf.exists', [
      filterKey,
      String(value),
    ]);
    return result === 1;
  }

  // *通用添加项
  async addItem(filterKey: string, value: string | number): Promise<void> {
    // 第一次使用新 key 时可能需要 ensureFilterExists
    await this.client.call('bf.add', [filterKey, String(value)]);
  }

  // ?检查用户ID是否存在于布隆过滤器中
  async userIdExists(userId: number | string): Promise<boolean> {
    const result = await this.client.call('bf.exists', [
      this.BLOOM_KEY,
      String(userId), // ✅ 安全转字符串（兼容 number/string）
    ]);
    return result === 1;
  }

  // *将存储数据格式化
  private formatLogicalData<T>(data: T, expireSeconds: number): string {
    const payload = {
      data: data,
      expireTime: Date.now() + expireSeconds * 1000,
    };
    return JSON.stringify(payload);
  }

  // *设置逻辑过期以及物理过期时间  解决缓存雪崩
  async setWithLogicExpire<T>(
    key: string,
    value: T,
    logicExpireSeconds: number,
  ) {
    // 序列化数据
    const serialized = this.formatLogicalData(value, logicExpireSeconds);

    // 设置物理过期时间 一般比逻辑过期多一点冗余时间 随机设置1-10分钟
    const physicalExpireSeconds =
      logicExpireSeconds + Math.floor(Math.random() * 600) + 60;
    await this.client.set(key, serialized, 'EX', physicalExpireSeconds);
  }

  // *获取数据
  async getWithLogicExpire<T>(
    key: string,
  ): Promise<WhetherRedisLogicExpireDataType<T>> {
    const str = await this.client.get(key);
    if (!str) {
      return {
        data: null,
        isExpired: true,
      };
    }
    try {
      const parsed = JSON.parse(str) as unknown as RedisLogicExpireData<T>;
      const now = Date.now();
      const isExpired = now > parsed.expireTime;
      return {
        data: parsed.data,
        isExpired: isExpired,
      };
    } catch (error) {
      this.logger.error('获取数据失败:', error);
      return {
        data: null,
        isExpired: true,
      };
    }
  }

  // *订单创建锁（防止短时间重复下单）
  async tryOrderCreateLock(
    userId: string,
    expire = RedisTTL.LOCK.ORDER_CREATE,
  ): Promise<boolean> {
    const lockKey = RedisKeys.LOCK.getOrderCreateLockKey(userId);
    return this.tryLockByKey(lockKey, expire);
  }

  async unlockOrderCreateLock(userId: string): Promise<void> {
    const lockKey = RedisKeys.LOCK.getOrderCreateLockKey(userId);
    await this.unlockByKey(lockKey);
  }

  // *订单支付锁（防止重复支付）
  async tryPaymentLock(
    orderId: string,
    expire = RedisTTL.LOCK.PAYMENT,
  ): Promise<boolean> {
    const lockKey = RedisKeys.LOCK.getPaymentLockKey(orderId);
    return this.tryLockByKey(lockKey, expire);
  }

  async unlockPaymentLock(orderId: string): Promise<void> {
    const lockKey = RedisKeys.LOCK.getPaymentLockKey(orderId);
    await this.unlockByKey(lockKey);
  }

  // *库存锁（防止超卖）
  async tryStockLock(
    skuId: string,
    expire = RedisTTL.LOCK.STOCK,
  ): Promise<boolean> {
    const lockKey = RedisKeys.LOCK.getStockLockKey(skuId);
    return this.tryLockByKey(lockKey, expire);
  }

  async unlockStockLock(skuId: string): Promise<void> {
    const lockKey = RedisKeys.LOCK.getStockLockKey(skuId);
    await this.unlockByKey(lockKey);
  }

  // *菜单路由缓存重建锁（防止同一 role 并发回源）
  async tryMenuRouteLock(
    roleId: number,
    expire = RedisTTL.LOCK.MENU_ROUTE,
  ): Promise<boolean> {
    const lockKey = RedisKeys.LOCK.getMenuRouteLockKey(roleId);
    return this.tryLockByKey(lockKey, expire);
  }

  async unlockMenuRouteLock(roleId: number): Promise<void> {
    const lockKey = RedisKeys.LOCK.getMenuRouteLockKey(roleId);
    await this.unlockByKey(lockKey);
  }

  // *客户端首页轮播图缓存重建锁
  async tryClientHomeCarouselLock(
    expire = RedisTTL.LOCK.CLIENT_HOME_CAROUSEL,
  ): Promise<boolean> {
    const lockKey = RedisKeys.LOCK.getClientHomeCarouselLockKey();
    return this.tryLockByKey(lockKey, expire);
  }

  async unlockClientHomeCarouselLock(): Promise<void> {
    const lockKey = RedisKeys.LOCK.getClientHomeCarouselLockKey();
    await this.unlockByKey(lockKey);
  }

  // *客户端首页侧边推荐缓存重建锁
  async tryClientHomeSideRecommendationLock(
    expire = RedisTTL.LOCK.CLIENT_HOME_SIDE_RECOMMENDATION,
  ): Promise<boolean> {
    const lockKey = RedisKeys.LOCK.getClientHomeSideRecommendationLockKey();
    return this.tryLockByKey(lockKey, expire);
  }

  async unlockClientHomeSideRecommendationLock(): Promise<void> {
    const lockKey = RedisKeys.LOCK.getClientHomeSideRecommendationLockKey();
    await this.unlockByKey(lockKey);
  }

  // *地区级联缓存重建锁（防缓存击穿）
  async tryCascadeAreaLock(
    pid: number,
    expire: number = RedisTTL.LOCK.AREA_CASCADE,
  ): Promise<boolean> {
    const lockKey = RedisKeys.LOCK.getCascadeAreaLockKey(pid);
    return this.tryLockByKey(lockKey, expire);
  }

  async unlockCascadeAreaLock(pid: number): Promise<void> {
    const lockKey = RedisKeys.LOCK.getCascadeAreaLockKey(pid);
    await this.unlockByKey(lockKey);
  }

  //  *添加单个用户 ID
  async addUserId(userId: number | string): Promise<void> {
    await this.client.call('bf.add', [this.BLOOM_KEY, String(userId)]);
  }

  // ?销毁的时候执行
  async onModuleDestroy() {
    // ✅ 安全关闭连接
    if (this.client) {
      await this.client.quit();
    }
    this.logger.log('✅ Redis 连接已关闭');
  }

  // *导出redis实例
  get clientInstance(): Redis {
    return this.client;
  }

  // *取
  async get<T>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return data ? JSON.parse(data) : null;
  }

  // *del删
  async del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  // *安全地批量删除指定前缀的所有键
  async delByPrefixSafe(prefix: string): Promise<number> {
    let deleted = 0;
    let cursor = '0';

    do {
      // SCAN 分批扫描，不会阻塞 Redis
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length) {
        deleted += await this.client.del(...keys);
      }
    } while (cursor !== '0');

    return deleted;
  }

  // *set存
  async set<T>(key: string, value: T, expire?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (expire) {
      await this.client.set(key, serialized, 'EX', expire);
    } else {
      await this.client.set(key, serialized);
    }
  }

  watchOnLoad() {
    this.client.on('connect', () => this.logger.log('✅ Redis 已连接'));
    this.client.on('ready', () => this.logger.log('🚀 Redis 已就绪'));
    this.client.on('error', (err) => this.logger.error('❌ Redis 错误', err));
    this.client.on('reconnecting', () =>
      this.logger.warn('🔄 Redis 正在重连...'),
    );
    this.client.on('end', () => this.logger.log('🛑 Redis 连接已关闭'));
  }

  // *尝试获取互斥锁
  private async tryLockByKey(
    lockKey: string,
    expire: number,
  ): Promise<boolean> {
    const result = await this.client.set(lockKey, '1', 'EX', expire, 'NX');
    return result === 'OK';
  }

  // *解锁
  private async unlockByKey(lockKey: string): Promise<void> {
    await this.client.del(lockKey);
  }

  // ─── RAG 实时进度推送（SSE + Redis Pub/Sub） ───

  // 向指定 taskId 频道发布实时进度
  async publishProgress(
    taskId: string,
    data: {
      progress: number;
      status: string;
      message?: string;
      failReason?: string;
    },
  ) {
    const channel = RedisKeys.RAG.getProgressChannel(taskId);
    await this.client.publish(channel, JSON.stringify(data));
  }

  /** 缓存最新进度（SSE 连接时先推缓存，防消息丢失） */
  async setProgressCache(taskId: string, data: object, expireSeconds = 3600) {
    const key = RedisKeys.RAG.getProgressDataKey(taskId);
    await this.client.set(key, JSON.stringify(data), 'EX', expireSeconds);
  }

  /** 读取缓存进度 */
  async getProgressCache(
    taskId: string,
  ): Promise<Record<string, unknown> | null> {
    const key = RedisKeys.RAG.getProgressDataKey(taskId);
    const data = await this.client.get(key);
    return data ? (JSON.parse(data) as Record<string, unknown>) : null;
  }

  /** 创建独立订阅客户端（SSE 用，必须独立连接） */
  createSubscriber(): Redis {
    return this.client.duplicate();
  }
}
