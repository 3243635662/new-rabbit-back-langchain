import { IsNotEmpty, IsString, MaxLength, IsOptional } from 'class-validator';

// 创建会话 DTO
export class CreateSessionDto {
  @IsString({ message: '会话标题必须是字符串' })
  @IsOptional()
  @MaxLength(200, { message: '会话标题不能超过 200 个字' })
  title?: string;
}

// 更新会话标题 DTO
export class UpdateSessionTitleDto {
  @IsString({ message: '会话标题必须是字符串' })
  @IsNotEmpty({ message: '会话标题不能为空' })
  @MaxLength(200, { message: '会话标题不能超过 200 个字' })
  title: string;
}
