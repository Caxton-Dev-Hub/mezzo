import type { DisputeResolutionOutcome } from './dispute.schemas';

export interface ResolutionSplit {
  releasedAmount: number;
  sellerAmount: number;
  feeAmount: number;
  buyerAmount: number;
}

export function sellerShareBpsFor(
  outcome: DisputeResolutionOutcome,
  splitSellerBps?: number,
): number {
  if (outcome === 'REFUND_TO_BUYER') {
    return 0;
  }
  if (outcome === 'RELEASE_TO_SELLER') {
    return 10_000;
  }
  return splitSellerBps ?? 0;
}

export function computeResolutionSplit(
  priceAmount: number,
  feeBps: number,
  outcome: DisputeResolutionOutcome,
  splitSellerBps?: number,
): ResolutionSplit {
  const releasedAmount = Math.floor((priceAmount * sellerShareBpsFor(outcome, splitSellerBps)) / 10_000);
  const feeAmount = Math.floor((releasedAmount * feeBps) / 10_000);

  return {
    releasedAmount,
    sellerAmount: releasedAmount - feeAmount,
    feeAmount,
    buyerAmount: priceAmount - releasedAmount,
  };
}
