import type { RaiseDisputeDto } from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export interface DisputeResponse {
  id: string;
  escrowId: string;
}

export function raiseDispute(escrowId: string, dto: RaiseDisputeDto): Promise<DisputeResponse> {
  return apiRequest<DisputeResponse>(`/escrows/${escrowId}/disputes`, { method: 'POST', body: dto });
}
