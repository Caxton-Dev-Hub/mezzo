import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArbitrationRecord } from '../database/entities/arbitration-record.entity';
import { DisputeModule } from '../disputes/dispute.module';
import { ArbitrationController } from './arbitration.controller';
import { ArbitrationService } from './arbitration.service';
import { ArbitrationPromptBuilder } from './prompt-builder';
import { RecommendationEngine } from './recommendation-engine';
import {
  FALLBACK_LLM_PROVIDER,
  LlmProvider,
  PRIMARY_LLM_PROVIDER,
} from './providers/llm-provider.interface';
import { AnthropicLlmProvider } from './providers/anthropic-llm.provider';
import { OpenAiLlmProvider } from './providers/openai-llm.provider';
import { FakePrimaryLlmProvider } from './providers/fake-primary-llm.provider';
import { FakeFallbackLlmProvider } from './providers/fake-fallback-llm.provider';

@Module({
  imports: [TypeOrmModule.forFeature([ArbitrationRecord]), DisputeModule],
  controllers: [ArbitrationController],
  providers: [
    ArbitrationService,
    ArbitrationPromptBuilder,
    RecommendationEngine,
    AnthropicLlmProvider,
    OpenAiLlmProvider,
    FakePrimaryLlmProvider,
    FakeFallbackLlmProvider,
    {
      provide: PRIMARY_LLM_PROVIDER,
      inject: [ConfigService, FakePrimaryLlmProvider, AnthropicLlmProvider],
      useFactory: (
        configService: ConfigService,
        fakeProvider: FakePrimaryLlmProvider,
        anthropicProvider: AnthropicLlmProvider,
      ): LlmProvider =>
        configService.get<string>('ARBITRATION_PROVIDER') === 'live' ? anthropicProvider : fakeProvider,
    },
    {
      provide: FALLBACK_LLM_PROVIDER,
      inject: [ConfigService, FakeFallbackLlmProvider, OpenAiLlmProvider],
      useFactory: (
        configService: ConfigService,
        fakeProvider: FakeFallbackLlmProvider,
        openAiProvider: OpenAiLlmProvider,
      ): LlmProvider =>
        configService.get<string>('ARBITRATION_PROVIDER') === 'live' ? openAiProvider : fakeProvider,
    },
  ],
  exports: [ArbitrationService, FakePrimaryLlmProvider, FakeFallbackLlmProvider],
})
export class ArbitrationModule {}
