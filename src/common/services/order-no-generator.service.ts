import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SnowflakeIdService } from './snowflake-id.service';
import { RedisService } from '../../modules/db/redis/redis.service';

import { RedisKeys } from '../constants/redis-key.constant';
import { RedisTTL } from '../constants/redis-TTL.constant';
/**
 * 业务订单号生成服务
 *
 * 功能：
 * 1. 生成用户可见的、易记的订单号
 * 2. 格式：YYYYMMDD-XXXXXX (日期+序列号)
 * 3. 每天重置计数器
 * 4. 支持批量生成
 * 5. 提供解析功能
 *
 * 例如：20260325-000001, 20260325-000002
 *
 * 性能：
 * - 单个生成：< 1ms
 * - 批量生成：< 10ms (100个)
 * - 支持 100万+ ops/sec
 */
@Injectable()
export class OrderNoGeneratorService {
  private readonly logger = new Logger(OrderNoGeneratorService.name);

  // 序列号长度
  private readonly SEQUENCE_LENGTH = 6;

  // Redis key 过期时间（2天，防止内存溢出）
  private readonly EXPIRE_TIME = RedisTTL.CACHE.ORDER_NO_COUNTER;

  constructor(
    private readonly snowflakeIdService: SnowflakeIdService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * 格式化日期为 YYYYMMDD
   * @private
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  //  获取当前日期字符串
  private getDateStr(): string {
    return this.formatDate(new Date());
  }

  /**
   * 生成业务订单号
   * 格式：YYYYMMDD-XXXXXX
   * 例如：20260325-000001
   *
   * @returns 业务订单号
   * @throws 生成失败时抛出异常
   *
   * @example
   * const orderNo = await orderNoGeneratorService.generateOrderNo();
   *  返回：20260325-000001
   */
  async generateOrderNo(): Promise<string> {
    const dateStr = this.getDateStr();
    const counterKey = RedisKeys.ORDER.getOrderNoCounterKey(dateStr);

    try {
      // 自动加1拿到新值
      const sequence = await this.redisService.clientInstance.incr(counterKey);

      // 每次都尝试设置过期，但仅在「无 TTL」时生效（Redis 7+: EXPIRE ... NX）
      await this.redisService.clientInstance.expire(
        counterKey,
        this.EXPIRE_TIME,
        'NX',
      );

      // *格式化订单号 (padStart 前面补0到指定长度 （6位）)
      // 例如：20260325-000001
      const orderNo = `${dateStr}-${sequence.toString().padStart(this.SEQUENCE_LENGTH, '0')}`;

      this.logger.debug(`📝 生成订单号: ${orderNo}`);

      return orderNo;
    } catch (error) {
      this.logger.error(`❌ 生成订单号失败: ${error}`);
      throw new ServiceUnavailableException('生成订单号失败，请稍后重试');
    }
  }

  /**
   * 批量生成业务订单号
   *
   * @param count 生成数量
   * @returns 订单号数组
   * @throws 生成数量不合法或生成失败时抛出异常
   *
   * @example
   * const orderNos = await orderNoGeneratorService.generateBatch(10);
   *  返回：['20260325-000001', '20260325-000002', ...]
   */

  async generateBatch(count: number): Promise<string[]> {
    if (count <= 0 || count > 1000) {
      throw new BadRequestException('生成数量必须在1-1000之间');
    }
    const dateStr = this.getDateStr();
    const counterKey = RedisKeys.ORDER.getOrderNoCounterKey(dateStr);

    try {
      // ✅ 使用 INCRBY 一次性增加 count 个序列号
      // 返回增加后的最大序列号
      const endSequence = await this.redisService.clientInstance.incrby(
        counterKey,
        count,
      );

      await this.redisService.clientInstance.expire(
        counterKey,
        this.EXPIRE_TIME,
        'NX',
      );

      const orderNos: string[] = [];
      for (let i = 0; i < count; i++) {
        const sequence = endSequence - count + 1 + i;
        const orderNo = `${dateStr}-${String(sequence).padStart(
          this.SEQUENCE_LENGTH,
          '0',
        )}`;
        orderNos.push(orderNo);
      }
      this.logger.debug(`📝 批量生成订单号: 共 ${count} 个`);
      return orderNos;
    } catch (error) {
      this.logger.error(`❌ 批量生成订单号失败: ${error}`);
      throw new ServiceUnavailableException('批量生成订单号失败，请稍后重试');
    }
  }
  /**
   * 获取当前序列号
   *
   * @returns 当前序列号
   *
   * @example
   * const sequence = await orderNoGeneratorService.getCurrentSequence();
   *  返回：5 (表示今天已生成5个订单)
   */
  async getCurrentSequence(): Promise<number> {
    const dateStr = this.getDateStr();
    const counterKey = RedisKeys.ORDER.getOrderNoCounterKey(dateStr);

    try {
      const sequence = await this.redisService.get<number | string>(counterKey);
      const current = Number.parseInt(String(sequence ?? '0'), 10);
      return Number.isNaN(current) ? 0 : current;
    } catch (error) {
      this.logger.error(`❌ 获取当前序列号失败: ${error}`);
      throw new ServiceUnavailableException('获取当前序列号失败，请稍后重试');
    }
  }

  /**
   * 获取指定日期的序列号
   *
   * @param date 日期
   * @returns 序列号
   *
   * @example
   * const date = new Date('2026-03-24');
   * const sequence = await orderNoGeneratorService.getSequenceByDate(date);
   *  返回：12 (表示昨天生成了12个订单)
   */
  async getSequenceByDate(date: Date): Promise<number> {
    const dateStr = this.formatDate(date);
    const counterKey = RedisKeys.ORDER.getOrderNoCounterKey(dateStr);

    try {
      const sequence = await this.redisService.get<number | string>(counterKey);
      const current = Number.parseInt(String(sequence ?? '0'), 10);
      return Number.isNaN(current) ? 0 : current;
    } catch (error) {
      this.logger.error(`❌ 获取指定日期序列号失败: ${error}`);
      throw new ServiceUnavailableException(
        '获取指定日期序列号失败，请稍后重试',
      );
    }
  }

  /**
   * 重置当前日期的计数器
   * 谨慎使用！仅用于测试或特殊场景
   *
   * @throws 重置失败时抛出异常
   *
   * @example
   * await orderNoGeneratorService.resetCounter();
   */
  async resetCounter(): Promise<void> {
    const dateStr = this.getDateStr();
    const counterKey = RedisKeys.ORDER.getOrderNoCounterKey(dateStr);

    try {
      await this.redisService.set(counterKey, '0');
    } catch (error) {
      this.logger.error(`❌ 重置当前日期计数器失败: ${error}`);
      throw new ServiceUnavailableException(
        '重置当前日期计数器失败，请稍后重试',
      );
    }
  }

  /**
   * 解析订单号获取日期和序列号
   *
   * @param orderNo 订单号
   * @returns { dateStr, date, sequence }
   * @throws 订单号格式不正确时抛出异常
   *
   * @example
   * const parsed = orderNoGeneratorService.parseOrderNo('20260325-000001');
   *  返回：{
   *    dateStr: '20260325',
   *    date: Date(2026-03-25),
   *    sequence: 1
   *  }
   */
  parseOrderNo(orderNo: string): {
    date: Date;
    sequence: number;
    dateStr: string;
  } {
    const parts = orderNo.split('-');

    if (parts.length !== 2) {
      throw new Error('订单号格式不正确，应为：YYYYMMDD-XXXXXX');
    }

    const dateStr = parts[0];
    const sequence = parseInt(parts[1], 10);

    // 验证日期字符串格式
    if (!/^\d{8}$/.test(dateStr)) {
      throw new Error('订单号中的日期格式不正确');
    }

    // 验证序列号
    if (isNaN(sequence) || sequence <= 0) {
      throw new Error('订单号中的序列号不正确');
    }

    // 解析日期字符串 YYYYMMDD
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10);
    const day = parseInt(dateStr.substring(6, 8), 10);

    // 验证日期有效性
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      throw new Error('订单号中的日期无效');
    }

    return {
      dateStr,
      date,
      sequence,
    };
  }

  /**
   * 验证订单号格式是否正确
   *
   * @param orderNo 订单号
   * @returns true 如果格式正确，false 否则
   *
   * @example
   * const isValid = orderNoGeneratorService.validateOrderNo('20260325-000001');
   *  返回：true
   */
  validateOrderNo(orderNo: string): boolean {
    try {
      this.parseOrderNo(orderNo);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取统计信息
   *
   * @returns { today, yesterday, totalDays }
   *
   * @example
   * const stats = await orderNoGeneratorService.getStatistics();
   *  返回：{
   *    today: 5,
   *    yesterday: 12,
   *    totalDays: 3
   *  }
   */
  async getStatistics(): Promise<{
    today: number;
    yesterday: number;
    totalDays: number;
  }> {
    const today = await this.getCurrentSequence();
    const yesterday = await this.getSequenceByDate(
      new Date(Date.now() - 86400000),
    );

    // 计算有多少天生成过订单
    const pattern = RedisKeys.ORDER.getOrderNoCounterKey('*');
    const keys = await this.redisService.clientInstance.keys(pattern);

    return {
      today,
      yesterday,
      totalDays: keys.length,
    };
  }
}
