import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Currency } from '../../common/money/currency';
import { LedgerAccountType } from '../../ledger/entities/ledger-account-type.enum';
import { EntryDirection } from '../../ledger/entities/entry-direction.enum';

const bigintTransformer = { to: (value: number) => value, from: (value: string) => Number(value) };

@Entity('ledger_accounts')
export class LedgerAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 256 })
  ref!: string;

  @Column({ type: 'enum', enum: LedgerAccountType })
  type!: LedgerAccountType;

  @Column({ type: 'varchar', length: 3 })
  currency!: Currency;

  @Column({ name: 'normal_balance', type: 'enum', enum: EntryDirection })
  normalBalance!: EntryDirection;

  @Column({ name: 'cached_balance', type: 'bigint', default: 0, transformer: bigintTransformer })
  cachedBalance!: number;

  @Column({ name: 'cached_at', type: 'timestamptz', default: () => 'now()' })
  cachedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
