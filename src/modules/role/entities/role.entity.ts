import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Merchant } from '../../merchant/entities/merchant.entity';

@Entity()
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToMany(() => Merchant, (merchant) => merchant.role)
  merchants: Merchant[];

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  value: string;

  @Column({ default: '' })
  desc: string;
}

// 1:Admin 2:MerchantAdmin 3:User
