import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InspectionCountdown } from '../components/escrow/inspection-countdown';

afterEach(() => {
  vi.useRealTimers();
});

describe('InspectionCountdown', () => {
  it('shows remaining time within the inspection window', () => {
    const deliveredAt = new Date(Date.now() - 60 * 60 * 1000);
    render(<InspectionCountdown deliveredAt={deliveredAt} inspectionWindowHours={48} />);

    expect(screen.getByText(/4[67]h .*remaining/)).toBeInTheDocument();
  });

  it('shows a warning style when the window is nearly over', () => {
    const deliveredAt = new Date(Date.now() - 47 * 60 * 60 * 1000);
    render(<InspectionCountdown deliveredAt={deliveredAt} inspectionWindowHours={48} />);

    expect(screen.getByRole('status')).toHaveTextContent('ending soon');
  });

  it('shows an expired message once the window has passed', () => {
    const deliveredAt = new Date(Date.now() - 49 * 60 * 60 * 1000);
    render(<InspectionCountdown deliveredAt={deliveredAt} inspectionWindowHours={48} />);

    expect(screen.getByText(/window has ended/)).toBeInTheDocument();
  });
});
