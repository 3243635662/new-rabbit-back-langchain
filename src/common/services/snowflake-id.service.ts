import {
  Injectable,
  OnModuleInit,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Snowflake } from 'nodejs-snowflake';

/**
 * Snowflake ID 生成服务
 *
 * 特点：
 * 1. 分布式系统中生成全局唯一 ID
 * 2. ID 是有序的（基于时间戳）
 * 3. 无需依赖中心化服务
 * 4. 性能极高（100万+ ops/sec）
 *
 * 配置说明：
 * - SNOWFLAKE_WORKER_ID: 工作机器ID (0-31)
 * - SNOWFLAKE_CENTER_ID: 数据中心ID (0-31)
 * - SNOWFLAKE_EPOCH: 自定义时间戳起点 (毫秒)
 */
@Injectable()
export class SnowflakeIdService implements OnModuleInit {
  private snowflake: Snowflake;
  private readonly logger = new Logger(SnowflakeIdService.name);

  // 配置参数
  private workerId: number;
  private datacenterId: number;
  private epoch: number;
  private instanceId: number;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 模块初始化时执行
   */
  onModuleInit() {
    this.initializeSnowflake();
  }

  /**
   * 初始化 Snowflake
   */
  private initializeSnowflake(): void {
    // ✅ 1. 从环境变量读取配置（显式转换为 number，避免字符串传入原生层）
    const workerIdRaw = this.configService.get<string | number>(
      'SNOWFLAKE_WORKER_ID',
      1,
    );
    const datacenterIdRaw = this.configService.get<string | number>(
      'SNOWFLAKE_CENTER_ID',
      1,
    );
    const epochRaw = this.configService.get<string | number>(
      'SNOWFLAKE_EPOCH',
      1609459200000, // 2021-01-01
    );

    this.workerId = Number(workerIdRaw);
    this.datacenterId = Number(datacenterIdRaw);
    this.epoch = Number(epochRaw);

    // ✅ 2. 验证配置
    this.validateConfig();

    // ✅ 3. 计算 instance_id
    // 标准雪花算法：instance_id = (datacenterId << 5) | workerId
    // 即：instance_id = datacenterId * 32 + workerId
    this.instanceId = (this.datacenterId << 5) | this.workerId;

    // ✅ 4. 初始化 Snowflake 实例
    this.snowflake = new Snowflake({
      instance_id: this.instanceId,
      custom_epoch: this.epoch,
    });

    // ✅ 5. 记录初始化信息
    this.logger.log('═══════════════════════════════════════════════════════');
    this.logger.log('✅ Snowflake ID 生成器初始化成功');
    this.logger.log(`   工作机器ID (workerId): ${this.workerId}`);
    this.logger.log(`   数据中心ID (datacenterId): ${this.datacenterId}`);
    this.logger.log(`   合并实例ID (instanceId): ${this.instanceId}`);
    this.logger.log(
      `   自定义时间戳起点: ${new Date(this.epoch).toISOString()}`,
    );
    this.logger.log('═══════════════════════════════════════════════════════');
  }

  /**
   * 验证配置参数
   */
  private validateConfig(): void {
    // workerId 范围：0-31 (5位二进制)
    if (
      !Number.isInteger(this.workerId) ||
      this.workerId < 0 ||
      this.workerId > 31
    ) {
      throw new ServiceUnavailableException(
        `❌ SNOWFLAKE_WORKER_ID 必须在 0-31 之间，当前值: ${this.workerId}`,
      );
    }

    // datacenterId 范围：0-31 (5位二进制)
    if (
      !Number.isInteger(this.datacenterId) ||
      this.datacenterId < 0 ||
      this.datacenterId > 31
    ) {
      throw new ServiceUnavailableException(
        `❌ SNOWFLAKE_CENTER_ID 必须在 0-31 之间，当前值: ${this.datacenterId}`,
      );
    }

    // epoch 必须是正数
    if (!Number.isFinite(this.epoch) || this.epoch <= 0) {
      throw new ServiceUnavailableException(
        `❌ SNOWFLAKE_EPOCH 必须大于0，当前值: ${this.epoch}`,
      );
    }

    this.logger.debug('✅ 配置验证通过');
  }

