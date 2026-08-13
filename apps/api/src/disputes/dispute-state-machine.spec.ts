import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DisputeStateMachine } from './dispute-state-machine';
import { DisputeState } from './entities/dispute-state.enum';
import { DisputeReasonCode } from './entities/dispute-reason-code.enum';
import { IllegalDisputeTransitionError } from './errors/illegal-dispute-transition.error';
import { StaleDisputeVersionError } from './errors/stale-dispute-version.error';
import { Dispute } from '../database/entities/dispute.entity';
import { DisputeEvent } from '../database/entities/dispute-event.entity';
import { callArg } from '../../test/support/mock-calls';

function buildDispute(state: DisputeState, version = 1): Dispute {
  return {
    id: randomUUID(),
    escrowId: randomUUID(),
    escrow: undefined as never,
    raisedByUserId: 'buyer-1',
    reasonCode: DisputeReasonCode.NOT_AS_DESCRIBED,
    statement: 'Item never arrived.',
    state,
    version,
    evidenceWindowExpiresAt: new Date('2026-01-01T00:00:00.000Z'),
    resolvedOutcome: null,
    resolvedByUserId: null,
    resolvedAt: null,
    resolvedSellerAmount: null,
    resolvedBuyerAmount: null,
    resolvedFeeAmount: null,
    resolvedCurrency: null,
    resolvedArbitrationRecordId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

interface Harness {
  stateMachine: DisputeStateMachine;
  transactionSpy: jest.Mock;
  insertSpy: jest.Mock;
  setSpy: jest.Mock;
  whereSpy: jest.Mock;
  findOne: jest.Mock;
  manager: EntityManager;
}

function buildHarness(dispute: Dispute | null, affected = 1): Harness {
  const findOne = jest.fn().mockResolvedValue(dispute);
  const disputes = { findOne } as unknown as Repository<Dispute>;

  const insertSpy = jest.fn().mockResolvedValue(undefined);
  const setSpy = jest.fn();
  const whereSpy = jest.fn();
  const builder = {
    update: () => builder,
    set: (values: unknown) => {
      setSpy(values);
      return builder;
    },
    where: (clause: string, params: unknown) => {
      whereSpy(clause, params);
      return builder;
    },
    execute: () => Promise.resolve({ affected }),
  };

  const manager = {
    createQueryBuilder: () => builder,
    insert: insertSpy,
    getRepository: () => disputes,
  } as unknown as EntityManager;

  const transactionSpy = jest
    .fn()
    .mockImplementation((cb: (m: EntityManager) => Promise<unknown>) => cb(manager));
  const dataSource = { transaction: transactionSpy } as unknown as DataSource;

  return {
    stateMachine: new DisputeStateMachine(disputes, dataSource),
    transactionSpy,
    insertSpy,
    setSpy,
    whereSpy,
    findOne,
    manager,
  };
}

describe('DisputeStateMachine.transition', () => {
  it('throws NotFoundException for an unknown dispute and never opens a transaction', async () => {
    const { stateMachine, transactionSpy } = buildHarness(null);

    await expect(
      stateMachine.transition(randomUUID(), DisputeState.EVIDENCE, { actorId: 'u1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('throws IllegalDisputeTransitionError for a transition missing from the table', async () => {
    const dispute = buildDispute(DisputeState.OPEN);
    const { stateMachine, transactionSpy } = buildHarness(dispute);

    await expect(
      stateMachine.transition(dispute.id, DisputeState.RESOLVED, { actorId: 'u1' }),
    ).rejects.toBeInstanceOf(IllegalDisputeTransitionError);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('refuses to move out of the terminal RESOLVED state', async () => {
    const dispute = buildDispute(DisputeState.RESOLVED);
    const { stateMachine, transactionSpy } = buildHarness(dispute);

    await expect(
      stateMachine.transition(dispute.id, DisputeState.UNDER_REVIEW, { actorId: 'u1' }),
    ).rejects.toBeInstanceOf(IllegalDisputeTransitionError);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('advances OPEN to EVIDENCE and bumps the in-memory version', async () => {
    const dispute = buildDispute(DisputeState.OPEN, 1);
    const { stateMachine } = buildHarness(dispute);

    const result = await stateMachine.transition(dispute.id, DisputeState.EVIDENCE, {
      actorId: 'u1',
    });

    expect(result.state).toBe(DisputeState.EVIDENCE);
    expect(result.version).toBe(2);
  });

  it('guards the update with the version it read, so a concurrent write cannot be clobbered', async () => {
    const dispute = buildDispute(DisputeState.EVIDENCE, 7);
    const { stateMachine, whereSpy } = buildHarness(dispute);

    await stateMachine.transition(dispute.id, DisputeState.UNDER_REVIEW, { actorId: 'u1' });

    expect(whereSpy).toHaveBeenCalledWith('id = :id AND version = :version', {
      id: dispute.id,
      version: 7,
    });
  });

  it('throws StaleDisputeVersionError when the guarded update matches no row', async () => {
    const dispute = buildDispute(DisputeState.EVIDENCE);
    const { stateMachine, insertSpy } = buildHarness(dispute, 0);

    await expect(
      stateMachine.transition(dispute.id, DisputeState.UNDER_REVIEW, { actorId: 'u1' }),
    ).rejects.toBeInstanceOf(StaleDisputeVersionError);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('appends a dispute event recording both ends of the transition', async () => {
    const dispute = buildDispute(DisputeState.EVIDENCE);
    const { stateMachine, insertSpy } = buildHarness(dispute);

    await stateMachine.transition(dispute.id, DisputeState.UNDER_REVIEW, {
      actorId: 'arbiter-1',
      reason: 'Evidence window closed',
      correlationId: 'corr-9',
    });

    expect(insertSpy).toHaveBeenCalledWith(DisputeEvent, {
      disputeId: dispute.id,
      actorId: 'arbiter-1',
      fromState: DisputeState.EVIDENCE,
      toState: DisputeState.UNDER_REVIEW,
      reason: 'Evidence window closed',
      correlationId: 'corr-9',
    });
  });

  it('generates a correlation id when the caller does not supply one', async () => {
    const dispute = buildDispute(DisputeState.EVIDENCE);
    const { stateMachine, insertSpy } = buildHarness(dispute);

    await stateMachine.transition(dispute.id, DisputeState.UNDER_REVIEW, { actorId: null });

    expect(callArg(insertSpy, 0, 1)).toEqual(
      expect.objectContaining({ actorId: null, reason: null, correlationId: expect.any(String) as string }),
    );
  });

  it('joins a caller-supplied manager instead of opening its own transaction', async () => {
    const dispute = buildDispute(DisputeState.OPEN);
    const { stateMachine, transactionSpy, manager, insertSpy } = buildHarness(dispute);

    const result = await stateMachine.transition(
      dispute.id,
      DisputeState.EVIDENCE,
      { actorId: 'u1' },
      manager,
    );

    expect(result.state).toBe(DisputeState.EVIDENCE);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(transactionSpy).not.toHaveBeenCalled();
  });
});

describe('DisputeStateMachine.transitionIdempotent', () => {
  it('no-ops when the dispute already sits in the requested state', async () => {
    const dispute = buildDispute(DisputeState.RESOLVED);
    const { stateMachine, transactionSpy } = buildHarness(dispute);

    const result = await stateMachine.transitionIdempotent(dispute.id, DisputeState.RESOLVED, {
      actorId: null,
    });

    expect(result.state).toBe(DisputeState.RESOLVED);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('rethrows when the dispute is in a different state than the one requested', async () => {
    const dispute = buildDispute(DisputeState.RESOLVED);
    const { stateMachine } = buildHarness(dispute);

    await expect(
      stateMachine.transitionIdempotent(dispute.id, DisputeState.EVIDENCE, { actorId: null }),
    ).rejects.toBeInstanceOf(IllegalDisputeTransitionError);
  });

  it('performs a real transition when the move is still legal', async () => {
    const dispute = buildDispute(DisputeState.EVIDENCE);
    const { stateMachine, insertSpy } = buildHarness(dispute);

    const result = await stateMachine.transitionIdempotent(dispute.id, DisputeState.UNDER_REVIEW, {
      actorId: null,
    });

    expect(result.state).toBe(DisputeState.UNDER_REVIEW);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it('does not swallow a stale version error', async () => {
    const dispute = buildDispute(DisputeState.EVIDENCE);
    const { stateMachine } = buildHarness(dispute, 0);

    await expect(
      stateMachine.transitionIdempotent(dispute.id, DisputeState.UNDER_REVIEW, { actorId: null }),
    ).rejects.toBeInstanceOf(StaleDisputeVersionError);
  });
});

describe('DisputeStateMachine.getLegalNextStates', () => {
  it('walks the full lifecycle one legal step at a time', () => {
    const { stateMachine } = buildHarness(null);

    expect(stateMachine.getLegalNextStates(DisputeState.OPEN)).toEqual([DisputeState.EVIDENCE]);
    expect(stateMachine.getLegalNextStates(DisputeState.EVIDENCE)).toEqual([
      DisputeState.UNDER_REVIEW,
    ]);
    expect(stateMachine.getLegalNextStates(DisputeState.UNDER_REVIEW)).toEqual([
      DisputeState.RESOLVED,
    ]);
  });

  it('returns nothing for the terminal state', () => {
    const { stateMachine } = buildHarness(null);

    expect(stateMachine.getLegalNextStates(DisputeState.RESOLVED)).toEqual([]);
  });
});
