export const PRIMARY_LLM_PROVIDER = Symbol('PRIMARY_LLM_PROVIDER');
export const FALLBACK_LLM_PROVIDER = Symbol('FALLBACK_LLM_PROVIDER');

export interface LlmCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
}

export interface LlmProvider {
  readonly name: string;
  complete(request: LlmCompletionRequest): Promise<string>;
}
