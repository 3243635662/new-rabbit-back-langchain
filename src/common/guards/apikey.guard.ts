// src/common/guards/api-key.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { API_KEY_protected } from '../decorators/apikey.decorator';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isProtected = this.reflector.get<boolean>(
      API_KEY_protected,
      context.getHandler(),
    );

    // 如果接口没有标记为需要API key，直接放行
    if (!isProtected) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'] || request.query.api_key;

    // 这里可以替换为你的API key验证逻辑
    const validApiKey = this.configService.get<string>('API_KEY');

    return apiKey === validApiKey;
  }
}
