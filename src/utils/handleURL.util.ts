import { Request } from 'express';

/**
 * 格式化 URL，移除指定的查询参数（如 page, limit），常用于生成分页的基础链接
 * @param req Express Request 对象
 * @param keysToRemove 需要移除的 query 键名数组，默认为 ['page', 'limit']
 * @returns 处理后的 URL 字符串
 */
export const handleURL = (
  req: Request,
  keysToRemove: string[] = ['page', 'limit'],
): string => {
  const protocol = req.protocol;
  const host = req.get('host');
  const originalUrl = req.originalUrl;

  // 构建完整的 URL 对象（originalUrl 已包含路径和查询内容）
  const url = new URL(`${protocol}://${host}${originalUrl}`);

  // 移除指定的参数
  keysToRemove.forEach((key) => {
    url.searchParams.delete(key);
  });

  return url.toString();
};
