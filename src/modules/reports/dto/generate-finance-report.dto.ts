import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateFinanceReportOptionsDto {
  // 同比环比分析 ：同比一般是和去年或者上个月同一时间段对比，环比一般是和上月同一时间段对比（看选择的区间）
  // 我们这里就按提交的时间区间来选 1-7天就比较前一天  7-30天就比较前一月  30天以上就比较前一年
  @IsOptional()
  @IsBoolean()
  comparisonAnalysis?: boolean;

  // 趋势预测分析
  @IsOptional()
  @IsBoolean()
  trendForecast?: boolean;

  // 图表可视化
  @IsOptional()
  @IsBoolean()
  chartEnabled?: boolean;
}

//  生成报告参数Dto
export class GenerateFinanceReportDto {
  // 报表开始日期
  @IsDateString()
  startDate: string;

  //截止日期
  @IsDateString()
  endDate: string;

  // 数据范围（订单数据<包含销售>  库存数据 发票数据  合同数据以及recordType值为非invoice的数据  ）
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['order', 'inventory', 'invoice', 'finance_resource'], {
    each: true,
  })
  dataScopes: Array<'order' | 'inventory' | 'invoice' | 'finance_resource'>;

  // 报告类型（可多选）
  @IsArray()
  @ArrayMinSize(1, { message: '至少选择一种报告类型' })
  @IsIn(['overview', 'profit', 'cost', 'sales', 'cashflow'], {
    each: true,
    message: '报告类型无效',
  })
  reportTypes: Array<'overview' | 'profit' | 'cost' | 'sales' | 'cashflow'>;

  // 导出格式
  @IsString()
  @IsIn(['pdf', 'image', 'html'])
  exportFormat: 'pdf' | 'image' | 'html';

  // 高级选项
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => GenerateFinanceReportOptionsDto)
  options?: GenerateFinanceReportOptionsDto;
}
