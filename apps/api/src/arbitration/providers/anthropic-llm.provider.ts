import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LlmCompletionRequest, LlmProvider } from './llm-provider.interface';

@Injectable()
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = 'ANTHROPIC';

  private readonly client: Anthropic;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.client = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY') ?? 'not-configured',
    });
    this.model = this.configService.getOrThrow<string>('ANTHROPIC_MODEL');
  }

  async complete(request: LlmCompletionRequest): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }
}
