import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';

/**
 * 消息角色枚举
 */
export enum MessageRole {
  HUMAN = 'human',
  AI = 'ai',
  SYSTEM = 'system',
}

@Entity('chat_message')
@Index(['sessionId', 'createdAt'])
export class ChatMessage {
  @PrimaryColumn({
    type: 'bigint',
    comment: '消息ID (Snowflake生成)',
  })
  id: string;

  // ----------------------
  // 关联会话
  // ----------------------
  @Column({
    type: 'bigint',
    comment: '会话ID',
  })
  sessionId: string;

  @ManyToOne(() => ChatSession, (session) => session.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session: ChatSession;

  // ----------------------
  // 消息内容
  // ----------------------
  @Column({
    type: 'enum',
    enum: MessageRole,
    comment: '消息角色 (human/ai/system)',
  })
  role: MessageRole;

  @Column({
    type: 'text',
    comment: '消息内容',
  })
  content: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'AI思考过程（DeepSeek-R1推理内容）',
  })
  reasoning: string | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;
}
