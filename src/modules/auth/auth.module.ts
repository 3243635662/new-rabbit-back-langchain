import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from '../user/user.module';
import { JwtModule } from '@nestjs/jwt';
import { HandleTokenService } from './utils/handToken.util';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [
    UserModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('TOKEN_SECRET_KEY'),
        global: true,
        signOptions: {
          expiresIn: '365d',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    HandleTokenService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  exports: [HandleTokenService],
})
export class AuthModule {}
