import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { EntityManager, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create.dto';
import { JwtPayloadType } from '../../types/auth.type';
import { RedisService, BloomFilters } from '../db/redis/redis.service';
import { EmailService } from '../email/email.service';
import { BcryptUtil } from '../../utils/bcrypt.util';
import { RedisKeys } from '../../common/constants/redis-key.constant';
@Injectable()
export class UserService implements OnModuleInit {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit() {
    await this.warmUpBloomFilter();
  }

  //  *预热用户Id
  private async warmUpBloomFilter() {
    this.logger.log('🚀 开始预热用户 ID 布隆过滤器...');
    try {
      // 分页获取所有用户 ID（避免一次性加载过多导致内存溢出）
      const total = await this.userRepository.count();
      if (total === 0) {
        this.logger.log('ℹ️ 数据库中无用户信息，跳过预热');
        return;
      }

      const users = await this.userRepository.find({ select: ['id'] });

      for (const user of users) {
        await this.redisService.addItem(BloomFilters.USER_IDS, user.id);
      }

      this.logger.log(`✅ 预热完成，共加载 ${users.length} 个用户 ID`);
    } catch (error) {
      this.logger.error('❌ 预热用户 ID 布隆过滤器失败:', error);
    }
  }

  // *根据用户名查找用户
  async findByUsername(
    username: string,
    manager?: EntityManager,
    withPassword = false,
  ) {
    const repo = manager ? manager.getRepository(User) : this.userRepository;
    if (withPassword) {
      return await repo
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('user.username = :username', { username })
        .getOne();
    }
    return await repo.findOneBy({ username });
  }

  // *根据邮箱查找用户
  async findByEmail(
    email: string,
    manager?: EntityManager,
    withPassword = false,
  ) {
    const repo = manager ? manager.getRepository(User) : this.userRepository;
    if (withPassword) {
      return await repo
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('user.email = :email', { email })
        .getOne();
    }
    return await repo.findOneBy({ email });
  }

  // *创建新用户
  async create(dto: CreateUserDto, payload: JwtPayloadType): Promise<null> {
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

        const saltRounds = Number(this.configService.get('SALTROUNDS')) || 10;
        const hashedPassword = await BcryptUtil.hash(dto.password, saltRounds);
        const newUser: User = new User();
        newUser.username = dto.username;
        newUser.password = hashedPassword;
        newUser.email = dto.email;
        newUser.avatar =
          dto.avatar ||
          'https://www.dhs.tsinghua.edu.cn/wp-content/uploads/2025/03/2025031301575583.jpeg';
        newUser.roleId = dto.roleId || 3; // 默认为普通用户
        newUser.areaId = dto.areaId || 0;
        newUser.remark = dto.remark || '无';
        // 后台注册（管理员 roleId === 1 为超级管理员）
        if (payload && payload.roleId === 1) {
          await entityManager.save(newUser);
          return null;
        }

        // 客户端注册  验证邮箱验证码
        if (!payload) {
          if (!dto.emailCode) {
            throw new BadRequestException('邮箱验证码不能为空');
          } else {
            const storedCode = await this.redisService.get(
              RedisKeys.AUTH.getRegisterCodeKey(dto.email),
            );
            if (!storedCode) {
              throw new BadRequestException('邮箱验证码错误');
            }
            if (storedCode !== dto.emailCode) {
              throw new BadRequestException('邮箱验证码错误');
            }
            const savedUser = await entityManager.save(newUser);
            // 同步更新布隆过滤器
            await this.redisService.addItem(
              BloomFilters.USER_IDS,
              savedUser.id,
            );
            return null;
          }
        }
        return null;
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }
        this.logger.error('创建用户失败:', error);
        throw new BadRequestException('创建失败');
      }
    });
  }

  // *初始化管理员
  async initAdmin(): Promise<null> {
    const user = await this.findByUsername('admin');
    if (user) {
      throw new BadRequestException('管理员已存在');
    }
    const newUser: User = new User();
    newUser.username = 'admin';
    newUser.password = await BcryptUtil.hash('123456', 10);
    newUser.email = 'fanfan0521@yeah.net';
    newUser.avatar =
      'https://www.dhs.tsinghua.edu.cn/wp-content/uploads/2025/03/2025031301575583.jpeg';
    newUser.roleId = 1; // 超级管理员角色 ID
    newUser.active = 1;
    newUser.areaId = 0;
    newUser.remark = '无';
    const savedUser = await this.userRepository.save(newUser);
    // 同步更新布隆过滤器
    await this.redisService.addItem(BloomFilters.USER_IDS, savedUser.id);
    return null;
  }

  // *发送注册邮箱验证码
  async sendRegisterCode(email: string): Promise<null> {
    const redisKey = RedisKeys.AUTH.getRegisterCodeKey(email);
    const cooldownKey = RedisKeys.AUTH.getRegisterCooldownKey(email);

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
      return null;
    } catch {
      throw new HttpException(
        '验证码发送失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
