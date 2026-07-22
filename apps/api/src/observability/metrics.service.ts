import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Counter, Gauge, Registry } from 'prom-client';
import { Escrow } from '../database/entities/escrow.entity';
import { EscrowState } from '../escrow/entities/escrow-state.enum';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly escrowStateGauge: Gauge<string>;
  private readonly disputeRaisedCounter: Counter<string>;
  private readonly autoReleaseCounter: Counter<string>;
  private readonly arbitrationAbstentionCounter: Counter<string>;
  private readonly ledgerDriftCounter: Counter<string>;

  constructor(
    @InjectRepository(Escrow)
    private readonly escrows: Repository<Escrow>,
  ) {
    this.escrowStateGauge = new Gauge({
      name: 'mezzo_escrow_state_count',
      help: 'Number of escrows currently in each state',
      labelNames: ['state'],
      registers: [this.registry],
    });
    this.disputeRaisedCounter = new Counter({
      name: 'mezzo_disputes_raised_total',
      help: 'Total number of disputes raised',
      registers: [this.registry],
    });
    this.autoReleaseCounter = new Counter({
      name: 'mezzo_auto_release_total',
      help: 'Total number of escrows auto-released after the inspection window elapsed',
      registers: [this.registry],
    });
    this.arbitrationAbstentionCounter = new Counter({
      name: 'mezzo_arbitration_abstention_total',
      help: 'Total number of AI arbitration recommendations that abstained (NEEDS_HUMAN)',
      registers: [this.registry],
    });
    this.ledgerDriftCounter = new Counter({
      name: 'mezzo_ledger_drift_total',
      help: 'Total number of ledger drift conditions detected by reconciliation',
      registers: [this.registry],
    });
  }

  incrementDisputeRaised(): void {
    this.disputeRaisedCounter.inc();
  }

  incrementAutoRelease(): void {
    this.autoReleaseCounter.inc();
  }

  incrementArbitrationAbstention(): void {
    this.arbitrationAbstentionCounter.inc();
  }

  incrementLedgerDrift(count = 1): void {
    this.ledgerDriftCounter.inc(count);
  }

  getLedgerDriftTotal(): Promise<number> {
    return this.ledgerDriftCounter.get().then((value) => value.values[0]?.value ?? 0);
  }

  async render(): Promise<string> {
    await this.refreshEscrowStateGauge();
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  private async refreshEscrowStateGauge(): Promise<void> {
    const rows = await this.escrows
      .createQueryBuilder('escrow')
      .select('escrow.state', 'state')
      .addSelect('COUNT(*)', 'count')
      .groupBy('escrow.state')
      .getRawMany<{ state: EscrowState; count: string }>();

    this.escrowStateGauge.reset();
    for (const row of rows) {
      this.escrowStateGauge.set({ state: row.state }, Number(row.count));
    }
  }
}
