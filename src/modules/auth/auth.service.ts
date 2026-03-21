import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { resFormatMethod } from '../../utils/resFormat.util';
@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}
  async login(dto: LoginDto) {
    let isPasswordValid: boolean;
    try {
      let user = await this.userService.findByUsername(dto.account);
      if (!user) {
        user = await this.userService.findByEmail(dto.account);
      }

      if (!user) {
        throw new NotFoundException('账号不存在');
      }
      try {
        isPasswordValid = await bcrypt.compare(dto.password, user.password);
      } catch {
        throw new Error('内部错误');
      }
      if (!isPasswordValid) {
        throw new UnauthorizedException('密码错误');
      }
      if (!user.active) {
        throw new UnauthorizedException('账号被锁定');
      }
      const role = user.role;
      // 给token增加角色信息
      const payload = { username: user.username, id: user.id, role };
      // 5. 生成JWT token
      const token = this.jwtService.sign(payload);
      return resFormatMethod(0, '登录成功', {
        id: user.id,
        token,
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      // 其他未知错误
      throw new UnauthorizedException('登录失败，请稍后重试');
    }
  }
}
