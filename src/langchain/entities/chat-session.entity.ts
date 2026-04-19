import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../modules/user/entities/user.entity';
import { ChatMessage } from './chat-message.entity';

/**
 * 聊天会话状态枚举
 */
export enum ChatSessionStatus {
  ACTIVE = 1, // 进行中
  ENDED = 2, // 已结束
}

@Entity('chat_session')
@Index(['userId', 'updatedAt'])
@Index(['userId', 'status'])
export class ChatSession {
  @PrimaryColumn({
    type: 'bigint',
    comment: '会话ID (Snowflake生成)',
  })
  id: string;

  // ----------------------
  // 关联用户
  // ----------------------
  @Column({
    type: 'bigint',
    comment: '用户ID',
  })
  userId: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  // ----------------------
  // 会话信息
  // ----------------------
  @Column({
    length: 200,
    default: '新对话',
    comment: '会话标题（取首条消息摘要）',
  })
  title: string;

  @Column({
    type: 'tinyint',
    default: ChatSessionStatus.ACTIVE,
    comment: '会话状态 (1-进行中 2-已结束)',
  })
  status: ChatSessionStatus;

  // ----------------------
  // 关联消息
  // ----------------------
  @OneToMany(() => ChatMessage, (msg) => msg.session, {
    cascade: true,
    eager: false,
  })
  messages: ChatMessage[];

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '最后活跃时间' })
  updatedAt: Date;
}
