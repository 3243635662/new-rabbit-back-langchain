import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('role_menu_map')
export class RoleMenuMap {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  roleId: number;

  @Column()
  menuId: number;
}
