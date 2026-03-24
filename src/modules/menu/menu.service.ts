import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Menu } from './entities/menu.entity';
import { JwtPayloadType } from '../../types/auth.type';
import { RoleMenuMap } from '../role/entities/role-menu-map.entity';
import { MenuResType } from '../../types/menu.type';

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
    @InjectRepository(RoleMenuMap)
    private readonly roleMenuMapRepository: Repository<RoleMenuMap>,
  ) {}

  async getRoutes(payload: JwtPayloadType): Promise<MenuResType[]> {
    const roleId = payload.roleId;

    // 如果是超级管理员（roleId === 1），直接返回所有菜单
    if (roleId === 1) {
      const allMenus = await this.menuRepository.find();
      return this.formatMenus(allMenus);
    }

    // 1. 查找该角色对应的所有菜单 ID
    const roleMenuMaps = await this.roleMenuMapRepository.findBy({ roleId });
    const menuIds = roleMenuMaps.map((map) => map.menuId);

    if (menuIds.length === 0) {
      return [];
    }

    // 2. 查找具体菜单
    const menus = await this.menuRepository.find({
      where: { id: In(menuIds) },
    });

    return this.formatMenus(menus);
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
