import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { RoleMenuMap } from './entities/role-menu-map.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role, RoleMenuMap])],
  exports: [TypeOrmModule],
})
export class RoleModule {}
