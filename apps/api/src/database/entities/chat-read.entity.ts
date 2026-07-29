import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Escrow } from './escrow.entity';
import { User } from './user.entity';

@Entity('chat_reads')
@Index(['escrowId', 'userId'], { unique: true })
export class ChatRead {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'escrow_id', type: 'uuid' })
  escrowId!: string;

  @ManyToOne(() => Escrow, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escrow_id' })
  escrow!: Escrow;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'last_read_at', type: 'timestamptz' })
  lastReadAt!: Date;
}
