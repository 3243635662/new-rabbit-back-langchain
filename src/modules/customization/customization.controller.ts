import { Controller, Get, Query } from '@nestjs/common';
import { CustomizationService } from './customization.service';
import { resFormatMethod } from '../../utils/resFormat.util';
import { Public } from '../../common/decorators/public.decorator';
import { IApiResponse } from '../../types/response.type';
import { UapiGetWeatherByCityResType } from '../../types/customization.type';

@Controller('customization')
export class CustomizationController {
  constructor(private readonly customizationService: CustomizationService) {}
  @Public()
  @Get('city')
  async getCityByIP(@Query('ip') ip: string): Promise<IApiResponse<string>> {
    const res = await this.customizationService.getCityByIP(ip);
    return resFormatMethod(0, '获取城市成功', res);
  }

  @Public()
  @Get('weather')
  async getWeatherByCity(
    @Query('city') city: string,
  ): Promise<IApiResponse<UapiGetWeatherByCityResType>> {
    const res = await this.customizationService.getWeatherByCity(city);
    return resFormatMethod(0, '获取天气成功', res);
  }
}
