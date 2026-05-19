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

  // AI 智能解读
  @IsOptional()
  @IsBoolean()
  aiInsight?: boolean;
}

//  生成报告参数Dto
export class GenerateFinanceReportDto {
  // 报表开始日期
  @IsDateString()
  startDate: string;

  //截止日期
  @IsDateString()
  endDate: string;

  // 数据范围（订单数据  销售数据 库存数据 发票数据  合同数据以及recordType值为非invoice的数据  ）
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['order', 'sales', 'inventory', 'invoice', 'finance_resource'], {
    each: true,
  })
  dataScopes: Array<
    'order' | 'sales' | 'inventory' | 'invoice' | 'finance_resource'
  >;

  // 报表类型
  @IsIn([
    'overview', // 财务总览报告（综合展示整体财务状况）
    'profit', // 利润分析报告(分析收入、成本、利润、毛利率等)
    'cost', // 成本费用分析 (分析成本结构和费用占比)
    'sales', // 销售分析报告 （分析销售表现）
    'cashflow', // 现金流量报告 (分析现金流入和现金流出)
  ])
  reportType: 'overview' | 'profit' | 'cost' | 'sales' | 'cashflow';

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
