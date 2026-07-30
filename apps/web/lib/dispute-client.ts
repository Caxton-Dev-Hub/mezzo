import type {
  DisputePacketResponse,
  DisputeResponse,
  RaiseDisputeDto,
  ResolveDisputeDto,
} from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function raiseDispute(escrowId: string, dto: RaiseDisputeDto): Promise<DisputeResponse> {
  return apiRequest<DisputeResponse>(`/escrows/${escrowId}/disputes`, { method: 'POST', body: dto });
}

export function listEscrowDisputes(escrowId: string): Promise<DisputeResponse[]> {
  return apiRequest<DisputeResponse[]>(`/escrows/${escrowId}/disputes`);
}

export function getDisputePacket(disputeId: string): Promise<DisputePacketResponse> {
  return apiRequest<DisputePacketResponse>(`/disputes/${disputeId}`);
}

export function closeDisputeEvidenceWindow(disputeId: string): Promise<DisputeResponse> {
  return apiRequest<DisputeResponse>(`/disputes/${disputeId}/close-evidence-window`, {
    method: 'POST',
  });
}

export function resolveDispute(disputeId: string, dto: ResolveDisputeDto): Promise<DisputeResponse> {
  return apiRequest<DisputeResponse>(`/disputes/${disputeId}/resolve`, {
    method: 'POST',
    body: dto,
  });
}
