import {
  Controller,
  Get,
  Query,
  Param,
  Post,
  Body,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { PaginationOptionsType } from '../../types/pagination.type';
import { JwtPayloadType } from '../../types/auth.type';
import { AuthGuard } from '../auth/auth.guard';
import { resFormatMethod } from '../../utils/resFormat.util';

@Controller('admin')
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // * 获取待审核商品列表
  @Get('goods/list')
  async getGoodsList(
    @Req() req: { user: JwtPayloadType },
    @Query() query: PaginationOptionsType & { state?: string },
  ) {
    const result = await this.adminService.getGoodsList(req.user, query);
    return resFormatMethod(0, '获取商品列表成功', result);
  }

  // * 获取商品审核详情 (带 SKU)
  @Get('goods/audit/:id')
  async getAuditDetail(
    @Req() req: { user: JwtPayloadType },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.adminService.getGoodsAuditDetail(req.user, id);
    return resFormatMethod(0, '获取审核详情成功', result);
  }

  // * 执行审核操作
  @Post('goods/audit')
  async auditGoods(
    @Req() req: { user: JwtPayloadType },
    @Body() body: { id: number; success: boolean },
  ) {
    const result = await this.adminService.auditGoods(
      req.user,
      body.id,
      body.success,
    );
    return resFormatMethod(0, body.success ? '审核通过' : '审核已拒绝', result);
  }
}
