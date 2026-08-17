import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { KycVerification } from './kyc-verification.entity';
import { KycDocumentType } from '../../kyc/entities/kyc-document-type.enum';

const bigintTransformer = { to: (value: number) => value, from: (value: string) => Number(value) };

@Entity('kyc_documents')
export class KycDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Index()
  @Column({ name: 'verification_id', type: 'uuid', nullable: true })
  verificationId!: string | null;

  @ManyToOne(() => KycVerification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'verification_id' })
  verification!: KycVerification | null;

  @Column({ name: 'document_type', type: 'enum', enum: KycDocumentType })
  documentType!: KycDocumentType;

  @Column({ name: 'storage_key', type: 'varchar', length: 512 })
  storageKey!: string;

  @Index()
  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;

  @Column({ name: 'declared_mime', type: 'varchar', length: 128 })
  declaredMime!: string;

  @Column({ name: 'detected_mime', type: 'varchar', length: 128 })
  detectedMime!: string;

  @Column({ name: 'size_bytes', type: 'bigint', transformer: bigintTransformer })
  sizeBytes!: number;

  @Column({ type: 'int', nullable: true })
  width!: number | null;

  @Column({ type: 'int', nullable: true })
  height!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
