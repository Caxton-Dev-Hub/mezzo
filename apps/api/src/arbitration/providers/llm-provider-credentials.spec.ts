import { ConfigService } from '@nestjs/config';
import { AnthropicLlmProvider } from './anthropic-llm.provider';
import { OpenAiLlmProvider } from './openai-llm.provider';

function configWith(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string): unknown => values[key],
    getOrThrow: (key: string): unknown => {
      if (!(key in values)) {
        throw new Error(`missing config key ${key}`);
      }
      return values[key];
    },
  } as unknown as ConfigService;
}

describe('LLM provider credentials', () => {
  it('constructs the OpenAI provider when the key is blank rather than absent', () => {
    const configService = configWith({ OPENAI_API_KEY: '', OPENAI_MODEL: 'gpt-4o-mini' });

    expect(() => new OpenAiLlmProvider(configService)).not.toThrow();
  });

  it('constructs the Anthropic provider when the key is blank rather than absent', () => {
    const configService = configWith({ ANTHROPIC_API_KEY: '', ANTHROPIC_MODEL: 'claude-sonnet-5' });

    expect(() => new AnthropicLlmProvider(configService)).not.toThrow();
  });
});
