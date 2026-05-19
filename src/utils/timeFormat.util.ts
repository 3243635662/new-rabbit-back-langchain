import { ComparisonRange } from '../types/reports/comparison-range.type';
import dayjs from 'dayjs';
export const timeFormatMethod = (dateInput?: string | number | Date) => {
  const date = dateInput ? new Date(dateInput) : new Date();
  const Y = date.getFullYear();
  const M = (date.getMonth() + 1).toString().padStart(2, '0');
  const D = date.getDate().toString().padStart(2, '0');
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
};

// 获取同比环比时间范围计算函数
export function getComparisonRange(
  startDate: string,
  endDate: string,
): ComparisonRange {
  const start = dayjs(startDate);
  const end = dayjs(endDate);

  // 计算相差天数（包含起始当天）
  const diffDays = end.diff(start, 'day') + 1;

  let compareMode: 'day' | 'month' | 'year' = 'day';
  let compareStartDate: dayjs.Dayjs;
  let compareEndDate: dayjs.Dayjs;

  if (diffDays <= 7) {
    compareMode = 'day';
    compareStartDate = start.subtract(1, 'day');
    compareEndDate = end.subtract(1, 'day');
  } else if (diffDays <= 30) {
    compareMode = 'month';
    // dayjs 自动处理 05-31 减一个月变成 04-30 的边界情况
    compareStartDate = start.subtract(1, 'month');
    compareEndDate = end.subtract(1, 'month');
  } else {
    compareMode = 'year';
    // dayjs 同样会自动处理闰年 02-29 减一年变成 02-28 的情况
    compareStartDate = start.subtract(1, 'year');
    compareEndDate = end.subtract(1, 'year');
  }

  return {
    currentStartDate: startDate,
    currentEndDate: endDate,
    // format('YYYY-MM-DD') 避免了原生 toISOString() 带来的 UTC 时区偏差问题
    compareStartDate: compareStartDate.format('YYYY-MM-DD'),
    compareEndDate: compareEndDate.format('YYYY-MM-DD'),
    compareMode,
  };
}
