// 该工具库用于格式化API返回结果 - 适配前端框架格式
export class ResFormat<T> {
  code: number; // 状态码：0成功，其他失败
  result: T; // 响应数据
  message: string; // 响应消息
}

export const resFormatMethod = <T>(
  code: number,
  message: string,
  result?: T,
) => {
  return {
    code,
    result: result ?? null,
    message,
  };
};
