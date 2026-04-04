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
    return this.adminService.getGoodsList(req.user, query);
  }

  // * 获取商品审核详情 (带 SKU)
  @Get('goods/audit/:id')
  async getAuditDetail(
    @Req() req: { user: JwtPayloadType },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.adminService.getGoodsAuditDetail(req.user, id);
  }

  // * 执行审核操作
  @Post('goods/audit')
  async auditGoods(
    @Req() req: { user: JwtPayloadType },
    @Body() body: { id: number; success: boolean },
  ) {
    return this.adminService.auditGoods(req.user, body.id, body.success);
  }
}
