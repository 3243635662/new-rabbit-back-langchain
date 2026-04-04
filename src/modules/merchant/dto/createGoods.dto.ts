import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { specType } from '../../../types/merchant.type';

export class createGoodsDto {
  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  categoriesId: number;

  @IsString()
  @IsOptional()
  mainPicture: string;

  @IsString()
  @IsNotEmpty()
  name: string; // 商品名称

  @IsString()
  @IsNotEmpty()
  desc: string; // 商品描述

  @IsString()
  @IsOptional()
  brand: string; // 品牌名称

  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  price: number; // 商品价格

  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  stock: number; // 商品库存

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  warningStock: number; // 商品库存预警值

  @IsString()
  @IsOptional()
  unit: string; // 商品单位

  @IsBoolean()
  @IsNotEmpty()
  @Type(() => Boolean)
  status: boolean; // 商品状态

  @IsString()
  @IsOptional()
  videoUrl: string; // 商品视频

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  smallPictures: string[]; // 商品小图

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  bigPictures: string[]; // 商品大图

  @IsArray()
  @IsOptional() // 如果没有规格，那就规格是"默认"
  specs: specType[];
}
