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
}
