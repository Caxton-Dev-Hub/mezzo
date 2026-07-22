import { RecommendationEngine } from '../recommendation-engine';
import {
  ABSTENTION_RATE_TARGET,
  CLEAR_CASE_ACCURACY_TARGET,
  loadFixtures,
  runEvalSuite,
} from './run-evals';

describe('arbitration eval harness (mocked model, runs in CI by default)', () => {
  const engine = new RecommendationEngine();
  const fixtures = loadFixtures();

  it('loads the hand-labelled fixture set', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
    const ids = fixtures.map((fixture) => fixture.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'clear-seller-wins',
        'clear-buyer-wins',
        'genuinely-ambiguous',
        'tampered-evidence',
        'missing-evidence',
      ]),
    );
  });

  it('meets the target accuracy on clear-cut fixtures and the target abstention rate on ambiguous/tampered/missing fixtures', () => {
    const report = runEvalSuite(engine, fixtures);

    expect(report.clearCaseAccuracy).toBeGreaterThanOrEqual(CLEAR_CASE_ACCURACY_TARGET);
    expect(report.abstentionRate).toBeGreaterThanOrEqual(ABSTENTION_RATE_TARGET);
  });

  it('abstains on the tampered-evidence fixture specifically because of unresolved integrity flags', () => {
    const fixture = fixtures.find((item) => item.id === 'tampered-evidence');
    expect(fixture).toBeDefined();
    const result = engine.evaluate(fixture!.rawModelResponse, {
      hasUnresolvedIntegrityFlags: fixture!.hasUnresolvedIntegrityFlags,
      confidenceThreshold: 0.75,
    });
    expect(result.abstentionReason).toBe('UNRESOLVED_INTEGRITY_FLAGS');
  });

  it('abstains on the missing-evidence fixture specifically because the model flags missing evidence', () => {
    const fixture = fixtures.find((item) => item.id === 'missing-evidence');
    expect(fixture).toBeDefined();
    const result = engine.evaluate(fixture!.rawModelResponse, {
      hasUnresolvedIntegrityFlags: fixture!.hasUnresolvedIntegrityFlags,
      confidenceThreshold: 0.75,
    });
    expect(result.abstentionReason).toBe('CONTRADICTORY_OR_MISSING_EVIDENCE');
  });
});
