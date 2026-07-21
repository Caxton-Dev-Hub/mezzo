import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Escrow } from './escrow.entity';
import { User } from './user.entity';
import { EvidencePhase } from '../../evidence/entities/evidence-phase.enum';

const bigintTransformer = { to: (value: number) => value, from: (value: string) => Number(value) };

@Entity('evidence_items')
export class EvidenceItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'escrow_id', type: 'uuid' })
  escrowId!: string;

  @ManyToOne(() => Escrow, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escrow_id' })
  escrow!: Escrow;

  @Column({ name: 'uploader_id', type: 'uuid' })
  uploaderId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uploader_id' })
  uploader!: User;

  @Column({ type: 'enum', enum: EvidencePhase })
  phase!: EvidencePhase;

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

  @Column({ name: 'captured_at', type: 'timestamptz', nullable: true })
  capturedAt!: Date | null;

  @Column({ name: 'device_make', type: 'varchar', length: 128, nullable: true })
  deviceMake!: string | null;

  @Column({ name: 'device_model', type: 'varchar', length: 128, nullable: true })
  deviceModel!: string | null;

  @Column({ name: 'gps_latitude', type: 'double precision', nullable: true })
  gpsLatitude!: number | null;

  @Column({ name: 'gps_longitude', type: 'double precision', nullable: true })
  gpsLongitude!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
