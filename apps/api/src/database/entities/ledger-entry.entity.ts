import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Currency } from '../../common/money/currency';
import { EntryDirection } from '../../ledger/entities/entry-direction.enum';
import { LedgerAccount } from './ledger-account.entity';
import { LedgerPosting } from './ledger-posting.entity';

const bigintTransformer = { to: (value: number) => value, from: (value: string) => Number(value) };

@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'posting_id', type: 'uuid' })
  postingId!: string;

  @ManyToOne(() => LedgerPosting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'posting_id' })
  posting!: LedgerPosting;

  @Index()
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account!: LedgerAccount;

  @Column({ type: 'enum', enum: EntryDirection })
  direction!: EntryDirection;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: Currency;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
