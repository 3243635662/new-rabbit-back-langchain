import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { InventoryService, InventoryQueryOptions } from './inventory.service';
import { resFormatMethod } from '../../utils/resFormat.util';
import { JwtPayloadType } from '../../types/auth.type';
import { PaginateOptions } from '../../common/decorators/pagination.decorator';
import type { PaginationOptionsType } from '../../types/pagination.type';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * 商家查询库存列表（带搜索、预警筛选、分页）
   */
  @Get('merchant/list')
  async getMerchantList(
    @Req() req: { user: JwtPayloadType },
    @PaginateOptions({ defaultLimit: 10, maxLimit: 50 })
    paginationOptions: PaginationOptionsType,
    @Query('isWarning') isWarning?: string,
  ) {
    const options: InventoryQueryOptions = {
      ...paginationOptions,
      isWarning,
    };
    const result = await this.inventoryService.getMerchantInventoryList(
      req.user,
      options,
    );
    return resFormatMethod(0, '查询成功', result);
  }

  /**
   * 获取单个库存详情
   */
  @Get('detail/:id')
  async getDetail(
    @Req() req: { user: JwtPayloadType },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.inventoryService.getInventoryDetail(req.user, id);
    return resFormatMethod(0, '查询成功', result);
  }

  /**
   * 获取库存变动日志（出入库记录）
   */
  @Get('logs/:skuCode')
  async getLogs(
    @Req() req: { user: JwtPayloadType },
    @Param('skuCode') skuCode: string,
    @PaginateOptions({ defaultLimit: 10, maxLimit: 50 })
    paginationOptions: PaginationOptionsType,
  ) {
    const result = await this.inventoryService.getInventoryLogs(
      req.user,
      skuCode,
      paginationOptions,
    );
    return resFormatMethod(0, '查询成功', result);
  }

  /**
   * 修改库存（预警值 / 库存数量）
   */
  @Put('update/:id')
  async update(
    @Req() req: { user: JwtPayloadType },
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      warningStock?: number;
      stock?: number;
      remark?: string;
    },
  ) {
    const result = await this.inventoryService.updateInventory(
      req.user,
      id,
      body,
    );
    return resFormatMethod(0, '修改成功', result);
  }

  /**
   * 手动入库
   */
  @Post('manual-in')
  async manualIn(
    @Req() req: { user: JwtPayloadType },
    @Body()
    body: {
      skuCode: string;
      count: number;
      remark?: string;
    },
  ) {
    const result = await this.inventoryService.manualStockChange(req.user, {
      skuCode: body.skuCode,
      count: body.count,
      type: 'MANUAL_ADD',
      remark: body.remark,
    });
    return resFormatMethod(0, '入库成功', result);
  }

  /**
   * 手动出库
   */
  @Post('manual-out')
  async manualOut(
    @Req() req: { user: JwtPayloadType },
    @Body()
    body: {
      skuCode: string;
      count: number;
      remark?: string;
    },
  ) {
    const result = await this.inventoryService.manualStockChange(req.user, {
      skuCode: body.skuCode,
      count: body.count,
      type: 'MANUAL_REDUCE',
      remark: body.remark,
    });
    return resFormatMethod(0, '出库成功', result);
  }

  /**
   * 删除库存记录
   */
  @Delete('delete/:id')
  async remove(
    @Req() req: { user: JwtPayloadType },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.inventoryService.deleteInventory(req.user, id);
    return resFormatMethod(0, '删除成功', result);
  }
}
