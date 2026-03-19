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

    // 处理HttpException（NestJS内置异常）
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
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
    // 如果message是对象 接口响应会返回一个这样的格式：
    /*
"message": {
        "message": "用户名不存在",
        "error": "Unauthorized",
        "statusCode": 401
    },
    */
    // 我们只需要message中的message字段 其他的都可以忽略 下面就是使用类型断言安全的方式获取message字段
    if (typeof message === 'object' && message !== null) {
      message =
        (message as { message?: string }).message || message || '未知错误';
    }

    // 格式化响应 - 使用code/result/message格式

    const errResponse: any = resFormatMethod<object>(
      status, // 使用HTTP状态a码作为错误code
      message as string, // 错误消息
      {
        // 错误详情数据
        path: request.url,
        method: request.method,
        statusCode: status,
        timestamp: timeFormatMethod(),
      },
    );
    response.status(status).json(errResponse);
  }
}
