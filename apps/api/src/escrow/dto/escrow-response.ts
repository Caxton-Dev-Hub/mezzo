import { Escrow } from '../../database/entities/escrow.entity';
import { EscrowTerms } from '../../database/entities/escrow-terms.entity';
import { EscrowParty } from '../../database/entities/escrow-party.entity';
import { Invite } from '../../database/entities/invite.entity';
import { EscrowState } from '../entities/escrow-state.enum';
import { EscrowRole } from '../entities/escrow-role.enum';
import { Currency } from '../../common/money/currency';

export interface EscrowPartyResponse {
  userId: string;
  role: EscrowRole;
  termsAcceptedAt: Date | null;
}

export function toEscrowPartyResponse(party: EscrowParty): EscrowPartyResponse {
  return { userId: party.userId, role: party.role, termsAcceptedAt: party.termsAcceptedAt };
}

export interface EscrowTermsResponse {
  price: { amount: number; currency: Currency };
  inspectionWindowHours: number;
  deliveryMethod: string;
  itemDescription: string;
  feeBps: number;
}

export function toEscrowTermsResponse(terms: EscrowTerms): EscrowTermsResponse {
  return {
    price: { amount: terms.priceAmount, currency: terms.priceCurrency },
    inspectionWindowHours: terms.inspectionWindowHours,
    deliveryMethod: terms.deliveryMethod,
    itemDescription: terms.itemDescription,
    feeBps: terms.feeBps,
  };
}

export interface EscrowDetailResponse {
  id: string;
  state: EscrowState;
  version: number;
  terms: EscrowTermsResponse | null;
  parties: EscrowPartyResponse[];
  trackingReference: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toEscrowDetailResponse(
  escrow: Escrow,
  terms: EscrowTerms | null,
  parties: EscrowParty[],
): EscrowDetailResponse {
  return {
    id: escrow.id,
    state: escrow.state,
    version: escrow.version,
    terms: terms ? toEscrowTermsResponse(terms) : null,
    parties: parties.map(toEscrowPartyResponse),
    trackingReference: escrow.trackingReference,
    deliveredAt: escrow.deliveredAt,
    createdAt: escrow.createdAt,
    updatedAt: escrow.updatedAt,
  };
}

export interface InviteResponse {
  token: string;
  expiresAt: Date;
}

export function toInviteResponse(invite: Invite): InviteResponse {
  return { token: invite.token, expiresAt: invite.expiresAt };
}
