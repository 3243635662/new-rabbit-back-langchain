import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateUserDto {
  @IsString({ message: '用户名必须是字符串' })
  @IsNotEmpty({ message: '用户名不能为空' })
  @MaxLength(20, { message: '用户名长度不能超过20个字符' })
  @MinLength(1, { message: '用户名长度不能少于1个字符' })
  username: string;

  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MaxLength(20, { message: '密码长度不能超过20个字符' })
  @MinLength(6, { message: '密码长度不能少于6个字符' })
  password: string;

  @IsString({ message: '邮箱必须是字符串' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email: string;

  @IsString({ message: '头像必须是字符串' })
  @IsOptional()
  @IsUrl({}, { message: '头像链接格式不正确' })
  avatar?: string;

  @IsNumber({}, { message: '角色ID必须是数字' })
  @Type(() => Number)
  @IsOptional()
  roleId?: number;

  @IsBoolean({ message: '是否激活必须是布尔值' })
  @Type(() => Boolean)
  @IsOptional()
  active?: boolean;

  @IsNumber({}, { message: '区域ID必须是数字' })
  @Type(() => Number)
  @IsOptional()
  areaId?: number;

  @IsString({ message: '备注必须是字符串' })
  @IsOptional()
  remark?: string;

  @IsString({ message: '邮箱验证码必须是字符串' })
  @IsOptional()
  emailCode?: string;
}
