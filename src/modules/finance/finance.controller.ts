import { Controller, Get, Query, Req } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { resFormatMethod } from '../../utils/resFormat.util';
import { JwtPayloadType } from '../../types/auth.type';

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
}
