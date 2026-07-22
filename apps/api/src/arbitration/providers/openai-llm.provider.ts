import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LlmCompletionRequest, LlmProvider } from './llm-provider.interface';

@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  readonly name = 'OPENAI';

  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') ?? 'not-configured' });
    this.model = this.configService.getOrThrow<string>('OPENAI_MODEL');
  }

  async complete(request: LlmCompletionRequest): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
    });

    return response.choices[0]?.message?.content ?? '';
  }
}
