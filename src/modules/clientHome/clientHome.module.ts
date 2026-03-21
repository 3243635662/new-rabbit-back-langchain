import { Module } from '@nestjs/common';
import { ClientHomeController } from './clientHome.controller';
import { ClientHomeService } from './clientHome.service';
import { TypeOrmModule } from '@nestjs/typeorm';
@Module({
  imports: [TypeOrmModule.forFeature([])],
  controllers: [ClientHomeController],
  providers: [ClientHomeService],
})
export class ClientHomeModule {}
