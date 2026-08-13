import type { ReceiptResponse } from '@mezzo/shared-types';
import { Escrow } from '../../database/entities/escrow.entity';
import { EscrowTerms } from '../../database/entities/escrow-terms.entity';
import { Money } from '../../common/money/money';
import { computeFeeSplit } from '../../escrow/fee-split';

export type { ReceiptResponse };

export interface ReceiptSource {
  escrow: Escrow;
  terms: EscrowTerms;
  buyerEmail: string;
  sellerEmail: string;
  fundedAt: Date | null;
  releasedAt: Date | null;
  paymentReference: string | null;
}

export function toReceiptResponse(source: ReceiptSource): ReceiptResponse {
  const price = Money.of(source.terms.priceAmount, source.terms.priceCurrency);
  const { feeAmount, netAmount } = computeFeeSplit(price, source.terms.feeBps);

  return {
    escrowId: source.escrow.id,
    escrowCode: source.escrow.code,
    state: source.escrow.state,
    itemDescription: source.terms.itemDescription,
    deliveryMethod: source.terms.deliveryMethod,
    price: price.toJSON(),
    feeBps: source.terms.feeBps,
    feeAmount: feeAmount.toJSON(),
    netAmount: netAmount.toJSON(),
    buyerEmail: source.buyerEmail,
    sellerEmail: source.sellerEmail,
    createdAt: source.escrow.createdAt,
    fundedAt: source.fundedAt,
    releasedAt: source.releasedAt,
    paymentReference: source.paymentReference,
  };
}
