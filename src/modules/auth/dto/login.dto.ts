import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
export class LoginDto {
  @IsString({ message: '账号必须是字符串' })
  @IsNotEmpty({ message: '账号不能为空' })
  @MaxLength(20, { message: '账号长度不能超过20个字符' })
  @MinLength(1, { message: '账号长度不能少于1个字符' })
  account: string;

  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MaxLength(20, { message: '密码长度不能超过20个字符' })
  @MinLength(6, { message: '密码长度不能少于6个字符' })
  password: string;
}
