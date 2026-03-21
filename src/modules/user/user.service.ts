import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { EntityManager, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create.dto';
import { JwtPayloadType } from '../../types/auth.type';
import { RedisService } from '../db/redis/redis.service';
import { resFormatMethod } from '../../utils/resFormat.util';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
@Injectable()
export class UserService {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly emailService: EmailService,
  ) {}

  // *根据用户名查找用户
  async findByUsername(username: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(User) : this.userRepository;
    return await repo.findOneBy({ username });
  }

  // *根据邮箱查找用户
  async findByEmail(email: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(User) : this.userRepository;
    return await repo.findOneBy({ email });
  }

  // *创建新用户
  async create(dto: CreateUserDto, payload: JwtPayloadType) {
    return this.userRepository.manager.transaction(async (entityManager) => {
      // 检查用户名和邮箱是否存在
      try {
        const userByName = await this.findByUsername(
          dto.username,
          entityManager,
        );
        const userByEmail = await this.findByEmail(dto.email, entityManager);

        if (userByName || userByEmail) {
          throw new BadRequestException('用户名或邮箱已存在');
        }

        const saltRounds = this.configService.get<number>('SALTROUNDS')!;
        const hashedPassword = await bcrypt.hash(dto.password, saltRounds);
        const newUser: User = new User();
        newUser.username = dto.username;
        newUser.password = hashedPassword;
        newUser.email = dto.email;
        newUser.avatar =
          dto.avatar ||
          'https://www.dhs.tsinghua.edu.cn/wp-content/uploads/2025/03/2025031301575583.jpeg';
        newUser.role = dto.role || 'user';
        newUser.active = dto.active ? 1 : 0;
        newUser.areaId = dto.areaId || 0;
        newUser.remark = dto.remark || '无';
        // 后台注册
        if (payload && payload.role === 'admin') {
          await entityManager.save(newUser);
          return resFormatMethod(0, '创建成功', null);
        }

        // 客户端注册  验证邮箱验证码
        if (!payload) {
          if (!dto.emailCode) {
            throw new BadRequestException('邮箱验证码不能为空');
          } else {
            const storedCode = await this.redisService.get(
              `user:createEmailCode:${dto.email}`,
            );
            if (!storedCode) {
              throw new BadRequestException('邮箱验证码错误');
            }
            if (storedCode !== dto.emailCode) {
              throw new BadRequestException('邮箱验证码错误');
            }
            await entityManager.save(newUser);
            return resFormatMethod(0, '创建成功', null);
          }
        }
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }
        throw new BadRequestException('创建失败');
      }
    });
  }

  // *获取注册邮箱验证码
  async sendRegisterCode(email: string) {
    const redisKey = `register:code:${email}`;
    const cooldownKey = `register:cooldown:${email}`;

    const cooldown = await this.redisService.clientInstance.get(cooldownKey);
    if (cooldown) {
      throw new HttpException('请60秒后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    // 生成6位随机验证码
    const code = (Math.floor(Math.random() * 900000) + 100000).toString();

    // 保存验证码（5分钟过期）
    await this.redisService.clientInstance.setex(redisKey, 60 * 5, code);

    // 设置发送冷却期（60秒）
    await this.redisService.clientInstance.setex(cooldownKey, 60, '1');
    // 发送验证码邮件
    try {
      await this.emailService.sendRegisterCode(email, code);
      return resFormatMethod(0, '验证码已发送', null);
    } catch {
      throw new HttpException(
        '验证码发送失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
