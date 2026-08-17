import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RaiseDisputeModal } from '../components/escrow/raise-dispute-modal';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('../components/evidence/evidence-capture', () => ({
  EvidenceCapture: ({ onConfirmedCountChange }: { onConfirmedCountChange?: (n: number) => void }) => (
    <button type="button" onClick={() => onConfirmedCountChange?.(1)}>
      Simulate uploaded photo
    </button>
  ),
}));

function stubRaise() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ id: 'dispute-1', escrowId: 'escrow-1' }), { status: 201 }),
    ),
  );
}

describe('RaiseDisputeModal', () => {
  beforeEach(() => {
    push.mockReset();
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'token',
      user: {
        id: 'buyer-id',
        email: 'buyer@example.com',
        role: 'USER',
        emailVerified: true,
        createdAt: new Date(),
      },
    });
    stubRaise();
  });

  it('blocks submission until a reason, a statement, and evidence are all present', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RaiseDisputeModal escrowId="escrow-1" escrowState="DELIVERED" open onClose={vi.fn()} />,
    );

    const submit = screen.getByRole('button', { name: 'Raise dispute' });
    expect(submit).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Reason'), 'DAMAGED');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('What happened?'), 'The lens arrived cracked.');
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Simulate uploaded photo' }));
    expect(submit).toBeEnabled();
  });

  it('warns that the escrow is frozen and opens the dispute center after submitting', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <RaiseDisputeModal escrowId="escrow-1" escrowState="DELIVERED" open onClose={onClose} />,
    );

    expect(screen.getByText(/freezes this escrow/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Reason'), 'NOT_RECEIVED');
    await user.type(screen.getByLabelText('What happened?'), 'It never arrived.');
    await user.click(screen.getByRole('button', { name: 'Simulate uploaded photo' }));
    await user.click(screen.getByRole('button', { name: 'Raise dispute' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/disputes/dispute-1'));
    expect(onClose).toHaveBeenCalled();

    const [, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      reasonCode: 'NOT_RECEIVED',
      statement: 'It never arrived.',
    });
  });

  it.each([['FUNDED' as const], ['SHIPPED' as const]])(
    'lets the buyer submit from %s with no evidence, since the item was never delivered',
    async (escrowState) => {
      const user = userEvent.setup();
      renderWithProviders(
        <RaiseDisputeModal escrowId="escrow-1" escrowState={escrowState} open onClose={vi.fn()} />,
      );

      expect(screen.getByText(/evidence is optional at this stage/i)).toBeInTheDocument();

      const submit = screen.getByRole('button', { name: 'Raise dispute' });
      expect(submit).toBeDisabled();

      await user.selectOptions(screen.getByLabelText('Reason'), 'NOT_RECEIVED');
      await user.type(screen.getByLabelText('What happened?'), 'The item never arrived.');

      expect(submit).toBeEnabled();
    },
  );
});
