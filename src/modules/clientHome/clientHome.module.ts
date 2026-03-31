import { Module } from '@nestjs/common';
import { ClientHomeController } from './clientHome.controller';
import { ClientHomeService } from './clientHome.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomeBanner } from './entities/home-banner.entity';
import { HomeCategory } from './entities/home-category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HomeBanner, HomeCategory])],
  controllers: [ClientHomeController],
  providers: [ClientHomeService],
})
export class ClientHomeModule {}
