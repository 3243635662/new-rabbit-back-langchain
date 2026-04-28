import { Injectable, Logger } from '@nestjs/common';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { UserService } from '../../modules/user/user.service';
import { User } from '../../modules/user/entities/user.entity';
import { JwtPayloadType } from '../../types/auth.type';
import { AgentRuntimeContext } from '../../types/agent.type';

/**
 * 获取当前用户信息 Tool
 *
 * 职责：封装获取当前登录用户个人信息的业务逻辑。
 * 用户信息包括用户名、邮箱、角色、关联商户等。
 */
@Injectable()
export class UserInfoTool {
  private readonly logger = new Logger(UserInfoTool.name);

  constructor(private readonly userService: UserService) {}

  /**
   * 创建 getUserInfo Tool 实例
   * @param context Agent 运行时上下文，包含用户身份信息
   */
  create(context: AgentRuntimeContext): DynamicStructuredTool {
    const { id: userId, roleId } = context;

    return tool(
      async () => {
        try {
          const payload = { id: userId, roleId } as JwtPayloadType;

          const user = await this.userService.getUserInfo(payload);

          if (!user) {
            return JSON.stringify({
              success: false,
              message: '未找到用户信息。',
            });
          }

          const roleMap: Record<number, string> = {
            1: '超级管理员',
            2: '商家',
            3: '普通用户',
          };

          return JSON.stringify({
            success: true,
            message: '获取用户信息成功。',
            data: {
              id: user.id,
              username: user.username,
              email: user.email,
              avatar: user.avatar || null,
              roleId: user.roleId,
              roleLabel: roleMap[user.roleId] || '未知角色',
              merchantId:
                (user as User & { merchantId?: number }).merchantId || null,
              active: user.active ?? true,
              areaId: user.areaId ?? null,
              remark: user.remark || null,
            },
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          this.logger.error('获取用户信息失败: ' + errorMessage);

          return JSON.stringify({
            success: false,
            message: '获取用户信息失败。',
            error: errorMessage,
          });
        }
      },
      {
        name: 'getUserInfo',
        description:
          '获取当前登录用户的个人信息。用于查询用户名、邮箱、角色、关联商户ID等。不需要任何参数，系统会自动从当前登录用户上下文获取。',
        schema: z.object({}),
      },
    );
  }
}
