import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_METADATA = 'response_message';

/**
 * 响应消息装饰器
 * @description 标记路由的响应消息，用于在返回响应时包含自定义消息
 * @param message 响应消息
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_METADATA, message);
