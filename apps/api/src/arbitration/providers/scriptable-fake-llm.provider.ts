import { LlmCompletionRequest, LlmProvider } from './llm-provider.interface';

type ScriptedResult = { text: string } | { error: Error };

const DEFAULT_RESPONSE = JSON.stringify({
  recommendedOutcome: 'RELEASE_TO_SELLER',
  confidence: 0.95,
  rationale: 'Default fake response: no script queued.',
  citedEvidenceIds: [],
  contradictions: [],
  missingEvidence: [],
});

export abstract class ScriptableFakeLlmProvider implements LlmProvider {
  abstract readonly name: string;
  private queue: ScriptedResult[] = [];

  enqueueResponse(text: string): void {
    this.queue.push({ text });
  }

  enqueueError(error: Error): void {
    this.queue.push({ error });
  }

  reset(): void {
    this.queue = [];
  }

  complete(_request: LlmCompletionRequest): Promise<string> {
    const next = this.queue.shift();
    if (!next) {
      return Promise.resolve(DEFAULT_RESPONSE);
    }
    if ('error' in next) {
      return Promise.reject(next.error);
    }
    return Promise.resolve(next.text);
  }
}
