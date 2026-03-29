/**
 * Redis Key 常量定义
 * 应用程序中使用的所有 Redis Key 都应在此处定义，以便于统一管理。
 */

export const RedisKeys = {
  // 首页模块 (Client Home)
  CLIENT_HOME: {
    CAROUSEL: 'clientHome:carousel', // 首页轮播图
    SIDE_RECOMMENDATION: 'clientHome:carouselSideRecommendation', // 轮播图侧边推荐
  },

  // 认证与用户模块 (Auth / User)
  AUTH: {
    /**
     * 注册邮箱验证码
     * @param email 用户邮箱
     */
    getRegisterCodeKey: (email: string) => `auth:register:code:${email}`,

    /**
     * 注册邮件发送冷却期（防止频繁发送）
     * @param email 用户邮箱
     */
    getRegisterCooldownKey: (email: string) =>
      `auth:register:cooldown:${email}`,

    /**
     * 通用邮件验证码（如需单独使用时）
     * 注意：目前已根据要求与注册验证码统一
     */
    getEmailCodeKey: (email: string) => `auth:emailCode:${email}`,
  },

  // 布隆过滤器 (Bloom Filters)
  BLOOM: {
    USER_IDS: 'bloom:user:ids', // 用户 ID 布隆过滤器
    ORDER_IDS: 'bloom:order:ids', // 订单 ID 布隆过滤器
  },

  // 互斥锁 (Mutex Locks - 用于解决缓存雪崩/击穿)
  LOCK: {
    /**
     * 获取互斥锁 Key
     * @param key 原始缓存 Key
     */
    getLockKey: (key: string) => `lock:${key}`,
  },
} as const;
