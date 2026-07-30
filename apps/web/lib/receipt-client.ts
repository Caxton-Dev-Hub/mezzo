import type { ReceiptResponse } from '@mezzo/shared-types';
import { apiRequest, apiRequestBlob } from './api-client';

export function getEscrowReceipt(escrowId: string): Promise<ReceiptResponse> {
  return apiRequest<ReceiptResponse>(`/escrows/${escrowId}/receipt`);
}

export function getEscrowReceiptPdf(escrowId: string): Promise<Blob> {
  return apiRequestBlob(`/escrows/${escrowId}/receipt.pdf`);
}
