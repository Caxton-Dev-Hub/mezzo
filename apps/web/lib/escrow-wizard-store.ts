import { create } from 'zustand';
import type { EscrowDetailResponse, InviteResponse } from '@mezzo/shared-types';

export type WizardStep = 1 | 2 | 3;

interface EscrowWizardState {
  step: WizardStep;
  escrow: EscrowDetailResponse | null;
  invite: InviteResponse | null;
  setStep: (step: WizardStep) => void;
  setEscrow: (escrow: EscrowDetailResponse) => void;
  setInvite: (invite: InviteResponse) => void;
  reset: () => void;
}

export const useEscrowWizardStore = create<EscrowWizardState>((set) => ({
  step: 1,
  escrow: null,
  invite: null,
  setStep: (step) => set({ step }),
  setEscrow: (escrow) => set({ escrow }),
  setInvite: (invite) => set({ invite }),
  reset: () => set({ step: 1, escrow: null, invite: null }),
}));
