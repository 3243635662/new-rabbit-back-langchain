import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 公共装饰器
 * @description 标记路由为公共路由，无需认证即可访问
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
