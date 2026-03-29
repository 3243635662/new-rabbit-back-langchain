import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { CreateUserDto } from './dto/create.dto';
import { UserService } from './user.service';
import { type Request } from 'express';
import { JwtPayloadType } from '../../types/auth.type';
import type { IApiResponse } from '../../types/response.type';
import { resFormatMethod } from '../../utils/resFormat.util';
import { User } from './entities/user.entity';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}
  @Public()
  @Post()
  async create(
    @Body() dto: CreateUserDto,
    @Req() request: Request,
  ): Promise<IApiResponse<null>> {
    const payload = request['user'] as JwtPayloadType;
    const result = await this.userService.create(dto, payload);
    return resFormatMethod(0, '创建成功', result);
  }

  @Public()
  @Post('emailCode')
  async getEmailCode(
    @Body('email') email: string,
  ): Promise<IApiResponse<null>> {
    const result = await this.userService.sendRegisterCode(email);
    return resFormatMethod(0, '验证码已发送', result);
  }

  @Get()
  async getUserInfo(
    @Req() request: Request,
  ): Promise<IApiResponse<User | null>> {
    const payload = request['user'] as JwtPayloadType;
    const result = await this.userService.getUserInfo(payload);
    return resFormatMethod(0, '获取成功', result);
  }
}
