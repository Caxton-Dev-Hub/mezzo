import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ArbitrationService } from './arbitration.service';
import { ArbitrationStatus } from './entities/arbitration-status.enum';
import { AbstentionReason } from './entities/abstention-reason.enum';
import { ArbitrationPromptBuilder } from './prompt-builder';
import { RecommendationEngine, RecommendationResult } from './recommendation-engine';
import { LlmProvider } from './providers/llm-provider.interface';
import { DisputeAlreadyResolvedError } from './errors/dispute-already-resolved.error';
import { ArbitrationRecord } from '../database/entities/arbitration-record.entity';
import { DisputeService } from '../disputes/dispute.service';
import { DisputePacketResponse } from '../disputes/dto/dispute-response';
import { MetricsService } from '../observability/metrics.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';

const DISPUTE_ID = 'dispute-1';
const arbiter: AuthenticatedUser = { id: 'arbiter-1', role: UserRole.ARBITER };
const CONFIDENCE_THRESHOLD = 0.7;

function buildEvidence(flags: string[] = []) {
  return { id: 'item-1', flags } as unknown as DisputePacketResponse['creationEvidence'][number];
}

function buildPacket(overrides: Partial<DisputePacketResponse> = {}): DisputePacketResponse {
  return {
    dispute: { id: DISPUTE_ID, resolvedOutcome: null },
    frozenTerms: {},
    timeline: [],
    creationEvidence: [],
    buyerEvidence: [],
    sellerEvidence: [],
    submissionFlags: {},
    chatTranscript: [],
    ...overrides,
  } as unknown as DisputePacketResponse;
}

function buildResult(overrides: Partial<RecommendationResult> = {}): RecommendationResult {
  return {
    status: ArbitrationStatus.RECOMMENDED,
    outcome: 'RELEASE_TO_SELLER',
    splitSellerBps: null,
    confidence: 0.9,
    rationale: 'The delivery evidence is consistent.',
    citedEvidenceIds: ['item-1'],
    contradictions: [],
    missingEvidence: [],
    abstentionReason: null,
    ...overrides,
  } as RecommendationResult;
}

interface Harness {
  service: ArbitrationService;
  getPacket: jest.Mock;
  recordsSave: jest.Mock;
  recordsFind: jest.Mock;
  evaluate: jest.Mock;
  providerFailure: jest.Mock;
  primaryComplete: jest.Mock;
  fallbackComplete: jest.Mock;
  buildUserPrompt: jest.Mock;
  incrementArbitrationAbstention: jest.Mock;
}

function buildHarness(
  options: {
    packet?: DisputePacketResponse;
    result?: RecommendationResult;
    records?: ArbitrationRecord[];
  } = {},
): Harness {
  const recordsSave = jest.fn().mockImplementation((row) => Promise.resolve({ id: 'record-1', ...row }));
  const recordsFind = jest.fn().mockResolvedValue(options.records ?? []);
  const records = {
    save: recordsSave,
    find: recordsFind,
    create: (row: Partial<ArbitrationRecord>) => row,
  } as unknown as Repository<ArbitrationRecord>;

  const getPacket = jest.fn().mockResolvedValue(options.packet ?? buildPacket());
  const disputeService = { getPacket } as unknown as DisputeService;

  const buildUserPrompt = jest.fn().mockReturnValue('user prompt');
  const promptBuilder = {
    systemPrompt: 'system prompt',
    buildUserPrompt,
  } as unknown as ArbitrationPromptBuilder;

  const evaluate = jest.fn().mockReturnValue(options.result ?? buildResult());
  const providerFailure = jest.fn().mockReturnValue(
    buildResult({
      status: ArbitrationStatus.NEEDS_HUMAN,
      outcome: null,
      confidence: 0,
      abstentionReason: AbstentionReason.PROVIDER_ERROR,
    }),
  );
  const recommendationEngine = { evaluate, providerFailure } as unknown as RecommendationEngine;

  const configService = {
    getOrThrow: jest.fn().mockReturnValue(CONFIDENCE_THRESHOLD),
  } as unknown as ConfigService;

  const incrementArbitrationAbstention = jest.fn();
  const metricsService = { incrementArbitrationAbstention } as unknown as MetricsService;

  const primaryComplete = jest.fn().mockResolvedValue('{"outcome":"RELEASE_TO_SELLER"}');
  const primaryProvider = { name: 'openai', complete: primaryComplete } as unknown as LlmProvider;

  const fallbackComplete = jest.fn().mockResolvedValue('{"outcome":"REFUND_TO_BUYER"}');
  const fallbackProvider = { name: 'anthropic', complete: fallbackComplete } as unknown as LlmProvider;

  const service = new ArbitrationService(
    records,
    disputeService,
    promptBuilder,
    recommendationEngine,
    configService,
    metricsService,
    primaryProvider,
    fallbackProvider,
  );

  return {
    service,
    getPacket,
    recordsSave,
    recordsFind,
    evaluate,
    providerFailure,
    primaryComplete,
    fallbackComplete,
    buildUserPrompt,
    incrementArbitrationAbstention,
  };
}

