import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @MinLength(1)
  account: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @MinLength(6)
  password: string;
}
