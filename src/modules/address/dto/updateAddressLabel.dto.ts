import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAddressLabelDto {
  // 地址标签：家、公司、学校等
  @IsOptional()
  @IsString()
  @MaxLength(15)
  label?: string;
}
