import { beforeEach, describe, expect, it } from 'vitest';
import type { EscrowDetailResponse, InviteResponse } from '@mezzo/shared-types';
import { useEscrowWizardStore } from '@/lib/escrow-wizard-store';

const escrow = { id: 'escrow-1', state: 'DRAFT' } as unknown as EscrowDetailResponse;
const invite = { token: 'invite-token' } as unknown as InviteResponse;

beforeEach(() => {
  useEscrowWizardStore.getState().reset();
});

describe('useEscrowWizardStore', () => {
  it('starts on the details step with nothing created yet', () => {
    const state = useEscrowWizardStore.getState();

    expect(state.step).toBe(1);
    expect(state.escrow).toBeNull();
    expect(state.invite).toBeNull();
  });

  it('advances through the wizard steps', () => {
    useEscrowWizardStore.getState().setStep(2);
    expect(useEscrowWizardStore.getState().step).toBe(2);

    useEscrowWizardStore.getState().setStep(3);
    expect(useEscrowWizardStore.getState().step).toBe(3);
  });

  it('lets the user step back without losing the draft', () => {
    useEscrowWizardStore.getState().setEscrow(escrow);
    useEscrowWizardStore.getState().setStep(3);

    useEscrowWizardStore.getState().setStep(2);

    expect(useEscrowWizardStore.getState().step).toBe(2);
    expect(useEscrowWizardStore.getState().escrow).toEqual(escrow);
  });

  it('holds the created draft and its invite', () => {
    useEscrowWizardStore.getState().setEscrow(escrow);
    useEscrowWizardStore.getState().setInvite(invite);

    const state = useEscrowWizardStore.getState();
    expect(state.escrow).toEqual(escrow);
    expect(state.invite).toEqual(invite);
  });

  it('clears everything on reset so a second escrow starts clean', () => {
    useEscrowWizardStore.getState().setEscrow(escrow);
    useEscrowWizardStore.getState().setInvite(invite);
    useEscrowWizardStore.getState().setStep(3);

    useEscrowWizardStore.getState().reset();

    expect(useEscrowWizardStore.getState()).toEqual(
      expect.objectContaining({ step: 1, escrow: null, invite: null }),
    );
  });
});
