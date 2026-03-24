import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Address } from '../address/entities/address.entity';
import { Role } from '../role/entities/role.entity';
import { EmailModule } from '../email/email.module';
@Module({
  imports: [TypeOrmModule.forFeature([User, Address, Role]), EmailModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
