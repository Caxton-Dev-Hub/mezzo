import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EscrowEventResponse } from '@mezzo/shared-types';
import { StatusTimeline } from '../components/escrow/status-timeline';

function event(toState: EscrowEventResponse['toState'], createdAt: string): EscrowEventResponse {
  return {
    id: `${toState}-event`,
    fromState: 'DRAFT',
    toState,
    actorId: null,
    reason: null,
    createdAt: new Date(createdAt),
  };
}

describe('StatusTimeline', () => {
  it('highlights the current state and renders a timestamp for every step', () => {
    render(
      <StatusTimeline
        currentState="AGREED"
        createdAt="2026-01-01T10:00:00.000Z"
        events={[
          event('PENDING_COUNTERPARTY', '2026-01-01T11:00:00.000Z'),
          event('AGREED', '2026-01-01T12:00:00.000Z'),
        ]}
      />,
    );

    const current = screen.getByText('Terms agreed').closest('div');
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Draft created')).toBeInTheDocument();
    expect(screen.getByText('Waiting for counterparty')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('marks a dispute branch distinctly from the happy path', () => {
    render(
      <StatusTimeline
        currentState="DISPUTED"
        createdAt="2026-01-01T10:00:00.000Z"
        events={[
          event('PENDING_COUNTERPARTY', '2026-01-01T11:00:00.000Z'),
          event('AGREED', '2026-01-01T12:00:00.000Z'),
          event('FUNDED', '2026-01-01T13:00:00.000Z'),
          event('SHIPPED', '2026-01-01T14:00:00.000Z'),
          event('DELIVERED', '2026-01-01T15:00:00.000Z'),
          event('DISPUTED', '2026-01-01T16:00:00.000Z'),
        ]}
      />,
    );

    const current = screen.getByText('Dispute raised').closest('div');
    expect(current).toHaveAttribute('aria-current', 'step');
  });
});
