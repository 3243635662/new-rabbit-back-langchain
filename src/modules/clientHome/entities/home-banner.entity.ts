import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('home_banners')
export class HomeBanner {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'img_url', comment: '图片地址' })
  imgUrl: string;

  @Column({ name: 'href_url', comment: '跳转链接' })
  hrefUrl: string;

  @Column({ default: 0, comment: '排序值' })
  sort: number;

  @Column({ default: true, comment: '是否可用' })
  isActive: boolean;
}
