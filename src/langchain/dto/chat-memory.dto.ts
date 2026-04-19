import { IsNotEmpty, IsString, MaxLength, IsOptional } from 'class-validator';

// 会话记忆聊天 DTO（兼容旧接口）
export class ChatMemoryDto {
  @IsString({ message: '消息内容必须是字符串' })
  @IsNotEmpty({ message: '消息内容不能为空' })
  @MaxLength(2000, { message: '消息内容不能超过 2000 个字' })
  message: string;

  @IsString({ message: '会话ID必须是字符串' })
  @IsNotEmpty({ message: '会话ID不能为空' })
  sessionId: string;
}

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
