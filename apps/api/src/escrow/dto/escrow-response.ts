import {
  EscrowDetailResponse,
  EscrowEventResponse,
  EscrowListResponse,
  EscrowPartyResponse,
  EscrowTermsResponse,
  InviteResponse,
} from '@mezzo/shared-types';
import { Escrow } from '../../database/entities/escrow.entity';
import { EscrowTerms } from '../../database/entities/escrow-terms.entity';
import { EscrowParty } from '../../database/entities/escrow-party.entity';
import { EscrowEvent } from '../../database/entities/escrow-event.entity';
import { Invite } from '../../database/entities/invite.entity';

export type {
  EscrowDetailResponse,
  EscrowEventResponse,
  EscrowListResponse,
  EscrowPartyResponse,
  EscrowTermsResponse,
  InviteResponse,
};

export function toEscrowPartyResponse(party: EscrowParty): EscrowPartyResponse {
  return { userId: party.userId, role: party.role, termsAcceptedAt: party.termsAcceptedAt };
}

export function toEscrowTermsResponse(terms: EscrowTerms): EscrowTermsResponse {
  return {
    price: { amount: terms.priceAmount, currency: terms.priceCurrency },
    inspectionWindowHours: terms.inspectionWindowHours,
    deliveryMethod: terms.deliveryMethod,
    itemDescription: terms.itemDescription,
    feeBps: terms.feeBps,
    requiresVerification: terms.requiresVerification,
    agreementText: terms.agreementText,
  };
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

export function toEscrowListResponse(
  items: { escrow: Escrow; terms: EscrowTerms | null; parties: EscrowParty[] }[],
  page: number,
  pageSize: number,
  total: number,
): EscrowListResponse {
  return {
    items: items.map((item) => toEscrowDetailResponse(item.escrow, item.terms, item.parties)),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function toInviteResponse(invite: Invite): InviteResponse {
  return { token: invite.token, expiresAt: invite.expiresAt };
}

export function toEscrowEventResponse(event: EscrowEvent): EscrowEventResponse {
  return {
    id: event.id,
    fromState: event.fromState,
    toState: event.toState,
    actorId: event.actorId,
    reason: event.reason,
    createdAt: event.createdAt,
  };
}
