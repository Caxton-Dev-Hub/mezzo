import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('whatsapp_link_codes')
export class WhatsAppLinkCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'phone_number', type: 'varchar', length: 32 })
  phoneNumber!: string;

  @Column({ name: 'code_hash', type: 'text' })
  codeHash!: string;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
