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
    if (typeof message === 'object' && message !== null) {
      // @nestjs/common 中的默认验证信息经常是一个数组，将它展开成更友好的格式
      const msgObj = message as Record<string, unknown>;
      const msgProp = msgObj.message;
      if (Array.isArray(msgProp)) {
        message = msgProp.join(', ');
      } else {
        message = (msgProp as string) || '未知错误';
      }
    }

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
      message, // 错误消息
      errorDetailsData, // 错误详情数据
    );
    response.status(status).json(errResponse);
  }
}
