export const INSPECTION_ENDING_SOON_QUEUE = 'escrow-inspection-ending-soon';
export const INSPECTION_ENDING_SOON_JOB = 'inspection-ending-soon';

export interface InspectionEndingSoonJobData {
  escrowId: string;
}

export function inspectionEndingSoonJobId(escrowId: string): string {
  return `inspection-ending-soon-${escrowId}`;
}
