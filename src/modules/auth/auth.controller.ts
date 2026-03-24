import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import type { IApiResponse } from '../../types/response.type';
import { LoginResType } from '../../types/auth.type';
import { resFormatMethod } from '../../utils/resFormat.util';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto): Promise<IApiResponse<LoginResType>> {
    const result = await this.authService.login(dto);
    return resFormatMethod(0, '登录成功', result);
  }
}
