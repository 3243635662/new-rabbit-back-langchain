import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { Menu } from './entities/menu.entity';
import { RoleMenuMap } from '../role/entities/role-menu-map.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Menu, RoleMenuMap])],
  controllers: [MenuController],
  providers: [MenuService],
})
export class MenuModule {}
