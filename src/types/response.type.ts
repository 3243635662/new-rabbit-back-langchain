export interface IApiResponse<T = any> {
  code: number;

  result: T | null;

  message: string;
}

/**
 * 分页返回结果接口
 */
export interface IPaginatedResponse<T = any> {
  /**
   * 列表数据
   */
  list: T[];
  /**
   * 数据总条数
   */
  total: number;
}
