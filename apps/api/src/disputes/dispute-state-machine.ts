import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Dispute } from '../database/entities/dispute.entity';
import { DisputeEvent } from '../database/entities/dispute-event.entity';
import { DisputeState } from './entities/dispute-state.enum';
import { findDisputeTransitionRule, getLegalNextDisputeStates } from './dispute-transition-table';
import { IllegalDisputeTransitionError } from './errors/illegal-dispute-transition.error';
import { StaleDisputeVersionError } from './errors/stale-dispute-version.error';

export interface DisputeTransitionOptions {
  actorId: string | null;
  reason?: string;
  correlationId?: string;
}

@Injectable()
export class DisputeStateMachine {
  constructor(
    @InjectRepository(Dispute)
    private readonly disputes: Repository<Dispute>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async transition(
    disputeId: string,
    to: DisputeState,
    options: DisputeTransitionOptions,
    manager?: EntityManager,
  ): Promise<Dispute> {
    const disputeRepo = manager ? manager.getRepository(Dispute) : this.disputes;
    const dispute = await disputeRepo.findOne({ where: { id: disputeId } });
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    const rule = findDisputeTransitionRule(dispute.state, to);
    if (!rule) {
      throw new IllegalDisputeTransitionError(dispute.state, to);
    }

    const applyTransition = async (txManager: EntityManager): Promise<void> => {
      const updateResult = await txManager
        .createQueryBuilder()
        .update(Dispute)
        .set({ state: to, version: () => 'version + 1' })
        .where('id = :id AND version = :version', { id: dispute.id, version: dispute.version })
        .execute();

      if (updateResult.affected !== 1) {
        throw new StaleDisputeVersionError();
      }

      await txManager.insert(DisputeEvent, {
        disputeId: dispute.id,
        actorId: options.actorId,
        fromState: dispute.state,
        toState: to,
        reason: options.reason ?? null,
        correlationId: options.correlationId ?? randomUUID(),
      });
    };

    if (manager) {
      await applyTransition(manager);
    } else {
      await this.dataSource.transaction(applyTransition);
    }

    dispute.state = to;
    dispute.version += 1;
    return dispute;
  }

  async transitionIdempotent(
    disputeId: string,
    to: DisputeState,
    options: DisputeTransitionOptions,
    manager?: EntityManager,
  ): Promise<Dispute> {
    try {
      return await this.transition(disputeId, to, options, manager);
    } catch (error) {
      if (error instanceof IllegalDisputeTransitionError) {
        const disputeRepo = manager ? manager.getRepository(Dispute) : this.disputes;
        const dispute = await disputeRepo.findOne({ where: { id: disputeId } });
        if (dispute && dispute.state === to) {
          return dispute;
        }
      }
      throw error;
    }
  }

  getLegalNextStates(state: DisputeState): DisputeState[] {
    return getLegalNextDisputeStates(state);
  }
}
