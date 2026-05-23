import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { FinanceService } from './finance.service';
import { resFormatMethod } from '../../utils/resFormat.util';
import { JwtPayloadType } from '../../types/auth.type';
import type { ConfirmBody } from '../../types/file.type';
import { PaginateOptions } from '../../common/decorators/pagination.decorator';
import type { PaginationOptionsType } from '../../types/pagination.type';

interface SseEvent {
  data: unknown;
}

@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  /**
   * GET /finance/presign?fileName=xxx
   * 获取财务相关文件的上传凭证
   */
  @Get('presign')
  async presign(
    @Query('fileName') fileName: string,
    @Req() req: { user: JwtPayloadType },
  ) {
    if (!fileName) {
      return resFormatMethod(1, 'fileName 不能为空', null);
    }
    const result = await this.financeService.generatePresign(
      fileName,
      req.user.id,
    );
    return resFormatMethod(0, 'success', result);
  }

  /**
   * POST /finance/confirm
   * 七牛直传成功后确认 → 入库并入队（Worker 内推送进度到 Redis）
   */
  @Post('confirm')
  async confirm(
    @Body() body: ConfirmBody,
    @Req() req: { user: JwtPayloadType },
  ) {
    const result = await this.financeService.confirmUpload(body, req.user.id);
    return resFormatMethod(0, '已入队，处理中', result);
  }

  /**
   * GET /finance/task/:taskId
   * 轮询任务状态（与 SSE 互补）
   */
  @Get('task/:taskId')
  async getTaskStatus(@Param('taskId') taskId: string) {
    const result = await this.financeService.getTaskStatus(taskId);
    return resFormatMethod(0, 'success', result);
  }

  /**
   * GET /finance/sources
   * 获取财务资源列表（支持分页、搜索）
   */
  @Get('sources')
  async getSourceFiles(
    @PaginateOptions({ defaultLimit: 10, maxLimit: 50 })
    options: PaginationOptionsType,
    @Req() req: { user: JwtPayloadType },
  ) {
    const result = await this.financeService.getSourceFiles(
      req.user.id,
      options,
    );
    return resFormatMethod(0, 'success', result);
  }

  /**
   * GET /finance/sources/:id
   * 获取单个财务资源的详情（包含提取出的结构化记录）
   */
  @Get('sources/:id')
  async getSourceFileDetail(
    @Param('id') id: number,
    @Req() req: { user: JwtPayloadType },
  ) {
    const result = await this.financeService.getSourceFileDetail(
      id,
      req.user.id,
    );
    return resFormatMethod(0, 'success', result);
  }

  /**
   * DELETE /finance/sources/:id
   * 删除财务资源
   */
  @Delete('sources/:id')
  async deleteSourceFile(
    @Param('id') id: number,
    @Req() req: { user: JwtPayloadType },
  ) {
    const result = await this.financeService.deleteSourceFile(id, req.user.id);
    return resFormatMethod(0, 'success', result);
  }

  /**
   *  /finance/progress/:taskId (SSE)
   * 实时订阅财务文件处理进度（EventSource）
   */
  @Sse('progress/:taskId')
  progressSse(@Param('taskId') taskId: string): Observable<SseEvent> {
    return this.financeService.progressSse(taskId);
  }
}
