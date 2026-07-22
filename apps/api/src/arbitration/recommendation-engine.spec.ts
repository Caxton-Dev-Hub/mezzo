import { RecommendationEngine } from './recommendation-engine';
import { ArbitrationStatus } from './entities/arbitration-status.enum';
import { AbstentionReason } from './entities/abstention-reason.enum';
import { DisputeResolutionOutcome } from '../disputes/entities/dispute-resolution-outcome.enum';

describe('RecommendationEngine', () => {
  const engine = new RecommendationEngine();
  const context = { hasUnresolvedIntegrityFlags: false, confidenceThreshold: 0.75 };

  function validResponse(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      recommendedOutcome: DisputeResolutionOutcome.RELEASE_TO_SELLER,
      confidence: 0.9,
      rationale: 'The seller shipping proof and buyer delivery photos match.',
      citedEvidenceIds: ['evidence-1', 'evidence-2'],
      contradictions: [],
      missingEvidence: [],
      ...overrides,
    });
  }

  it('never crashes and abstains on a non-JSON response', () => {
    const result = engine.evaluate('Sorry, I cannot help with that request.', context);
    expect(result.status).toBe(ArbitrationStatus.NEEDS_HUMAN);
    expect(result.abstentionReason).toBe(AbstentionReason.PARSE_FAILURE);
    expect(result.outcome).toBeNull();
  });

  it('abstains on malformed JSON embedded in prose', () => {
    const result = engine.evaluate('Here is my answer: {not valid json at all}', context);
    expect(result.status).toBe(ArbitrationStatus.NEEDS_HUMAN);
    expect(result.abstentionReason).toBe(AbstentionReason.PARSE_FAILURE);
  });

  it('abstains when the JSON does not match the schema', () => {
    const result = engine.evaluate(JSON.stringify({ foo: 'bar' }), context);
    expect(result.status).toBe(ArbitrationStatus.NEEDS_HUMAN);
    expect(result.abstentionReason).toBe(AbstentionReason.PARSE_FAILURE);
  });

  it('extracts the first JSON block even with prose wrapped around it', () => {
    const wrapped = `Sure, here you go:\n${validResponse()}\nLet me know if you need anything else.`;
    const result = engine.evaluate(wrapped, context);
    expect(result.status).toBe(ArbitrationStatus.RECOMMENDED);
    expect(result.outcome).toBe(DisputeResolutionOutcome.RELEASE_TO_SELLER);
  });

  it('downgrades a recommendation citing no evidence to NEEDS_HUMAN', () => {
    const result = engine.evaluate(validResponse({ citedEvidenceIds: [] }), context);
    expect(result.status).toBe(ArbitrationStatus.NEEDS_HUMAN);
    expect(result.abstentionReason).toBe(AbstentionReason.NO_CITED_EVIDENCE);
    expect(result.outcome).toBe(DisputeResolutionOutcome.RELEASE_TO_SELLER);
  });

  it('routes below-threshold confidence to NEEDS_HUMAN even when an outcome is proposed', () => {
    const result = engine.evaluate(validResponse({ confidence: 0.4 }), context);
    expect(result.status).toBe(ArbitrationStatus.NEEDS_HUMAN);
    expect(result.abstentionReason).toBe(AbstentionReason.LOW_CONFIDENCE);
    expect(result.outcome).toBe(DisputeResolutionOutcome.RELEASE_TO_SELLER);
    expect(result.confidence).toBe(0.4);
  });

  it('routes to NEEDS_HUMAN when unresolved integrity flags are present, regardless of confidence', () => {
    const result = engine.evaluate(validResponse(), { ...context, hasUnresolvedIntegrityFlags: true });
    expect(result.status).toBe(ArbitrationStatus.NEEDS_HUMAN);
    expect(result.abstentionReason).toBe(AbstentionReason.UNRESOLVED_INTEGRITY_FLAGS);
  });

  it('routes to NEEDS_HUMAN when the model itself reports contradictions', () => {
    const result = engine.evaluate(
      validResponse({ contradictions: ['Buyer photo timestamp precedes shipment'] }),
      context,
    );
    expect(result.status).toBe(ArbitrationStatus.NEEDS_HUMAN);
    expect(result.abstentionReason).toBe(AbstentionReason.CONTRADICTORY_OR_MISSING_EVIDENCE);
  });

  it('routes to NEEDS_HUMAN when the model reports missing evidence', () => {
    const result = engine.evaluate(
      validResponse({ missingEvidence: ['No shipping proof from seller'] }),
      context,
    );
    expect(result.status).toBe(ArbitrationStatus.NEEDS_HUMAN);
    expect(result.abstentionReason).toBe(AbstentionReason.CONTRADICTORY_OR_MISSING_EVIDENCE);
  });

  it('surfaces a RECOMMENDED result when confidence is high, evidence is cited, and nothing is flagged', () => {
    const result = engine.evaluate(validResponse(), context);
    expect(result.status).toBe(ArbitrationStatus.RECOMMENDED);
    expect(result.abstentionReason).toBeNull();
    expect(result.outcome).toBe(DisputeResolutionOutcome.RELEASE_TO_SELLER);
    expect(result.citedEvidenceIds).toEqual(['evidence-1', 'evidence-2']);
  });

  it('accepts a SPLIT outcome with a splitRatio', () => {
    const result = engine.evaluate(
      validResponse({ recommendedOutcome: DisputeResolutionOutcome.SPLIT, splitRatio: 6_000 }),
      context,
    );
    expect(result.status).toBe(ArbitrationStatus.RECOMMENDED);
    expect(result.splitSellerBps).toBe(6_000);
  });

  it('rejects a SPLIT outcome missing splitRatio as a schema failure', () => {
    const result = engine.evaluate(
      validResponse({ recommendedOutcome: DisputeResolutionOutcome.SPLIT }),
      context,
    );
    expect(result.status).toBe(ArbitrationStatus.NEEDS_HUMAN);
    expect(result.abstentionReason).toBe(AbstentionReason.PARSE_FAILURE);
  });

  it('produces a provider-failure result with no crash', () => {
    const result = engine.providerFailure();
    expect(result.status).toBe(ArbitrationStatus.NEEDS_HUMAN);
    expect(result.abstentionReason).toBe(AbstentionReason.PROVIDER_ERROR);
    expect(result.outcome).toBeNull();
  });
});
