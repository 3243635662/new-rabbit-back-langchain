import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  Req,
} from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { resFormatMethod } from '../../utils/resFormat.util';
import { JwtPayloadType } from '../../types/auth.type';

@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  /**
   * GET /knowledge-base/presign?fileName=xxx
   * 客户端请求直传七牛的凭证（uploadToken + key + domain）
   * 服务器不接触文件内容，零内存/带宽消耗
   */
  @Get('presign')
  async presign(
    @Query('fileName') fileName: string,
    @Req() req: { user: JwtPayloadType },
  ) {
    if (!fileName) {
      return resFormatMethod(1, 'fileName 不能为空', null);
    }
    const result = await this.kbService.generatePresign(fileName, req.user.id);
    return resFormatMethod(0, 'success', result);
  }

  /**
   * POST /knowledge-base/confirm
   * 客户端直传七牛成功后，回调此接口确认 → 入库 + 入队
   * Body: { qiniuKey, fileName, mimeType, fileSize }
   */
  @Post('confirm')
  async confirm(
    @Body()
    body: {
      qiniuKey: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
    },
    @Req() req: { user: JwtPayloadType },
  ) {
    const result = await this.kbService.confirmUpload(body, req.user.id);
    return resFormatMethod(0, '已入队，处理中', result);
  }

  /**
   * GET /knowledge-base/task/:taskId
   * 查询任务处理进度
   */
  @Get('task/:taskId')
  async getTaskStatus(@Param('taskId') taskId: string) {
    const result = await this.kbService.getTaskStatus(taskId);
    return resFormatMethod(0, 'success', result);
  }

  /**
   * GET /knowledge-base/list
   * 查询当前商户的知识库文档列表
   */
  @Get('list')
  async list(@Req() req: { user: JwtPayloadType }) {
    const result = await this.kbService.listByMerchant(req.user.id);
    return resFormatMethod(0, 'success', result);
  }

  /**
   * DELETE /knowledge-base/:id
   * 删除知识库文档
   */
  @Delete(':id')
  async remove(@Param('id') id: number, @Req() req: { user: JwtPayloadType }) {
    const result = await this.kbService.remove(id, req.user.id);
    return resFormatMethod(0, '删除成功', result);
  }
}
