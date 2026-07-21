import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { EscrowStateMachine } from './escrow-state-machine';
import { EscrowState } from './entities/escrow-state.enum';
import { IllegalTransitionError } from './errors/illegal-transition.error';
import { NotEscrowPartyError } from './errors/not-escrow-party.error';
import { Escrow } from '../database/entities/escrow.entity';
import { EscrowParty } from '../database/entities/escrow-party.entity';

function buildEscrow(state: EscrowState): Escrow {
  return {
    id: randomUUID(),
    state,
    version: 1,
    trackingReference: null,
    deliveredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildHarness(
  escrow: Escrow | null,
  partyUserIds: string[],
): { stateMachine: EscrowStateMachine; transactionSpy: jest.Mock } {
  const escrows = {
    findOne: jest.fn().mockResolvedValue(escrow),
  } as unknown as Repository<Escrow>;

  const parties = {
    find: jest
      .fn()
      .mockResolvedValue(partyUserIds.map((userId) => ({ userId }) as EscrowParty)),
  } as unknown as Repository<EscrowParty>;

  const transactionSpy = jest.fn();
  const dataSource = { transaction: transactionSpy } as unknown as DataSource;

  return { stateMachine: new EscrowStateMachine(escrows, parties, dataSource), transactionSpy };
}

describe('EscrowStateMachine', () => {
  it('throws NotFoundException for an unknown escrow and never opens a transaction', async () => {
    const { stateMachine, transactionSpy } = buildHarness(null, []);

    await expect(
      stateMachine.transition(randomUUID(), EscrowState.PENDING_COUNTERPARTY, { actorId: 'u1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('throws IllegalTransitionError for a transition not in the table and never opens a transaction', async () => {
    const escrow = buildEscrow(EscrowState.DRAFT);
    const { stateMachine, transactionSpy } = buildHarness(escrow, ['u1']);

    await expect(
      stateMachine.transition(escrow.id, EscrowState.RELEASED, { actorId: 'u1' }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('throws IllegalTransitionError for any transition out of a terminal state', async () => {
    const escrow = buildEscrow(EscrowState.RELEASED);
    const { stateMachine, transactionSpy } = buildHarness(escrow, ['u1']);

    await expect(
      stateMachine.transition(escrow.id, EscrowState.RELEASED, { actorId: 'u1' }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('enforces the mustBeParty guard before opening a transaction', async () => {
    const escrow = buildEscrow(EscrowState.DRAFT);
    const { stateMachine, transactionSpy } = buildHarness(escrow, ['u1']);

    await expect(
      stateMachine.transition(escrow.id, EscrowState.PENDING_COUNTERPARTY, { actorId: 'stranger' }),
    ).rejects.toBeInstanceOf(NotEscrowPartyError);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  describe('transitionIdempotent', () => {
    it('no-ops when the escrow is already in the requested terminal state', async () => {
      const escrow = buildEscrow(EscrowState.RELEASED);
      const { stateMachine, transactionSpy } = buildHarness(escrow, ['u1']);

      const result = await stateMachine.transitionIdempotent(escrow.id, EscrowState.RELEASED, {
        actorId: 'u1',
      });

      expect(result.state).toBe(EscrowState.RELEASED);
      expect(transactionSpy).not.toHaveBeenCalled();
    });

    it('rethrows when the escrow is terminal but in a different state than requested', async () => {
      const escrow = buildEscrow(EscrowState.CANCELLED);
      const { stateMachine } = buildHarness(escrow, ['u1']);

      await expect(
        stateMachine.transitionIdempotent(escrow.id, EscrowState.RELEASED, { actorId: 'u1' }),
      ).rejects.toBeInstanceOf(IllegalTransitionError);
    });
  });

  describe('getLegalNextStates', () => {
    it('returns an empty list for terminal states', () => {
      const { stateMachine } = buildHarness(null, []);
      expect(stateMachine.getLegalNextStates(EscrowState.RELEASED)).toEqual([]);
    });

    it('returns the happy-path next state for DRAFT', () => {
      const { stateMachine } = buildHarness(null, []);
      expect(stateMachine.getLegalNextStates(EscrowState.DRAFT)).toContain(
        EscrowState.PENDING_COUNTERPARTY,
      );
    });
  });
});
