import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { KycStatusResponse } from '@mezzo/shared-types';
import { VerifyPrompt } from '../components/kyc/verify-prompt';
import { renderWithProviders } from './render-with-providers';

function buildStatus(overrides: Partial<KycStatusResponse> = {}): KycStatusResponse {
  return {
    tier: 'TIER_0',
    latestVerification: null,
    verificationEnabled: true,
    ...overrides,
  };
}

describe('VerifyPrompt', () => {
  it('tells the user verification is not live yet when it is disabled platform-wide', () => {
    renderWithProviders(
      <VerifyPrompt
        status={buildStatus({ verificationEnabled: false })}
        requiredTier="TIER_1"
        reason="Needed to fund"
      />,
    );

    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Verify now' })).not.toBeInTheDocument();
  });

  it('links to the manual verification flow with the required tier, instead of submitting directly', () => {
    renderWithProviders(
      <VerifyPrompt status={buildStatus()} requiredTier="TIER_2" reason="Needed to withdraw" />,
    );

    expect(screen.getByText('Needed to withdraw')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Verify now' })).toHaveAttribute(
      'href',
      '/kyc/verify?tier=TIER_2',
    );
  });

  it('shows a pending-review message instead of the link once a submission is in review', () => {
    renderWithProviders(
      <VerifyPrompt
        status={buildStatus({
          latestVerification: {
            id: 'v1',
            status: 'PENDING',
            requestedTier: 'TIER_1',
            providerReference: 'manual-submission:abc',
            createdAt: new Date(),
          },
        })}
        requiredTier="TIER_1"
        reason="Needed to fund"
      />,
    );

    expect(screen.getByText(/in review/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Verify now' })).not.toBeInTheDocument();
  });
});
