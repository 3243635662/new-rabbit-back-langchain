import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAddressDto {
  // 收货人姓名
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  // 手机号
  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber('CN')
  phone: string;

  // 区域代码
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  areaCode: string;

  // 详细地址
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  detail: string;

  // 是否是默认地址
  @IsBoolean()
  @IsNotEmpty()
  @Type(() => Boolean)
  isDefault: boolean;

  // 标签
  @IsString()
  @MaxLength(15)
  label: string;
}