describe('ArbitrationService.recommend', () => {
  it('refuses to reopen a dispute that has already been resolved', async () => {
    const harness = buildHarness({
      packet: buildPacket({
        dispute: { id: DISPUTE_ID, resolvedOutcome: 'RELEASE_TO_SELLER' },
      } as unknown as Partial<DisputePacketResponse>),
    });

    await expect(harness.service.recommend(DISPUTE_ID, arbiter)).rejects.toBeInstanceOf(
      DisputeAlreadyResolvedError,
    );
    expect(harness.primaryComplete).not.toHaveBeenCalled();
    expect(harness.recordsSave).not.toHaveBeenCalled();
  });

  it('asks the primary provider first and records which one answered', async () => {
    const harness = buildHarness();

    const record = await harness.service.recommend(DISPUTE_ID, arbiter);

    expect(harness.primaryComplete).toHaveBeenCalledWith({
      systemPrompt: 'system prompt',
      userPrompt: 'user prompt',
    });
    expect(harness.fallbackComplete).not.toHaveBeenCalled();
    expect(record.provider).toBe('openai');
  });

  it('falls back to the secondary provider when the primary fails', async () => {
    const harness = buildHarness();
    harness.primaryComplete.mockRejectedValue(new Error('rate limited'));

    const record = await harness.service.recommend(DISPUTE_ID, arbiter);

    expect(harness.fallbackComplete).toHaveBeenCalledTimes(1);
    expect(record.provider).toBe('anthropic');
  });

  it('escalates to a human when both providers fail', async () => {
    const harness = buildHarness();
    harness.primaryComplete.mockRejectedValue(new Error('down'));
    harness.fallbackComplete.mockRejectedValue(new Error('also down'));

    const record = await harness.service.recommend(DISPUTE_ID, arbiter);

    expect(harness.providerFailure).toHaveBeenCalledTimes(1);
    expect(harness.evaluate).not.toHaveBeenCalled();
    expect(record.status).toBe(ArbitrationStatus.NEEDS_HUMAN);
    expect(record.provider).toBe('openai+anthropic');
    expect(record.rawResponse).toBe('');
  });

  it('passes the configured confidence threshold to the engine', async () => {
    const harness = buildHarness();

    await harness.service.recommend(DISPUTE_ID, arbiter);

    expect(harness.evaluate).toHaveBeenCalledWith(
      '{"outcome":"RELEASE_TO_SELLER"}',
      expect.objectContaining({ confidenceThreshold: CONFIDENCE_THRESHOLD }),
    );
  });

  it('tells the engine when no evidence carries an integrity flag', async () => {
    const harness = buildHarness({
      packet: buildPacket({ buyerEvidence: [buildEvidence([])] }),
    });

    await harness.service.recommend(DISPUTE_ID, arbiter);

    expect(harness.evaluate).toHaveBeenCalledWith(
      expect.any(String) as string,
      expect.objectContaining({ hasUnresolvedIntegrityFlags: false }),
    );
  });

  it('tells the engine when creation evidence carries an integrity flag', async () => {
    const harness = buildHarness({
      packet: buildPacket({
        creationEvidence: [buildEvidence(['DUPLICATE_CONTENT'])],
      }),
    });

    await harness.service.recommend(DISPUTE_ID, arbiter);

    expect(harness.evaluate).toHaveBeenCalledWith(
      expect.any(String) as string,
      expect.objectContaining({ hasUnresolvedIntegrityFlags: true }),
    );
  });

  it('tells the engine when seller evidence carries an integrity flag', async () => {
    const harness = buildHarness({
      packet: buildPacket({
        sellerEvidence: [buildEvidence(['TIMESTAMP_MISMATCH'])],
      }),
    });

    await harness.service.recommend(DISPUTE_ID, arbiter);

    expect(harness.evaluate).toHaveBeenCalledWith(
      expect.any(String) as string,
      expect.objectContaining({ hasUnresolvedIntegrityFlags: true }),
    );
  });

  it('counts an abstention when the engine escalates to a human', async () => {
    const harness = buildHarness({
      result: buildResult({
        status: ArbitrationStatus.NEEDS_HUMAN,
        abstentionReason: AbstentionReason.LOW_CONFIDENCE,
      }),
    });

    await harness.service.recommend(DISPUTE_ID, arbiter);

    expect(harness.incrementArbitrationAbstention).toHaveBeenCalledTimes(1);
  });

  it('does not count an abstention for a confident recommendation', async () => {
    const harness = buildHarness();

    await harness.service.recommend(DISPUTE_ID, arbiter);

    expect(harness.incrementArbitrationAbstention).not.toHaveBeenCalled();
  });

  it('persists the full recommendation with its raw provider response', async () => {
    const harness = buildHarness();

    const record = await harness.service.recommend(DISPUTE_ID, arbiter);

    expect(harness.recordsSave).toHaveBeenCalledWith(
      expect.objectContaining({
        disputeId: DISPUTE_ID,
        status: ArbitrationStatus.RECOMMENDED,
        outcome: 'RELEASE_TO_SELLER',
        confidence: 0.9,
        rationale: 'The delivery evidence is consistent.',
        citedEvidenceIds: ['item-1'],
        rawResponse: '{"outcome":"RELEASE_TO_SELLER"}',
      }),
    );
    expect(record.id).toBe('record-1');
  });
});

describe('ArbitrationService.listForDispute', () => {
  it('returns the recommendations newest first', async () => {
    const harness = buildHarness();

    await harness.service.listForDispute(DISPUTE_ID);

    expect(harness.recordsFind).toHaveBeenCalledWith({
      where: { disputeId: DISPUTE_ID },
      order: { createdAt: 'DESC' },
    });
  });
});
