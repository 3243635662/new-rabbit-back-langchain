import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateAddressDto {
  // 收货人姓名
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  // 手机号
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber('CN')
  phone?: string;

  // 区域代码
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  areaCode?: string;

  // 详细地址
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  detail?: string;

  // 是否是默认地址
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isDefault?: boolean;

  // 标签
  @IsOptional()
  @IsString()
  @MaxLength(15)
  label?: string;
}
