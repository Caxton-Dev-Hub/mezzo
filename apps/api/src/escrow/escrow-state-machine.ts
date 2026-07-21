import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Escrow } from '../database/entities/escrow.entity';
import { EscrowEvent } from '../database/entities/escrow-event.entity';
import { EscrowParty } from '../database/entities/escrow-party.entity';
import { EscrowState } from './entities/escrow-state.enum';
import { findTransitionRule, getLegalNextStates } from './escrow-transition-table';
import { IllegalTransitionError } from './errors/illegal-transition.error';
import { StaleEscrowVersionError } from './errors/stale-escrow-version.error';

export interface TransitionOptions {
  actorId: string | null;
  reason?: string;
  correlationId?: string;
}

@Injectable()
export class EscrowStateMachine {
  constructor(
    @InjectRepository(Escrow)
    private readonly escrows: Repository<Escrow>,
    @InjectRepository(EscrowParty)
    private readonly parties: Repository<EscrowParty>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async transition(escrowId: string, to: EscrowState, options: TransitionOptions): Promise<Escrow> {
    const escrow = await this.escrows.findOne({ where: { id: escrowId } });
    if (!escrow) {
      throw new NotFoundException('Escrow not found');
    }

    const partyRows = await this.parties.find({ where: { escrowId } });
    const partyUserIds = new Set(partyRows.map((party) => party.userId));

    const rule = findTransitionRule(escrow.state, to);
    if (!rule) {
      throw new IllegalTransitionError(escrow.state, to);
    }
    rule.guard?.({ actorId: options.actorId, partyUserIds });

    await this.dataSource.transaction(async (manager) => {
      const updateResult = await manager
        .createQueryBuilder()
        .update(Escrow)
        .set({ state: to, version: () => 'version + 1' })
        .where('id = :id AND version = :version', { id: escrow.id, version: escrow.version })
        .execute();

      if (updateResult.affected !== 1) {
        throw new StaleEscrowVersionError();
      }

      await manager.insert(EscrowEvent, {
        escrowId: escrow.id,
        actorId: options.actorId,
        fromState: escrow.state,
        toState: to,
        reason: options.reason ?? null,
        correlationId: options.correlationId ?? randomUUID(),
      });
    });

    escrow.state = to;
    escrow.version += 1;
    return escrow;
  }

  async transitionIdempotent(
    escrowId: string,
    to: EscrowState,
    options: TransitionOptions,
  ): Promise<Escrow> {
    try {
      return await this.transition(escrowId, to, options);
    } catch (error) {
      if (error instanceof IllegalTransitionError) {
        const escrow = await this.escrows.findOne({ where: { id: escrowId } });
        if (escrow && escrow.state === to) {
          return escrow;
        }
      }
      throw error;
    }
  }

  getLegalNextStates(state: EscrowState): EscrowState[] {
    return getLegalNextStates(state);
  }
}
