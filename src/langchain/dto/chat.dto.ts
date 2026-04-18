import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChatDto {
  @IsString({ message: '消息内容必须是字符串' })
  @IsNotEmpty({ message: '消息内容不能为空' })
  @MaxLength(2000, { message: '消息内容不能超过 2000 个字' })
  message: string;
}
