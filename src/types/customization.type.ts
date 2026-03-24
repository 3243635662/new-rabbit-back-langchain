export interface UapiGetCityByIpResType {
  /** 查询的IP地址 */
  ip: string;
  /** 地理位置，格式：国家 省份 城市 */
  region: string;
  /** 运营商名称 */
  isp: string;
  /** 归属机构 */
  llc: string;
  /** 自治系统编号 */
  asn: string;
  /** 纬度 */
  latitude: number;
  /** 经度 */
  longitude: number;
  /** IP段起始地址（标准查询） */
  beginip: string;
  /** IP段结束地址（标准查询） */
  endip: string;
}

export interface AirPollutantsType {
  /** PM2.5 μg/m³ */
  pm25: number;
  /** PM10 μg/m³ */
  pm10: number;
  /** 臭氧 μg/m³ */
  o3: number;
  /** 二氧化氮 μg/m³ */
  no2: number;
  /** 二氧化硫 μg/m³ */
  so2: number;
  /** 一氧化碳 mg/m³ */
  co: number;
}

export interface MinutelyPrecipType {
  /** 降水描述 */
  summary: string;
  /** 更新时间 */
  update_time: string;
  /** 每5分钟一个数据点，共24个 */
  data: Record<string, any>[];
}

export interface LifeIndexItemType {
  /** 等级名称 */
  level: string;
  /** 简短描述 */
  brief: string;
  /** 详细建议 */
  advice: string;
}

export interface LifeIndicesType {
  /** 穿衣指数 */
  clothing?: LifeIndexItemType;
  /** 紫外线指数 */
  uv?: LifeIndexItemType;
  /** 洗车指数 */
  car_wash?: LifeIndexItemType;
  /** 晾晒指数 */
  drying?: LifeIndexItemType;
  /** 空调开启指数 */
  air_conditioner?: LifeIndexItemType;
  /** 感冒指数 */
  cold_risk?: LifeIndexItemType;
  /** 运动指数 */
  exercise?: LifeIndexItemType;
  /** 舒适度指数 */
  comfort?: LifeIndexItemType;
  /** 出行指数 */
  travel?: LifeIndexItemType;
  /** 钓鱼指数 */
  fishing?: LifeIndexItemType;
  /** 过敏指数 */
  allergy?: LifeIndexItemType;
  /** 防晒指数 */
  sunscreen?: LifeIndexItemType;
  /** 心情指数 */
  mood?: LifeIndexItemType;
  /** 啤酒指数 */
  beer?: LifeIndexItemType;
  /** 雨伞指数 */
  umbrella?: LifeIndexItemType;
  /** 交通指数 */
  traffic?: LifeIndexItemType;
  /** 空气净化器指数 */
  air_purifier?: LifeIndexItemType;
  /** 花粉扩散指数 */
  pollen?: LifeIndexItemType;
}

export interface UapiGetWeatherByCityResType {
  /** 省份 */
  province: string;
  /** 城市名 */
  city: string;
  /** 区县或更细一级的行政区名称 */
  district: string;
  /** 行政区划代码（部分数据源可能为空） */
  adcode: string;
  /** 天气状况描述 */
  weather: string;
  /** 天气图标代码 */
  weather_icon: string;
  /** 当前温度 °C */
  temperature: number;
  /** 风向 */
  wind_direction: string;
  /** 风力等级 */
  wind_power: string;
  /** 相对湿度 % */
  humidity: number;
  /** 数据更新时间 */
  report_time: string;

  // ==== 以下为扩展参数返回的字段 ====

  /** 体感温度 °C（extended=true 时返回） */
  feels_like?: number;
  /** 能见度 km（extended=true 时返回） */
  visibility?: number;
  /** 气压 hPa（extended=true 时返回） */
  pressure?: number;
  /** 紫外线指数（extended=true 时返回） */
  uv?: number;
  /** 当前降水量 mm（extended=true 时返回） */
  precipitation?: number;
  /** 云量 %（extended=true 时返回） */
  cloud?: number;
  /** 空气质量指数 0-500（extended=true 时返回） */
  aqi?: number;
  /** AQI 等级 1-6（extended=true 时返回） */
  aqi_level?: number;
  /** AQI 等级描述（extended=true 时返回） */
  aqi_category?: string;
  /** 主要污染物（extended=true 时返回） */
  aqi_primary?: string;
  /** 空气污染物分项数据（extended=true 时返回） */
  air_pollutants?: AirPollutantsType;

  /** 当天最高温 °C（forecast=true 时返回） */
  temp_max?: number;
  /** 当天最低温 °C（forecast=true 时返回） */
  temp_min?: number;
  /** 多天天气预报，最多7天（forecast=true 时返回） */
  forecast?: Record<string, any>[];

  /** 逐小时预报，最多24小时（hourly=true 时返回） */
  hourly_forecast?: Record<string, any>[];

  /** 分钟级降水预报（minutely=true 时返回，仅国内城市） */
  minutely_precip?: MinutelyPrecipType;

  /** 18项生活指数（indices=true 时返回） */
  life_indices?: LifeIndicesType;
}
