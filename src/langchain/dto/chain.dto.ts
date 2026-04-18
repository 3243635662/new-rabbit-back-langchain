import { IsNotEmpty, IsString, MaxLength, IsOptional } from 'class-validator';

// 翻译链 DTO
export class TranslateChainDto {
  @IsNotEmpty({ message: '待翻译文本不能为空' })
  @IsString({ message: '待翻译文本必须是字符串' })
  @MaxLength(2000, { message: '待翻译文本不能超过 2000 个字' })
  text: string;

  @IsOptional()
  @IsString({ message: '源语言必须是字符串' })
  inputLanguage: string;

  @IsOptional()
  @IsString({ message: '目标语言必须是字符串' })
  outputLanguage: string;
}

// 产品命名链 DTO
export class ProductNamingChainDto {
  @IsString({ message: '产品描述必须是字符串' })
  @IsNotEmpty({ message: '产品描述不能为空' })
  @MaxLength(2000, { message: '产品描述不能超过 2000 个字' })
  product: string;
}
