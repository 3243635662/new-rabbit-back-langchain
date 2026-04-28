import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { PaginationOptionsType } from '../../types/pagination.type';

/**
 * 分页装饰器
 * @param data 分页参数
 * @param ctx 执行上下文
 * @returns 分页选项
 * @example  @PaginateOptions({ defaultLimit: 10, maxLimit: 50 })
 * *说明: 使用此分页装饰器可以拦截到请求参数中的分页参数
 */

export const PaginateOptions = createParamDecorator(
  (
    data: { defaultLimit?: number; maxLimit?: number } = {},
    ctx: ExecutionContext,
  ): PaginationOptionsType => {
    const defaultLimit = data.defaultLimit || 5;
    const maxLimit = data.maxLimit || 50;
    const request = ctx.switchToHttp().getRequest<Request>();
    const {
      page,
      limit = defaultLimit,
      keyword,
      sort,
      order,
      category,
      price,
      status,
      startTime,
      endTime,
    } = request.query;
    return {
      page: Number(page) || 1,
      limit: Math.min(Number(limit), maxLimit),
      keyword: (keyword as string) || '',
      sort: (sort as string) || 'id',
      order: (order as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      category: (category as string) || '',
      price: Number(price) || 0,
      status: (status as string) || '',
      startTime: (startTime as string) || '',
      endTime: (endTime as string) || '',
    };
  },
);
