import { JwtPayloadType } from './../../../types/auth.type';
import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UnauthorizedException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class HandleTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 从请求头中提取token
   * @param context 执行上下文
   * @returns token字符串或undefined
   */
  extractTokenFromHeader = (context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<Request>();

    const authorization =
      request.headers.authorization || request.headers['authorization'];
    if (!authorization || typeof authorization !== 'string') {
      return undefined;
    }

    // 只有Bearer头
    const parts = authorization.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return undefined;
    }

    // 过滤完最后返回token
    return parts[1] || undefined;
  };

  /**
   * 验证token
   * @param token JWT token
   * @returns 验证后的JWT payload
   * @throws UnauthorizedException 当token无效或过期时
   */
  verifyToken = async (token: string): Promise<JwtPayloadType> => {
    const TOKEN_SECRET_KEY = this.configService.get<string>('TOKEN_SECRET_KEY');

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayloadType>(token, {
        secret: TOKEN_SECRET_KEY,
      });
      // 检查payload是否存在且有效
      if (!payload) {
        throw new UnauthorizedException('用户信息不完整');
      }
      // 检查token是否过期
      if (payload.exp && Date.now() / 1000 >= payload.exp) {
        throw new UnauthorizedException('登录过期，请重新登录');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // 处理JWT库抛出的具体错误
      if (error instanceof Error) {
        if (error.name === 'JsonWebTokenError') {
          throw new UnauthorizedException('无效的登录凭证');
        } else if (error.name === 'TokenExpiredError') {
          throw new UnauthorizedException('登录过期，请重新登录');
        } else {
          throw new UnauthorizedException(`登录验证失败: ${error.message}`);
        }
      }

      throw new UnauthorizedException('登录验证失败: 未知错误');
    }
  };

  /**
   * 从 query 参数中提取 token（用于 SSE 等 EventSource 场景）
   * @param context 执行上下文
   * @returns token 字符串或 undefined
   */
  extractTokenFromQuery = (context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.query?.token as string | undefined;
    if (!token || typeof token !== 'string') return undefined;
    // 兼容前端传 "Bearer xxx" 或纯 token
    return token.startsWith('Bearer ') ? token.slice(7) : token;
  };

  /**
   * 从HTTP请求中提取并验证JWT token的完整流程
   * 优先从 header 提取，header 无 token 时降级从 query 提取（SSE 场景）
   * @param context 执行上下文
   * @returns 验证后的JWT payload
   * @throws UnauthorizedException 当token无效时
   */
  extractAndVerifyToken = async (
    context: ExecutionContext,
  ): Promise<boolean> => {
    // 1. 优先从请求头中提取 token
    const token =
      this.extractTokenFromHeader(context) ||
      this.extractTokenFromQuery(context);
    if (!token) {
      throw new UnauthorizedException('请先登录');
    }

    // 2. 验证token并将payload挂载到请求对象 下次使用时可以直接从请求对象中获取
    const request = context.switchToHttp().getRequest<Request>();
    request['user'] = await this.verifyToken(token);
    return true;
  };

  /**
   * 从 query 参数中提取并验证 token（用于 SSE 等 EventSource 场景）
   * @param token query 中的 token 字符串
   * @returns 验证后的 JWT payload
   * @throws UnauthorizedException 当token无效时
   */
  verifyTokenFromQuery = async (token: string): Promise<JwtPayloadType> => {
    if (!token) {
      throw new UnauthorizedException('请先登录');
    }
    // 兼容前端传 "Bearer xxx" 或纯 token 的情况
    const pureToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    return this.verifyToken(pureToken);
  };

  /**
   * 检查token是否即将过期（在指定时间内）
   * @param payload JWT payload
   * @param minutesBeforeExpiration 提前多少分钟检查（默认5分钟）
   * @returns 是否即将过期
   */
  isTokenExpiringSoon = (
    payload: JwtPayloadType,
    minutesBeforeExpiration: number = 5,
  ): boolean => {
    if (!payload.exp) {
      return false; // 没有过期时间的token不检查
    }

    const now = Date.now() / 1000;
    const expirationTime = payload.exp;
    const warningTime = expirationTime - minutesBeforeExpiration * 60;

    return now >= warningTime;
  };

  /**
   * 获取token的剩余有效时间（秒）
   * @param payload JWT payload
   * @returns 剩余秒数，如果无过期时间则返回null
   */
  getTokenRemainingTime = (payload: JwtPayloadType): number | null => {
    if (!payload.exp) {
      return null; // 没有过期时间的token
    }

    const now = Date.now() / 1000;
    const remainingTime = payload.exp - now;

    return Math.max(0, Math.floor(remainingTime));
  };
}
