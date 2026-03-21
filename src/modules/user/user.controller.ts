import { Body, Controller, Post, Req } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { CreateUserDto } from './dto/create.dto';
import { UserService } from './user.service';
import { type Request } from 'express';
import { JwtPayloadType } from '../../types/auth.type';
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}
  @Public()
  @Post()
  create(@Body() dto: CreateUserDto, @Req() request: Request) {
    const payload = request['user'] as JwtPayloadType;
    return this.userService.create(dto, payload);
  }

  @Post('emailCode')
  getEmailCode(@Body('email') email: string) {
    return this.userService.sendRegisterCode(email);
  }

  // @Public()
  @Post('initAdmin')
  async initAdmin() {
    return await this.userService.initAdmin();
  }
}
