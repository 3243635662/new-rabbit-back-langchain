import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { specType } from '../../../types/merchant.type';
export class createGoodsDto {
  @IsNumber()
  @IsNotEmpty()
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
  price: number; // 商品价格

  @IsNumber()
  @IsNotEmpty()
  stock: number; // 商品库存

  @IsNumber()
  @IsOptional()
  warningStock: number; // 商品库存预警值

  @IsString()
  @IsOptional()
  unit: string; // 商品单位

  @IsBoolean()
  @IsNotEmpty()
  status: boolean; // 商品状态

  @IsString()
  @IsOptional()
  videoUrl: string; // 商品视频

  @IsString()
  @IsOptional()
  smallPictures: string[]; // 商品小图

  @IsString()
  @IsOptional()
  bigPictures: string[]; // 商品大图

  @IsArray()
  @IsOptional() // 如果没有规格，那就规格是"默认"
  specs: specType[];
}
