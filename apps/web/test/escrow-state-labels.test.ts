import { describe, expect, it } from 'vitest';
import type { EscrowState } from '@mezzo/shared-types';
import { ESCROW_BRANCH_STATES, ESCROW_STATE_LABELS } from '@/lib/escrow-state-labels';

const ALL_STATES: EscrowState[] = [
  'DRAFT',
  'PENDING_COUNTERPARTY',
  'AGREED',
  'FUNDED',
  'SHIPPED',
  'DELIVERED',
  'RELEASED',
  'DISPUTED',
  'RESOLVED_RELEASE',
  'RESOLVED_REFUND',
  'REFUNDED',
  'CANCELLED',
  'EXPIRED',
];

describe('ESCROW_STATE_LABELS', () => {
  it('labels every state the API can return', () => {
    for (const state of ALL_STATES) {
      expect(ESCROW_STATE_LABELS[state]).toBeTruthy();
    }
  });

  it('never shows a raw enum name to the user', () => {
    for (const label of Object.values(ESCROW_STATE_LABELS)) {
      expect(label).not.toMatch(/^[A-Z_]+$/);
    }
  });
});

describe('ESCROW_BRANCH_STATES', () => {
  it('treats the happy path as the main line, not a branch', () => {
    for (const state of ['DRAFT', 'AGREED', 'FUNDED', 'SHIPPED', 'DELIVERED', 'RELEASED'] as const) {
      expect(ESCROW_BRANCH_STATES.has(state)).toBe(false);
    }
  });

  it('treats a dispute and every terminal detour as a branch', () => {
    for (const state of [
      'DISPUTED',
      'RESOLVED_RELEASE',
      'RESOLVED_REFUND',
      'REFUNDED',
      'CANCELLED',
      'EXPIRED',
    ] as const) {
      expect(ESCROW_BRANCH_STATES.has(state)).toBe(true);
    }
  });
});
