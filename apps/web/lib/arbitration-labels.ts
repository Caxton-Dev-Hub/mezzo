import type { AbstentionReason } from '@mezzo/shared-types';

export const ABSTENTION_REASON_LABELS: Record<AbstentionReason, string> = {
  PARSE_FAILURE: 'The model returned an unusable response',
  NO_CITED_EVIDENCE: 'The model cited no evidence',
  UNRESOLVED_INTEGRITY_FLAGS: 'Evidence carries unresolved integrity flags',
  CONTRADICTORY_OR_MISSING_EVIDENCE: 'Evidence is contradictory or incomplete',
  LOW_CONFIDENCE: 'Confidence below the routing threshold',
  PROVIDER_ERROR: 'Both model providers failed',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  DISPUTE_RESOLUTION_EXECUTED: 'Resolution executed',
  LEDGER_ADJUSTMENT_POSTED: 'Ledger adjustment posted',
  KYC_TIER_OVERRIDE: 'KYC tier overridden',
};
