import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('area')
export class Area {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ comment: '父级ID' })
  pid: number;

  @Index()
  @Column({ comment: '层级：0省 1市 2区县 3街道' })
  deep: number;

  @Column({ length: 255, comment: '名称' })
  name: string;

  @Column({
    name: 'pinyin_prefix',
    length: 255,
    nullable: true,
    comment: '拼音前缀',
  })
  pinyinPrefix: string;

  @Column({ length: 255, nullable: true, comment: '拼音' })
  pinyin: string;

  @Index()
  @Column({ name: 'ext_id', length: 50, comment: '行政区划编码' })
  extId: string;

  @Column({
    name: 'ext_name',
    length: 255,
    nullable: true,
    comment: '扩展名称',
  })
  extName: string;
}
