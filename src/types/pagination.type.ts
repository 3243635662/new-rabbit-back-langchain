// 分页的参数选项
export interface PaginationOptionsType {
  // 页码
  page: number;

  // 每页数量
  limit: number;

  // 搜索关键词
  keyword?: string;

  // 排序字段
  sort?: string;

  // 排序方向
  order: 'ASC' | 'DESC';

  category?: string;

  price?: number;

  // 订单状态筛选 (逗号分隔，如 "1,2,3")
  status?: string;

  // 资源类型筛选
  sourceType?: string;

  // 时间范围 - 开始时间
  startTime?: string;

  // 时间范围 - 结束时间
  endTime?: string;
}
