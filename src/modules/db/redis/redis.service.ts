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
// 定义不同的布隆过滤器键名
export const BloomFilters = RedisKeys.BLOOM;

@Injectable()
// 继承生命钩子
export class RedisService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly configService: ConfigService) {}
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);
  private readonly BLOOM_KEY = RedisKeys.BLOOM.USER_IDS;
  private readonly BLOOM_INITIAL_CAPACITY = 100000; // 初始容量
  private readonly BLOOM_ERROR_RATE = 0.01; // 误判率
  // 模块执行的时候执行
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

  /**
   * 通用检查项是否存在
   */
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

  /**
   * 通用添加项
   */
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

  // *将存储数据格式化一下
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

  // *互斥锁开关
  async tryLock(key: string, expire: number): Promise<boolean> {
    const lockKey = RedisKeys.LOCK.getLockKey(key);
    const result = await this.client.set(lockKey, '1', 'EX', expire, 'NX');
    return result === 'OK';
  }

  // *解锁
  async unlock(key: string): Promise<void> {
    const lockKey = RedisKeys.LOCK.getLockKey(key);
    await this.client.del(lockKey);
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
}
