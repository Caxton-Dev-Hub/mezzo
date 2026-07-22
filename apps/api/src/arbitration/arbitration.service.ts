import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArbitrationRecord } from '../database/entities/arbitration-record.entity';
import { DisputeService } from '../disputes/dispute.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { DisputePacketResponse } from '../disputes/dto/dispute-response';
import {
  FALLBACK_LLM_PROVIDER,
  LlmProvider,
  PRIMARY_LLM_PROVIDER,
} from './providers/llm-provider.interface';
import { ArbitrationPromptBuilder } from './prompt-builder';
import { RecommendationEngine, RecommendationResult } from './recommendation-engine';
import { DisputeAlreadyResolvedError } from './errors/dispute-already-resolved.error';

function hasUnresolvedIntegrityFlags(packet: DisputePacketResponse): boolean {
  return [...packet.creationEvidence, ...packet.buyerEvidence, ...packet.sellerEvidence].some(
    (item) => item.flags.length > 0,
  );
}

@Injectable()
export class ArbitrationService {
  constructor(
    @InjectRepository(ArbitrationRecord)
    private readonly records: Repository<ArbitrationRecord>,
    private readonly disputeService: DisputeService,
    private readonly promptBuilder: ArbitrationPromptBuilder,
    private readonly recommendationEngine: RecommendationEngine,
    private readonly configService: ConfigService,
    @Inject(PRIMARY_LLM_PROVIDER) private readonly primaryProvider: LlmProvider,
    @Inject(FALLBACK_LLM_PROVIDER) private readonly fallbackProvider: LlmProvider,
  ) {}

  async recommend(disputeId: string, currentUser: AuthenticatedUser): Promise<ArbitrationRecord> {
    const packet = await this.disputeService.getPacket(disputeId, currentUser);
    if (packet.dispute.resolvedOutcome !== null) {
      throw new DisputeAlreadyResolvedError();
    }

    const systemPrompt = this.promptBuilder.systemPrompt;
    const userPrompt = this.promptBuilder.buildUserPrompt(packet);

    const { rawResponseText, providerUsed } = await this.complete(systemPrompt, userPrompt);

    const confidenceThreshold = this.configService.getOrThrow<number>('ARBITRATION_CONFIDENCE_THRESHOLD');
    const result: RecommendationResult =
      rawResponseText === null
        ? this.recommendationEngine.providerFailure()
        : this.recommendationEngine.evaluate(rawResponseText, {
            hasUnresolvedIntegrityFlags: hasUnresolvedIntegrityFlags(packet),
            confidenceThreshold,
          });

    return this.records.save(
      this.records.create({
        disputeId,
        provider: providerUsed,
        status: result.status,
        outcome: result.outcome,
        splitSellerBps: result.splitSellerBps,
        confidence: result.confidence,
        rationale: result.rationale,
        citedEvidenceIds: result.citedEvidenceIds,
        contradictions: result.contradictions,
        missingEvidence: result.missingEvidence,
        abstentionReason: result.abstentionReason,
        rawResponse: rawResponseText ?? '',
      }),
    );
  }

  async listForDispute(disputeId: string): Promise<ArbitrationRecord[]> {
    return this.records.find({ where: { disputeId }, order: { createdAt: 'DESC' } });
  }

  private async complete(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<{ rawResponseText: string | null; providerUsed: string }> {
    try {
      const text = await this.primaryProvider.complete({ systemPrompt, userPrompt });
      return { rawResponseText: text, providerUsed: this.primaryProvider.name };
    } catch {
      try {
        const text = await this.fallbackProvider.complete({ systemPrompt, userPrompt });
        return { rawResponseText: text, providerUsed: this.fallbackProvider.name };
      } catch {
        return {
          rawResponseText: null,
          providerUsed: `${this.primaryProvider.name}+${this.fallbackProvider.name}`,
        };
      }
    }
  }
}
