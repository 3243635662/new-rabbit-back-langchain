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

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @MinLength(1)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @MinLength(6)
  password: string;

  @IsString()
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  avatar?: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsNumber()
  @IsOptional()
  areaId?: number;

  @IsString()
  @IsOptional()
  remark?: string;

  @IsString()
  @IsOptional()
  emailCode?: string;
}
