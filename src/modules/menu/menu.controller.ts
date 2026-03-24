import { Controller, Get, Req } from '@nestjs/common';
import { MenuService } from './menu.service';
import { JwtPayloadType } from '../../types/auth.type';
import type { IApiResponse } from '../../types/response.type';
import { MenuResType } from '../../types/menu.type';
import { resFormatMethod } from '../../utils/resFormat.util';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  // * 获取路由信息
  @Get('routes')
  async getRoutes(
    @Req() request: Request,
  ): Promise<IApiResponse<MenuResType[]>> {
    const payload = request['user'] as JwtPayloadType;
    const result = await this.menuService.getRoutes(payload);
    return resFormatMethod(0, '获取成功', result);
  }
}
