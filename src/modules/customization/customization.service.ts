import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UapiClient } from 'uapi-sdk-typescript';
import {
  UapiGetWeatherByCityResType,
  type UapiGetCityByIpResType,
} from '../../types/customization.type';
@Injectable()
export class CustomizationService implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {}
  private client: UapiClient;
  onModuleInit() {
    this.client = new UapiClient(
      'http://uapis.cn',
      this.configService.get<string>('UAPIPRO_APIKEY'),
    );
  }
  // *通过ip获取城市
  async getCityByIP(ip: string): Promise<string> {
    const payload = {
      ip: ip,
      source: '',
    };

    let res: UapiGetCityByIpResType;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      res = await this.client.network.getNetworkIpinfo(payload);
    } catch {
      throw new ServiceUnavailableException('获取数据失败，请稍后重试');
    }

    const regionList = res.region.split(' ');

    return regionList[1] ?? regionList[0] ?? '未知';
  }

  // *通过城市查询天气
  async getWeatherByCity(city: string): Promise<UapiGetWeatherByCityResType> {
    const payload = {
      city: city,
      adcode: '',
      extended: true,
      forecast: false,
      hourly: false,
      minutely: false,
      indices: false,
      lang: 'zh',
    };
    let res: UapiGetWeatherByCityResType;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      res = await this.client.misc.getMiscWeather(payload);
    } catch {
      throw new ServiceUnavailableException('获取数据失败，请稍后重试');
    }
    Logger.log(res);
    return res;
  }
}
