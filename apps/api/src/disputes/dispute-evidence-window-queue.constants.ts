export const DISPUTE_EVIDENCE_WINDOW_QUEUE = 'dispute-evidence-window';
export const DISPUTE_EVIDENCE_WINDOW_JOB = 'close-evidence-window';

export interface DisputeEvidenceWindowJobData {
  disputeId: string;
}

export function disputeEvidenceWindowJobId(disputeId: string): string {
  return `dispute-evidence-window-${disputeId}`;
}
