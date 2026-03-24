import { HandleTokenService } from './utils/handToken.util';
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly handleTokenService: HandleTokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // 公开路由仍然尝试解析 Token（如果有的话），以便后续业务能获取用户信息
      try {
        await this.handleTokenService.extractAndVerifyToken(context);
      } catch {
        // 公开路由不要求必须有 Token，忽略解析失败
      }
      return true;
    }
    /* 进行token的验证 - 成功会返回
    payload并设置request['user'],
    后面的这些接口需要验证的接口都会统一从request['user']中取数据
     */
    try {
      if (await this.handleTokenService.extractAndVerifyToken(context)) {
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }
}
