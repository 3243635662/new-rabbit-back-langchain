import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  login() {
    throw new BadRequestException('用户名不存在');
  }
}
