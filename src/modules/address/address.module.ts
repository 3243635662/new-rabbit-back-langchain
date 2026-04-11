import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressController } from './address.controller';
import { AreaController } from './area.controller';
import { AddressService } from './address.service';
import { AreaService } from './area.service';
import { Address } from './entities/address.entity';
import { Area } from './entities/area.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Address, Area])],
  controllers: [AddressController, AreaController],
  providers: [AddressService, AreaService],
  exports: [AddressService, AreaService, TypeOrmModule],
})
export class AddressModule {}
