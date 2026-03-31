import { Controller, Post } from '@nestjs/common';
import { SeedService } from './seed.service';
import { Public } from '../../../common/decorators/public.decorator';
import { resFormatMethod } from '../../../utils/resFormat.util';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  /**
   * 初始化管理员接口
   */
  @Public()
  @Post('admin')
  async initAdmin() {
    const result = await this.seedService.initAdmin();
    return resFormatMethod(0, '管理员初始化成功', result);
  }

  /**
   * 初始化 SKU 接口 (为所有商品生成规格组合)
   */
  @Public()
  @Post('sku')
  async initSku() {
    const result = await this.seedService.initSku();
    return resFormatMethod(0, '商品 SKU 初始化成功', result);
  }

  /**
   * 初始化首页数据 (Banner 和分类侧边推荐)
   */
  @Public()
  @Post('home')
  async initHomeData() {
    const result = await this.seedService.initHomeData();
    return resFormatMethod(0, '首页数据初始化成功', result);
  }
}
