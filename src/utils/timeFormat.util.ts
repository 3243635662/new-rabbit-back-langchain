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

  // 按选择跨度天数智能判断对比模式
  if (diffDays <= 7) {
    // 天/周视图：前移 diffDays 天，保证对比区间与选择区间等长
    // 例: 05-17~05-17(1天) → 05-16~05-16
    // 例: 05-15~05-17(3天) → 05-12~05-14
    // 例: 05-13~05-19(7天) → 05-06~05-12
    compareMode = 'day';
    compareStartDate = start.subtract(diffDays, 'day');
    compareEndDate = end.subtract(diffDays, 'day');
  } else if (diffDays <= 31) {
    // 月视图：前 1 个完整日历月（用 startOf/endOf 自动补齐不确定天数）
    // 例: 04-01~04-30 → 03-01~03-31（3月有31天，不会丢1天）
    compareMode = 'month';
    compareStartDate = start.subtract(1, 'month').startOf('month');
    compareEndDate = end.subtract(1, 'month').endOf('month');
  } else if (diffDays <= 366) {
    // 年视图：前 1 个完整日历年
    // 例: 2026-01-01~2026-12-31 → 2025-01-01~2025-12-31
    compareMode = 'year';
    compareStartDate = start.subtract(1, 'year').startOf('year');
    compareEndDate = end.subtract(1, 'year').endOf('year');
  } else {
    // 跨年
    compareMode = 'year';
    compareStartDate = start.subtract(1, 'year').startOf('year');
    compareEndDate = end.subtract(1, 'year').endOf('year');
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
