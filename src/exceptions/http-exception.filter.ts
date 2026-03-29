// 全局异常过滤器 - 统一处理和格式化错误响应
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { resFormatMethod } from '../utils/resFormat.util';
import { timeFormatMethod } from '../utils/timeFormat.util';

// 定义错误消息映射表
const ErrorMessageMap: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: '请求参数错误',
  [HttpStatus.UNAUTHORIZED]: '登录已过期或未授权，请重新登录',
  [HttpStatus.FORBIDDEN]: '无权访问该资源',
  [HttpStatus.NOT_FOUND]: '请求的资源未找到',
  [HttpStatus.METHOD_NOT_ALLOWED]: '请求方法不允许',
  [HttpStatus.NOT_ACCEPTABLE]: '请求不可处理',
  [HttpStatus.REQUEST_TIMEOUT]: '请求超时',
  [HttpStatus.CONFLICT]: '资源冲突',
  [HttpStatus.TOO_MANY_REQUESTS]: '请求过于频繁，请稍后再试',
  [HttpStatus.INTERNAL_SERVER_ERROR]: '服务器内部错误',
  [HttpStatus.BAD_GATEWAY]: '网关错误',
  [HttpStatus.SERVICE_UNAVAILABLE]: '服务暂时不可用',
  [HttpStatus.GATEWAY_TIMEOUT]: '网关超时',
};

@Catch() // 空参数表示捕获所有异常类型
export class HttpExceptionFilter implements ExceptionFilter {
  // host：异常发生的执行上下文
  catch(exception: unknown, host: ArgumentsHost): void {
    // 切换到HTTP执行上下文
    const ctx = host.switchToHttp();
    // 获取响应对象
    const response = ctx.getResponse<Response>();
    // 获取请求对象
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | object;
    let details: unknown = null;

    // 处理HttpException（NestJS内置异常）
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = res;
      // 提取 validation 管道中抛出的自定义 details
      if (typeof res === 'object' && res !== null && 'details' in res) {
        details = (res as Record<string, unknown>).details;
      }
    }
    // 处理普通Error
    else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = exception.message;
    }
    // 处理未知类型错误
    else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = '服务器内部错误';
    }

    // 格式化 message 为纯字符串
    let finalMessage = '未知错误';
    if (typeof message === 'object' && message !== null) {
      const msgObj = message as Record<string, unknown>;
      const msgProp = msgObj.message;
      if (Array.isArray(msgProp)) {
        finalMessage = msgProp.join(', ');
      } else {
        finalMessage = (msgProp as string) || '未知错误';
      }
    } else {
      finalMessage = message || '未知错误';
    }

    // 根据状态码翻译默认的英文消息（如果是内置默认消息则进行中文化）
    finalMessage = this.translateMessage(status, finalMessage);

    // 格式化响应 - 使用code/result/message格式
    const errorDetailsData: Record<string, unknown> = {
      path: request.url,
      method: request.method,
      statusCode: status,
      timestamp: timeFormatMethod(),
    };
    if (details) {
      errorDetailsData.validationDetails = details;
    }

    const errResponse = resFormatMethod<object>(
      1, // 使用1作为错误code
      finalMessage, // 错误消息
      errorDetailsData, // 错误详情数据
    );
    response.status(status).json(errResponse);
  }

  // 内部翻译逻辑
  private translateMessage(status: number, message: string): string {
    // 常见的 NestJS 默认英文提示
    const defaultMessages = [
      'Forbidden resource',
      'Forbidden',
      'Unauthorized',
      'Bad Request',
      'Not Found',
      'Internal Server Error',
      'Request Timeout',
      'Gateway Timeout',
      'Service Unavailable',
    ];

    // 只有当消息是 NestJS 默认的英文提示时，才使用映射表进行翻译
    // 这样可以确保开发者在代码中手动指定的中文错误信息（如：throw new BadRequestException('手机号格式错误')）不会被覆盖
    if (defaultMessages.includes(message)) {
      return ErrorMessageMap[status] || message;
    }

    return message;
  }
}
