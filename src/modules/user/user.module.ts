import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';

export
@Module({
  controllers: [UserController],
  providers: [UserService],
})
class UserModule {}
