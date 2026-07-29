import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EvidenceItemResponse } from '@mezzo/shared-types';
import { EvidenceViewer } from '../components/evidence/evidence-viewer';

function makeItem(overrides: Partial<EvidenceItemResponse> = {}): EvidenceItemResponse {
  return {
    id: 'item-1',
    escrowId: 'escrow-1',
    uploaderId: 'user-1',
    phase: 'AT_CREATION',
    contentHash: 'hash',
    declaredMime: 'image/jpeg',
    detectedMime: 'image/jpeg',
    sizeBytes: 1000,
    width: 800,
    height: 600,
    capturedAt: null,
    deviceMake: null,
    deviceModel: null,
    gpsLatitude: null,
    gpsLongitude: null,
    flags: [],
    url: 'https://storage.example.com/item-1.jpg',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('EvidenceViewer', () => {
  it('shows an empty state when there is no evidence', () => {
    render(<EvidenceViewer items={[]} emptyLabel="No evidence submitted" />);
    expect(screen.getByText('No evidence submitted')).toBeInTheDocument();
  });

  it('surfaces integrity flags rather than hiding them', () => {
    render(<EvidenceViewer items={[makeItem({ flags: ['MISSING_METADATA'] })]} />);
    expect(screen.getByTitle('Missing capture metadata')).toBeInTheDocument();
  });

  it('opens a detail view with flags when an item is selected', async () => {
    const user = userEvent.setup();
    render(<EvidenceViewer items={[makeItem({ flags: ['TIMESTAMP_MISMATCH'] })]} />);

    await user.click(screen.getByRole('button'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Capture timestamp mismatch')).toBeInTheDocument();
  });
});
