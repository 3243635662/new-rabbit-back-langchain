import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { PaginationOptionsType } from '../../types/pagination.type';

export const PaginateOptions = createParamDecorator(
  (
    data: { defaultLimit?: number; maxLimit?: number } = {},
    ctx: ExecutionContext,
  ): PaginationOptionsType => {
    const defaultLimit = data.defaultLimit || 10;
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
    } = request.query;
    return {
      page: Number(page) || 1,
      limit: Math.min(Number(limit), maxLimit),
      keyword: (keyword as string) || '',
      sort: (sort as string) || 'id',
      order: (order as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      category: (category as string) || '',
      price: Number(price) || 0,
    };
  },
);
