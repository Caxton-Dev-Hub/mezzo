export const AUTO_RELEASE_QUEUE = 'escrow-auto-release';
export const AUTO_RELEASE_JOB = 'auto-release';

export interface AutoReleaseJobData {
  escrowId: string;
}

export function autoReleaseJobId(escrowId: string): string {
  return `auto-release-${escrowId}`;
}
