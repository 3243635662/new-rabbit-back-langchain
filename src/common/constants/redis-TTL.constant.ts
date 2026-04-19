/**
 * Redis TTL (Time To Live) 常量定义
 * 应用程序中使用的所有 Redis 过期时间都应在此处定义，以便于统一管理。
 */

export const RedisTTL = {
  /**
   * 定时任务相关的过期时间
   */
  SCHEDULER: {
    ORDER_TIMEOUT_LOCK: 55, // 订单超时任务锁 (55秒) - 小于任务间隔，防多实例重复执行
  },

  /**
   * 订单超时配置
   */
  ORDER_TIMEOUT: {
    PAYMENT_MINUTES: 20, // 支付超时时间 (20分钟)
  },

  /**
   * 锁相关的过期时间
   */
  LOCK: {
    ORDER_CREATE: 5, // 订单创建锁 (5秒) - 防止短时间重复创建订单
    PAYMENT: 10, // 支付锁 (10秒) - 防止重复支付
    STOCK: 5, // 库存锁 (5秒) - 防止库存超卖
    MENU_ROUTE: 10, // 菜单路由锁 (10秒) - 防止缓存击穿
    CLIENT_HOME_CAROUSEL: 10, // 首页轮播图锁 (10秒) - 防止缓存击穿
    CLIENT_HOME_SIDE_RECOMMENDATION: 10, // 首页侧边推荐锁 (10秒) - 防止缓存击穿
    AREA_CASCADE: 10, // 地区级联锁 (10秒) - 防止缓存击穿
  },

  /**
   * 缓存相关的过期时间
   */
  CACHE: {
    CLIENT_HOME_DEFAULT: 86400, // 首页默认缓存 (1天) - 客户端首页轮播图和推荐

    MENU_ROUTE_BASE: 36000000, // 菜单路由基础缓存 (1小时) - 角色菜单路由

    AREA_CASCADE: 86400, // 地区级联缓存 (1天) - 区划数据变更极少

    ORDER_NO_COUNTER: 172800, // 订单号计数器 (2天) - 防止内存溢出
    ORDER_NO_MAP: 3600, // 订单号映射 (1小时) - 通过业务订单号快速查询订单ID
    ORDER_INFO: 3600, // 订单信息 (1小时) - 缓存完整订单信息
    ORDER_ITEMS: 3600, // 订单项 (1小时) - 缓存订单中的商品项
    ORDER_USER_LIST: 1800, // 用户订单列表 (30分钟) - 分页缓存
    ORDER_PAYMENT: 3600, // 订单支付信息 (1小时) - 缓存支付详情
    ORDER_PAYMENT_STATUS: 10, // 支付状态 (10秒) - 标记订单是否正在支付
    ORDER_SHIPMENT: 3600, // 发货信息 (1小时) - 缓存物流信息
    ORDER_STATISTICS_GLOBAL: 3600, // 全局统计 (1小时) - 缓存全局订单统计数据
    ORDER_USER_STATS: 1800, // 用户统计 (30分钟) - 缓存用户订单统计数据

    // *═══════════════════════════════════════════════════════
    // *AI 聊天记忆模块 (Chat Memory)
    // *═══════════════════════════════════════════════════════
    CHAT_HISTORY: 604800, // 会话消息历史 (7天) - 不活跃自动过期，每次对话续期
    CHAT_USER_SESSIONS: 604800, // 用户活跃会话集合 (7天) - 跟随会话历史过期
  },

  /**
   * 聊天同步锁相关的过期时间
   */
  CHAT_LOCK: {
    SYNC: 30, // 会话同步锁 (30秒) - 防止并发同步
  },
};
