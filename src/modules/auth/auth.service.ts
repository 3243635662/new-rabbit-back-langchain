import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { BcryptUtil } from '../../utils/bcrypt.util';
import { LoginResType } from '../../types/auth.type';
@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}
  // *登录
  async login(dto: LoginDto): Promise<LoginResType> {
    let isPasswordValid: boolean;
    try {
      let user = await this.userService.findByUsername(
        dto.account,
        undefined,
        true,
      );
      if (!user) {
        user = await this.userService.findByEmail(dto.account, undefined, true);
      }

      if (!user) {
        throw new NotFoundException('账号不存在');
      }
      try {
        isPasswordValid = await BcryptUtil.compare(dto.password, user.password);
      } catch {
        throw new InternalServerErrorException('签名生成或验证失败，内部错误');
      }
      if (!isPasswordValid) {
        throw new UnauthorizedException('密码错误');
      }
      if (!user.active) {
        throw new UnauthorizedException('账号被锁定');
      }
      // 给token增加角色信息
      const payload = {
        username: user.username,
        id: user.id,
        roleId: user.roleId,
      };
      // 5. 生成JWT token
      const token = this.jwtService.sign(payload);
      return {
        id: user.id,
        token,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      // 其他未知错误
      throw new UnauthorizedException('登录失败，请稍后重试');
    }
  }
}