  /**
   * 生成唯一 ID
   * @returns 返回字符串格式的 ID（安全性考虑）
   */
  generate(): string {
    const id = this.snowflake.getUniqueID();
    return id.toString();
  }

  /**
   * 生成订单 ID
   */
  generateOrderId(): string {
    return this.generate();
  }

  /**
   * 生成订单项 ID
   */
  generateOrderItemId(): string {
    return this.generate();
  }

  /**
   * 生成支付记录 ID
   */
  generatePaymentId(): string {
    return this.generate();
  }

  /**
   * 生成购物车 ID
   */
  generateCartId(): string {
    return this.generate();
  }

  /**
   * 批量生成 ID
   * @param count 生成数量
   * @returns ID 数组
   */
  generateBatch(count: number): string[] {
    if (count <= 0) {
      throw new ServiceUnavailableException('生成数量必须大于0');
    }

    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(this.generate());
    }
    return ids;
  }

  /**
   * 从 ID 中提取时间戳
   * @param id Snowflake ID
   * @returns 时间戳（毫秒）
   */
  getTimestampFromId(id: string | bigint): number {
    const bigIntId = typeof id === 'string' ? BigInt(id) : id;
    return Number(Snowflake.timestampFromID(bigIntId, this.epoch));
  }

  /**
   * 从 ID 中提取实例 ID
   * @param id Snowflake ID
   * @returns 实例 ID (0-1023)
   */
  getInstanceIdFromId(id: string | bigint): number {
    const bigIntId = typeof id === 'string' ? BigInt(id) : id;
    return Number(Snowflake.instanceIDFromID(bigIntId));
  }

  /**
   * 从 ID 中提取工作机器 ID
   * @param id Snowflake ID
   * @returns 工作机器 ID (0-31)
   */
  getWorkerIdFromId(id: string | bigint): number {
    const instanceId = this.getInstanceIdFromId(id);
    return instanceId & 0x1f; // 取低 5 位
  }

  /**
   * 从 ID 中提取数据中心 ID
   * @param id Snowflake ID
   * @returns 数据中心 ID (0-31)
   */
  getDatacenterIdFromId(id: string | bigint): number {
    const instanceId = this.getInstanceIdFromId(id);
    return (instanceId >> 5) & 0x1f; // 取高 5 位
  }

  /**
   * 解析 ID 获取完整信息
   * @param id Snowflake ID
   * @returns 包含时间戳、工作机器ID、数据中心ID等信息
   */
  parseId(id: string | bigint): {
    id: string;
    timestamp: number;
    generatedAt: Date;
    instanceId: number;
    workerId: number;
    datacenterId: number;
  } {
    const idStr = typeof id === 'string' ? id : id.toString();
    const timestamp = this.getTimestampFromId(id);
    const instanceId = this.getInstanceIdFromId(id);
    const workerId = this.getWorkerIdFromId(id);
    const datacenterId = this.getDatacenterIdFromId(id);

    return {
      id: idStr,
      timestamp,
      generatedAt: new Date(timestamp),
      instanceId,
      workerId,
      datacenterId,
    };
  }

  /**
   * 获取当前配置信息
   */
  getConfig(): {
    workerId: number;
    datacenterId: number;
    instanceId: number;
    epoch: number;
    epochDate: Date;
  } {
    return {
      workerId: this.workerId,
      datacenterId: this.datacenterId,
      instanceId: this.instanceId,
      epoch: this.epoch,
      epochDate: new Date(this.epoch),
    };
  }

  /**
   * 根据时间戳生成 ID
   * @param timestamp 时间戳（毫秒）
   * @returns 生成的 ID
   */
  generateFromTimestamp(timestamp: number): string {
    const id = this.snowflake.idFromTimestamp(timestamp);
    return id.toString();
  }

  /**
   * 获取当前实例 ID
   */
  getInstanceId(): number {
    return this.snowflake.instanceID();
  }

  /**
   * 获取自定义时间戳起点
   */
  getCustomEpoch(): number {
    return this.snowflake.customEpoch();
  }
}
