import { Controller, Get, Param, Query } from '@nestjs/common';
import { AreaService } from './area.service';
import { resFormatMethod } from '../../utils/resFormat.util';
import { Public } from '../../common/decorators/public.decorator';

@Controller('area')
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

  /**
   * 获取下级区划列表（省市区街道级联）
   * GET /area/children?pid=0
   */
  @Public()
  @Get('children')
  async getChildren(@Query('pid') pid?: string) {
    const list = await this.areaService.getChildren(pid ? Number(pid) : 0);
    return resFormatMethod(0, '查询成功', list);
  }

  /**
   * 根据编码获取单个区划
   * GET /area/code/:extId
   */
  @Get('code/:extId')
  async getByCode(@Param('extId') extId: string) {
    const area = await this.areaService.getByCode(extId);
    if (!area) {
      return resFormatMethod(404, '区划不存在', null);
    }
    return resFormatMethod(0, '查询成功', area);
  }

  /**
   * 模糊搜索区划（支持名称、拼音、拼音首字母）
   * GET /area/search?keyword=邯山
   */
  @Public()
  @Get('search')
  async search(
    @Query('keyword') keyword: string,
    @Query('limit') limit?: string,
  ) {
    const list = await this.areaService.search(
      keyword,
      limit ? Number(limit) : 20,
    );
    return resFormatMethod(0, '查询成功', list);
  }
}
