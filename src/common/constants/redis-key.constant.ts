/**
 * Redis Key 常量定义
 * 应用程序中使用的所有 Redis Key 都应在此处定义，以便于统一管理。
 */

export const RedisKeys = {
  // *═══════════════════════════════════════════════════════
  // *客户端首页模块 (Client Home)
  // *═══════════════════════════════════════════════════════
  CLIENT_HOME: {
    CAROUSEL: 'clientHome:carousel', // 首页轮播图
    SIDE_RECOMMENDATION: 'clientHome:carouselSideRecommendation', // 轮播图侧边推荐
  },

  // *═══════════════════════════════════════════════════════
  // *认证与用户模块 (Auth / User)
  // *═══════════════════════════════════════════════════════
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

  // *═══════════════════════════════════════════════════════
  // *布隆过滤器 (Bloom Filters)
  // *═══════════════════════════════════════════════════════
  BLOOM: {
    USER_IDS: 'bloom:user:ids', // 用户 ID 布隆过滤器
    ORDER_IDS: 'bloom:order:ids', // 订单 ID 布隆过滤器
    ROLE_IDS: 'bloom:role:ids', // 角色 ID 布隆过滤器
    AREA_IDS: 'bloom:area:ids', // 地区 ID 布隆过滤器
  },

  // *═══════════════════════════════════════════════════════
  // *互斥锁 (Mutex Locks - 用于解决缓存雪崩/击穿)
  // *═══════════════════════════════════════════════════════
  // *═══════════════════════════════════════════════════════
  // *定时任务锁 (Scheduler Locks - 防止多实例重复执行)
  // *═══════════════════════════════════════════════════════
  SCHEDULER: {
    /**
     * 订单超时取消任务锁
     * 格式：scheduler:order:timeout:lock
     *
     * *说明：
     * - 防止多实例部署时重复执行超时取消任务
     * - 55秒过期（小于定时任务间隔60秒，确保锁不会跨周期残留）
     * - 使用 SET NX 原子操作
     */
    ORDER_TIMEOUT_LOCK: 'scheduler:order:timeout:lock',
  },

  LOCK: {
    /**
     * 获取互斥锁 Key
     * @param key 原始缓存 Key
     */
    getLockKey: (key: string) => `lock:${key}`,

    /**
     * 订单支付锁（防重复支付）
     * 格式：lock:payment:{orderId}
     * @param orderId 订单 ID (Snowflake)
     * @example lock:payment:1709875234567890123
     *
     * *说明：
     * - 防止用户重复支付同一个订单
     * - 10秒过期
     * - 使用 SET NX 原子操作
     */
    getPaymentLockKey: (orderId: string) => `lock:payment:${orderId}`,

    /**
     * 订单创建锁（防重复创建）
     * 格式：lock:order:create:{userId}
     * @param userId 用户 ID (Snowflake)
     * @example lock:order:create:1234567890123456789
     *
     * *说明：
     * - 防止用户短时间内重复创建订单
     * - 5秒过期
     * - 使用 SET NX 原子操作
     */
    getOrderCreateLockKey: (userId: string) => `lock:order:create:${userId}`,

    /**
     * 库存锁（防止超卖）
     * 格式：lock:stock:{skuId}
     * @param skuId SKU ID (Snowflake)
     * @example lock:stock:1234567890123456789
     *
     * *说明：
     * - 防止库存超卖
     * - 5秒过期
     * - 使用 SET NX 原子操作
     */
    getStockLockKey: (skuId: string) => `lock:stock:${skuId}`,

    /**
     * 菜单路由缓存重建锁（防缓存击穿）
     * 格式：lock:menu:route:{roleId}
     * @param roleId 角色 ID
     * @example lock:menu:route:1
     */
    getMenuRouteLockKey: (roleId: number) => `lock:menu:route:${roleId}`,

    /**
     * 客户端首页轮播图缓存重建锁
     * 格式：lock:clientHome:carousel
     */
    getClientHomeCarouselLockKey: () => `lock:clientHome:carousel`,

    /**
     * 客户端首页侧边推荐缓存重建锁
     * 格式：lock:clientHome:sideRecommendation
     */
    getClientHomeSideRecommendationLockKey: () =>
      `lock:clientHome:sideRecommendation`,

    /**
     * 地区级联缓存重建锁（防缓存击穿）
     * 格式：lock:area:cascade:{pid}
     * @param pid 父级ID
     */
    getCascadeAreaLockKey: (pid: number) => `lock:area:cascade:${pid}`,
  },

  // *═══════════════════════════════════════════════════════
  // *用户信息模块 (User)
  // *═══════════════════════════════════════════════════════
  USER: {
    /**
     * 获取用户信息 Key
     * @param id 用户 ID
     */
    getUserInfoKey: (id: string) => `user:info:${id}`,
  },

  // 菜单模块
  MENU: {
    /**
     * 获取角色路由 Key
     * @param roleId 角色 ID
     */
    getRoleRouteKey: (roleId: number) => `menu:role:route:${roleId}`,
  },

  // *═══════════════════════════════════════════════════════
  // *订单模块 (Order)
  ORDER: {
    /**
     * 订单号计数器（按日期分组）
     * 格式：order:no:counter:{YYYYMMDD}
     * @param date 日期字符串 (YYYYMMDD)
     * @example order:no:counter:20260325
     *
     * *说明：
     * - 每天一个计数器
     * - 用于生成业务订单号的序列号
     * - 2天后自动过期
     */
    getOrderNoCounterKey: (date: string) => `order:no:counter:${date}`,

    /**
     * 业务订单号映射到订单 ID（快速查询）
     * 格式：order:no:map:{orderNo}
     * @param orderNo 业务订单号
     * @example order:no:map:20260325-000001
     *
     * *说明：
     * - 用于通过业务订单号快速查询订单 ID
     * - 避免每次都查询数据库
     * - 1小时过期
     */
    getOrderNoMapKey: (orderNo: string) => `order:no:map:${orderNo}`,

    /**
     * 订单信息缓存
     * 格式：order:info:{orderId}
     * @param orderId 订单 ID (Snowflake)
     * @example order:info:1709875234567890123
     *
     * *说明：
     * - 缓存完整的订单信息
     * - 1小时过期
     * - 包含订单基本信息、金额、状态等
     */
    getOrderInfoKey: (orderId: string) => `order:info:${orderId}`,

    /**
     * 订单项缓存
     * 格式：order:items:{orderId}
     * @param orderId 订单 ID (Snowflake)
     * @example order:items:1709875234567890123
     *
     * *说明：
     * - 缓存订单中的所有商品项
     * - 1小时过期
     */
    getOrderItemsKey: (orderId: string) => `order:items:${orderId}`,

    /**
     * 用户订单列表（分页缓存）
     * 格式：order:user:list:{userId}:{page}
     * @param userId 用户 ID (Snowflake)
     * @param page 页码 (默认1)
     * @example order:user:list:1234567890123456789:1
     *
     * *说明：
     * - 缓存用户的订单列表
     * - 30分钟过期
     * - 创建新订单时需要删除此缓存
     */
    getUserOrderListKey: (userId: string, page: number = 1) =>
      `order:user:list:${userId}:${page}`,

    /**
     * 订单支付信息缓存
     * 格式：order:payment:{orderId}
     * @param orderId 订单 ID (Snowflake)
     * @example order:payment:1709875234567890123
     *
     * *说明：
     * - 缓存订单的支付信息
     * - 1小时过期
     * - 包含支付方式、支付流水号、支付时间等
     */
    getOrderPaymentKey: (orderId: string) => `order:payment:${orderId}`,

    /**
     * 订单支付状态（用于防重复支付）
     * 格式：order:payment:status:{orderId}
     * @param orderId 订单 ID (Snowflake)
     * @example order:payment:status:1709875234567890123
     *
     * *说明：
     * - 标记订单是否正在支付
     * - 10秒过期（支付过程很快）
     * - 防止用户重复提交支付请求
     */
    getOrderPaymentStatusKey: (orderId: string) =>
      `order:payment:status:${orderId}`,

    /**
     * 订单发货信息缓存
     * 格式：order:shipment:{orderId}
     * @param orderId 订单 ID (Snowflake)
     * @example order:shipment:1709875234567890123
     *
     * *说明：
     * - 缓存订单的发货信息
     * - 1小时过期
     * - 包含物流公司、跟踪号等
     */
    getOrderShipmentKey: (orderId: string) => `order:shipment:${orderId}`,

    /**
     * 待支付订单列表（用于超时取消）
     * 格式：order:pending:payment:list:{userId}:{createdAtTimestamp}
     * @example order:pending:payment:list:1234567890123456789:1648025600
     *
     * *说明：
     * - 使用 Redis Set 存储所有待支付的订单 ID
     * - 用于定时任务检查超时订单
     * - 无过期时间，手动管理
     */
    getPendingOrderListKey: (userId: string, createdAtTimestamp: number) =>
      `order:pending:payment:list:${userId}:${createdAtTimestamp}`,

    /**
     * 订单统计信息（全局）
     * 格式：order:statistics:global
     * @example order:statistics:global
     *
     * *说明：
     * - 缓存全局订单统计数据
     * - 1小时过期
     * - 包含今日订单数、总金额等
     */
    STATISTICS_GLOBAL: 'order:statistics:global',

    /**
     * 用户订单统计（按状态）
     * 格式：order:user:stats:{userId}
     * @param userId 用户 ID (Snowflake)
     * @example order:user:stats:1234567890123456789
     *
     * *说明：
     * - 缓存用户的订单统计数据
     * - 30分钟过期
     * - 包含各状态订单数量
     */
    getUserOrderStatsKey: (userId: string) => `order:user:stats:${userId}`,
  },
  // 地区相关键
  AREA: {
    // 级联地区缓存
    getCascadeAreaKey: (pid: string) => `area:cascade:${pid}`,
  },

  // *═══════════════════════════════════════════════════════
  // *AI 聊天记忆模块 (Chat Memory)
  // *═══════════════════════════════════════════════════════
  // *═══════════════════════════════════════════════════════
  // *RAG 知识库队列 (BullMQ)
  // *═══════════════════════════════════════════════════════
  RAG: {
    /**
     * RAG 任务队列名称
     */
    QUEUE_NAME: 'rag-queue',

    /**
     * 任务进度缓存
     * 格式：rag:progress:{taskId}
     * @param taskId BullMQ 任务 ID
     */
    getProgressKey: (taskId: string) => `rag:progress:${taskId}`,
  },

  CHAT: {
    /**
     * 会话消息历史（Redis List 临时层）
     * 格式：chat:history:{sessionId}
     * @param sessionId 会话ID
     * @example chat:history:1709875234567890123
     *
     * *说明：
     * - 存储当前活跃会话的完整消息列表
     * - 每条消息以 JSON 字符串存储
     * - 7天不活跃自动过期（每次对话续期）
     * - 用户关闭会话 / 定时任务同步到 MySQL 后可清理
     */
    getHistoryKey: (sessionId: string) => `chat:history:${sessionId}`,

    /**
     * 用户活跃会话集合（Redis Set）
     * 格式：chat:user:sessions:{userId}
     * @param userId 用户ID
     * @example chat:user:sessions:1234567890123456789
     *
     * *说明：
     * - 记录用户当前在 Redis 中的活跃会话ID
     * - 用于定时任务批量同步到 MySQL
     * - 7天过期
     */
    getUserSessionsKey: (userId: string) => `chat:user:sessions:${userId}`,

    /**
     * 会话同步锁（防止并发同步）
     * 格式：chat:sync:lock:{sessionId}
     * @param sessionId 会话ID
     * @example chat:sync:lock:1709875234567890123
     *
     * *说明：
     * - 防止定时任务与手动同步并发执行
     * - 30秒过期
     */
    getSyncLockKey: (sessionId: string) => `chat:sync:lock:${sessionId}`,
  },
} as const;
