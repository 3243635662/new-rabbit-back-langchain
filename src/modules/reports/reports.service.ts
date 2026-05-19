import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { Repository } from 'typeorm';
import { UserContextType } from '../../types/reports/report-userContext.type';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // *根据用户 ID 获取用户上下文（用于报表生成）
  getUserContext = async (userId: string): Promise<UserContextType> => {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['merchant'],
    });

    if (!user) {
      throw new Error(`用户不存在: ${userId}`);
    }

    const result: UserContextType = {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      merchantId: user.merchant?.id,
    };

    return result;
  };
}
