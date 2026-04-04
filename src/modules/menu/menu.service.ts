import { MenuResType } from '../../types/menu.type';
import { RedisService, BloomFilters } from '../db/redis/redis.service';
import { RedisKeys } from '../../common/constants/redis-key.constant';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Menu } from './entities/menu.entity';
import { In, Repository } from 'typeorm';
import { RoleMenuMap } from '../role/entities/role-menu-map.entity';
import { JwtPayloadType } from '../../types/auth.type';

@Injectable()
export class MenuService implements OnModuleInit {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
    @InjectRepository(RoleMenuMap)
    private readonly roleMenuMapRepository: Repository<RoleMenuMap>,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit() {
    await this.warmUpMenuCache();
  }

  /**
   * 预热菜单布隆过滤器和常用角色缓存
   */
  private async warmUpMenuCache() {
    this.logger.log('🚀 开始预热菜单/角色布隆过滤器...');
    try {
      // 1. 获取所有有权限关联的角色 ID
      const roles = await this.roleMenuMapRepository
        .createQueryBuilder('rmm')
        .select('DISTINCT rmm.roleId', 'roleId')
        .getRawMany<{ roleId: number }>();

      // 无论是否有角色配置，都要确保超级管理员 (1) 在布隆过滤器中
      await this.redisService.addItem(BloomFilters.ROLE_IDS, 1);

      if (roles.length > 0) {
        // 2. 依次将角色 ID 加入布隆过滤器
        for (const r of roles) {
          if (r.roleId !== 1) {
            await this.redisService.addItem(BloomFilters.ROLE_IDS, r.roleId);
          }
        }
        this.logger.log(
          `✅ 菜单布隆过滤器预热完成，共加载 ${roles.length + (roles.some((r) => r.roleId === 1) ? 0 : 1)} 个角色 ID`,
        );

        // 3. 可选：预热常用角色的菜单缓存（回源一次触发缓存设置）
        for (const r of roles) {
          // 由于 JwtPayloadType 可能还包含其他字段，这里使用 Partial 或强转，
          // 但 roleId 是必须的
          void this.getRoutes({ roleId: r.roleId } as JwtPayloadType);
        }
      } else {
        this.logger.log('ℹ️ 数据库中无角色关联配置，仅完成基础初始化');
      }
    } catch (error) {
      this.logger.error('❌ 预热菜单数据失败:', error);
    }
  }

  // *获取路由
  async getRoutes(payload: JwtPayloadType): Promise<MenuResType[]> {
    const roleId = payload.roleId;

    // 1. 布隆过滤器预加载逻辑（防止缓存穿透）
    // 正常场景中，roleId 应该在 RoleService 创建角色时加入，
    // 这里如果布隆过滤器里没有且是合法 ID，我们可以在此处加入兜底（模拟已初始化）
    const exists = await this.redisService.itemExists(
      BloomFilters.ROLE_IDS,
      roleId,
    );
    if (!exists && roleId !== 1) {
      // 这里的逻辑可以改为直接返回空，如果能确定 roleId 非法则直接拦截
      // 或者为了容错性，先去查询一次 DB，确定存在后再放入布隆过滤器
    }

    // 2. 尝试从 Redis 缓存获取（带逻辑过期处理，防止缓存雪崩/击穿）
    const cacheKey = RedisKeys.MENU.getRoleRouteKey(roleId);
    const { data: cachedMenus, isExpired } =
      await this.redisService.getWithLogicExpire<MenuResType[]>(cacheKey);

    // 如果命中缓存且未过期，直接返回
    if (cachedMenus && !isExpired) {
      return cachedMenus;
    }

    // 3. 缓存失效或过期，尝试加互斥锁进行回源
    // 如果是逻辑过期，cachedMenus 可能还有旧数据可以用，我们这里简单实现，加锁回源
    const lockKey = RedisKeys.LOCK.getLockKey(cacheKey);
    const hasLock = await this.redisService.tryLock(lockKey, 10);

    if (hasLock) {
      try {
        let result: MenuResType[] = [];

        // 如果是超级管理员（roleId === 1），直接返回所有菜单
        if (roleId === 1) {
          const allMenus = await this.menuRepository.find({
            order: { sort: 'ASC' },
          });
          result = this.formatMenus(allMenus);
        } else {
          // 查找该角色对应的所有菜单 ID
          const roleMenuMaps = await this.roleMenuMapRepository.findBy({
            roleId,
          });
          const menuIds = roleMenuMaps.map((map) => map.menuId);

          if (menuIds.length > 0) {
            // 查找具体菜单
            const menus = await this.menuRepository.find({
              where: { id: In(menuIds) },
              order: { sort: 'ASC' },
            });
            result = this.formatMenus(menus);
          }
        }

        // 4. 更新布隆过滤器（认为此 roleId 有效）
        await this.redisService.addItem(BloomFilters.ROLE_IDS, roleId);

        // 5. 设置缓存，带逻辑过期时间（随机偏移防止雪崩）
        const expireSeconds = 3600 + Math.floor(Math.random() * 9999999);
        await this.redisService.setWithLogicExpire(
          cacheKey,
          result,
          expireSeconds,
        );

        return result;
      } finally {
        // 解锁
        await this.redisService.unlock(lockKey);
      }
    } else {
      // 6. 如果没拿到锁，通常说明有人在回源，我们可以等待后重试，或直接返回旧数据（如果是逻辑过期）
      if (cachedMenus) {
        return cachedMenus;
      }
      // 等待一下重试
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.getRoutes(payload);
    }
  }

  /**
   * 格式化菜单数据，处理 meta 字段
   */
  private formatMenus(menus: Menu[]): MenuResType[] {
    return menus.map((item) => {
      let metaObj: MenuResType['meta'];
      try {
        metaObj = item.meta
          ? (JSON.parse(item.meta) as MenuResType['meta'])
          : { title: item.name, keepAlive: false };
      } catch {
        metaObj = { title: item.name, keepAlive: false };
      }

      // 兜底处理：如果解析出的对象缺少 title，则补上
      if (!metaObj.title) {
        metaObj.title = item.name;
      }
      if (metaObj.keepAlive === undefined) {
        metaObj.keepAlive = false;
      }

      return {
        ...item,
        meta: metaObj,
      };
    });
  }
}
