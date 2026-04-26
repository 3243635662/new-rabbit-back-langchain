import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../modules/db/redis/redis.service';
import { SnowflakeIdService } from '../common/services/snowflake-id.service';
import { RedisKeys } from '../common/constants/redis-key.constant';
import { RedisTTL } from '../common/constants/redis-TTL.constant';
import { ChatSession, ChatSessionStatus } from './entities/chat-session.entity';
import { ChatMessage, MessageRole } from './entities/chat-message.entity';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';

/**
 * Redis 中存储的消息格式
 */
export interface RedisChatMessage {
  role: 'human' | 'ai' | 'system';
  content: string;
  reasoning?: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    private readonly redisService: RedisService,
    private readonly snowflakeId: SnowflakeIdService,
  ) {}

  // ══════════════════════════════════════════════════════
  // 会话管理
  // ══════════════════════════════════════════════════════

  /**
   * 创建新会话
   * 同时写入 MySQL 和 Redis
   */
  createSession = async (
    userId: string,
    title = '新对话',
  ): Promise<ChatSession> => {
    const id = this.snowflakeId.generate();
    const session = this.sessionRepo.create({ id, userId, title });
    const saved = await this.sessionRepo.save(session);

    // 写入 Redis 活跃会话集合
    const userSessionsKey = RedisKeys.CHAT.getUserSessionsKey(userId);
    const redis = this.redisService.clientInstance;
    await redis.sadd(userSessionsKey, id);
    await redis.expire(userSessionsKey, RedisTTL.CACHE.CHAT_USER_SESSIONS);

    return saved;
  };

  /**
   * 获取用户的会话列表（从 MySQL）
   */
  getUserSessions = async (userId: string): Promise<ChatSession[]> => {
    return this.sessionRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  };

  /**
   * 获取单个会话信息
   */
  getSession = async (sessionId: string): Promise<ChatSession> => {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`会话 ${sessionId} 不存在`);
    }
    return session;
  };

  /**
   * 结束会话 → 同步 Redis → MySQL，标记为已结束
   */
  endSession = async (sessionId: string): Promise<void> => {
    // 先同步到 MySQL
    await this.syncToMySQL(sessionId);

    // 标记会话为已结束
    await this.sessionRepo.update(sessionId, {
      status: ChatSessionStatus.ENDED,
    });

    // 清理 Redis 中的热数据
    const historyKey = RedisKeys.CHAT.getHistoryKey(sessionId);
    await this.redisService.del(historyKey);
  };

  /**
   * 删除会话及其所有消息
   */
  deleteSession = async (sessionId: string): Promise<void> => {
    // 删 MySQL
    await this.messageRepo.delete({ sessionId });
    await this.sessionRepo.delete(sessionId);

    // 删 Redis
    const historyKey = RedisKeys.CHAT.getHistoryKey(sessionId);
    await this.redisService.del(historyKey);
  };

  // ══════════════════════════════════════════════════════
  // 消息读写 — Redis 临时层 + MySQL 持久层
  // ══════════════════════════════════════════════════════

  /**
   * 追加消息到 Redis（对话时调用）
   * 每次追加自动续期 TTL
   */
  appendMessage = async (
    sessionId: string,
    role: 'human' | 'ai' | 'system',
    content: string,
    reasoning?: string,
  ): Promise<void> => {
    const historyKey = RedisKeys.CHAT.getHistoryKey(sessionId);
    const redis = this.redisService.clientInstance;

    const msg: RedisChatMessage = { role, content };
    if (reasoning) msg.reasoning = reasoning;

    await redis.rpush(historyKey, JSON.stringify(msg));
    // 续期 TTL
    await redis.expire(historyKey, RedisTTL.CACHE.CHAT_HISTORY);

    // 加入用户活跃会话集合
    // 从 session 获取 userId（先查 Redis 缓存，避免频繁查 DB）
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: ['userId'],
    });
    if (session) {
      const userSessionsKey = RedisKeys.CHAT.getUserSessionsKey(session.userId);
      await redis.sadd(userSessionsKey, sessionId);
      await redis.expire(userSessionsKey, RedisTTL.CACHE.CHAT_USER_SESSIONS);
    }
  };

  /**
   * 从 Redis 获取消息列表（LangChain BaseMessage 格式）
   * Redis 没有 → 查 MySQL → 写回 Redis
   */
  getMessages = async (sessionId: string): Promise<BaseMessage[]> => {
    const rawMessages = await this.getRawMessages(sessionId);
    return rawMessages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'human') return new HumanMessage(m.content);
        return new AIMessage(m.content);
      });
  };

  /**
   * 获取原始消息列表（用于 API 返回）
   * 先查 Redis → 没有 → 查 MySQL → 写回 Redis
   */
  getRawMessages = async (sessionId: string): Promise<RedisChatMessage[]> => {
    const historyKey = RedisKeys.CHAT.getHistoryKey(sessionId);
    const redis = this.redisService.clientInstance;

    // ① 先查 Redis
    const cached = await redis.lrange(historyKey, 0, -1);
    if (cached.length > 0) {
      return cached.map((item) => JSON.parse(item) as RedisChatMessage);
    }

    // ② Redis 没有 → 查 MySQL
    const dbMessages = await this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });

    if (dbMessages.length === 0) return [];

    // ③ 写回 Redis 缓存
    const pipeline = redis.pipeline();
    const historyKeyForPipe = historyKey;
    for (const msg of dbMessages) {
      const redisMsg: RedisChatMessage = {
        role: msg.role as 'human' | 'ai' | 'system',
        content: msg.content,
      };
      if (msg.reasoning) redisMsg.reasoning = msg.reasoning;
      pipeline.rpush(historyKeyForPipe, JSON.stringify(redisMsg));
    }
    pipeline.expire(historyKeyForPipe, RedisTTL.CACHE.CHAT_HISTORY);
    await pipeline.exec();

    return dbMessages.map((msg) => ({
      role: msg.role as 'human' | 'ai' | 'system',
      content: msg.content,
      reasoning: msg.reasoning || undefined,
    }));
  };

  // ══════════════════════════════════════════════════════
  // Redis → MySQL 同步
  // ══════════════════════════════════════════════════════

  /**
   * 将 Redis 中的消息同步到 MySQL
   * 1. 读取 Redis 全部消息
   * 2. 查 MySQL 已有消息数量（offset）
   3. 只追加 Redis 比 MySQL 多出的消息
   * 4. 更新会话最后活跃时间
   */
  syncToMySQL = async (sessionId: string): Promise<void> => {
    // 同步锁，防止并发
    const lockKey = RedisKeys.CHAT.getSyncLockKey(sessionId);
    const redis = this.redisService.clientInstance;
    const locked = await redis.set(
      lockKey,
      '1',
      'EX',
      RedisTTL.CHAT_LOCK.SYNC,
      'NX',
    );
    if (locked !== 'OK') {
      this.logger.warn(`会话 ${sessionId} 正在同步中，跳过`);
      return;
    }

    try {
      const historyKey = RedisKeys.CHAT.getHistoryKey(sessionId);
      const cached = await redis.lrange(historyKey, 0, -1);
      if (cached.length === 0) return;

      // 查 MySQL 已有多少条消息
      const dbCount = await this.messageRepo.count({ where: { sessionId } });

      // 只追加差量
      if (cached.length > dbCount) {
        const newMessages = cached.slice(dbCount);
        const msgs = newMessages.map((item) => {
          const parsed = JSON.parse(item) as RedisChatMessage;
          const msg = new ChatMessage();
          msg.id = this.snowflakeId.generate();
          msg.sessionId = sessionId;
          msg.role = parsed.role as MessageRole;
          msg.content = parsed.content;
          msg.reasoning = parsed.reasoning || null;
          return msg;
        });

        await this.messageRepo.insert(msgs);

        // 更新会话标题（如果是第一条消息）
        if (dbCount === 0) {
          const firstMsg = JSON.parse(cached[0]) as RedisChatMessage;
          const title = firstMsg.content.slice(0, 50);
          await this.sessionRepo.update(sessionId, { title });
        }

        // 更新会话最后活跃时间
        await this.sessionRepo.update(sessionId, {
          updatedAt: new Date(),
        });

        this.logger.log(
          `会话 ${sessionId} 同步完成: ${newMessages.length} 条新消息`,
        );
      }
    } finally {
      // 释放锁
      await redis.del(lockKey);
    }
  };

  /**
   * 批量同步用户所有活跃会话（定时任务用）
   */
  syncUserSessions = async (userId: string): Promise<void> => {
    const userSessionsKey = RedisKeys.CHAT.getUserSessionsKey(userId);
    const redis = this.redisService.clientInstance;
    const sessionIds = await redis.smembers(userSessionsKey);

    for (const sessionId of sessionIds) {
      try {
        await this.syncToMySQL(sessionId);
      } catch (err) {
        this.logger.error(`同步会话 ${sessionId} 失败:`, err);
      }
    }
  };

  /**
   * 同步所有活跃会话（全局定时任务用）
   * 扫描 Redis 中 chat:user:sessions:* 的所有 key
   */
  syncAllActiveSessions = async (): Promise<void> => {
    const redis = this.redisService.clientInstance;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        'chat:user:sessions:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        const sessionIds = await redis.smembers(key);
        for (const sessionId of sessionIds) {
          try {
            await this.syncToMySQL(sessionId);
          } catch (err) {
            this.logger.error(`同步会话 ${sessionId} 失败:`, err);
          }
        }
      }
    } while (cursor !== '0');

    this.logger.log('全部活跃会话同步完成');
  };

  // ══════════════════════════════════════════════════════
  // 会话标题更新
  // ══════════════════════════════════════════════════════

  /**
   * 更新会话标题
   */
  updateSessionTitle = async (
    sessionId: string,
    title: string,
  ): Promise<void> => {
    await this.sessionRepo.update(sessionId, { title });
  };
}
