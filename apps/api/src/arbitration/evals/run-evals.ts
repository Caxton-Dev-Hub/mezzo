import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RecommendationEngine } from '../recommendation-engine';
import { ArbitrationStatus } from '../entities/arbitration-status.enum';
import { DisputeResolutionOutcome } from '../../disputes/entities/dispute-resolution-outcome.enum';

export type ExpectedLabel = DisputeResolutionOutcome | 'NEEDS_HUMAN';

export interface EvalFixture {
  id: string;
  description: string;
  hasUnresolvedIntegrityFlags: boolean;
  expectedLabel: ExpectedLabel;
  rawModelResponse: string;
}

export interface EvalOutcome {
  fixtureId: string;
  expectedLabel: ExpectedLabel;
  actualStatus: ArbitrationStatus;
  actualOutcome: DisputeResolutionOutcome | null;
  correct: boolean;
}

export interface EvalReport {
  outcomes: EvalOutcome[];
  clearCaseAccuracy: number;
  abstentionRate: number;
}

export const CLEAR_CASE_ACCURACY_TARGET = 0.8;
export const ABSTENTION_RATE_TARGET = 0.8;
export const CONFIDENCE_THRESHOLD = 0.75;

export function loadFixtures(): EvalFixture[] {
  const dir = join(__dirname, 'fixtures');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as EvalFixture);
}

export function runEvalSuite(
  engine: RecommendationEngine,
  fixtures: EvalFixture[],
  confidenceThreshold: number = CONFIDENCE_THRESHOLD,
): EvalReport {
  const outcomes: EvalOutcome[] = fixtures.map((fixture) => {
    const result = engine.evaluate(fixture.rawModelResponse, {
      hasUnresolvedIntegrityFlags: fixture.hasUnresolvedIntegrityFlags,
      confidenceThreshold,
    });

    const correct =
      fixture.expectedLabel === 'NEEDS_HUMAN'
        ? result.status === ArbitrationStatus.NEEDS_HUMAN
        : result.status === ArbitrationStatus.RECOMMENDED && result.outcome === fixture.expectedLabel;

    return {
      fixtureId: fixture.id,
      expectedLabel: fixture.expectedLabel,
      actualStatus: result.status,
      actualOutcome: result.outcome,
      correct,
    };
  });

  const clearCases = outcomes.filter((outcome) => outcome.expectedLabel !== 'NEEDS_HUMAN');
  const abstainCases = outcomes.filter((outcome) => outcome.expectedLabel === 'NEEDS_HUMAN');

  const clearCaseAccuracy =
    clearCases.length === 0 ? 1 : clearCases.filter((outcome) => outcome.correct).length / clearCases.length;
  const abstentionRate =
    abstainCases.length === 0
      ? 1
      : abstainCases.filter((outcome) => outcome.correct).length / abstainCases.length;

  return { outcomes, clearCaseAccuracy, abstentionRate };
}
