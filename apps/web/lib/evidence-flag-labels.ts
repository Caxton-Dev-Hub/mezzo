import type { EvidenceFlagType } from '@mezzo/shared-types';

export const EVIDENCE_FLAG_LABELS: Record<EvidenceFlagType, string> = {
  DUPLICATE_CONTENT: 'Duplicate content',
  MISSING_METADATA: 'Missing capture metadata',
  TIMESTAMP_MISMATCH: 'Capture timestamp mismatch',
};
