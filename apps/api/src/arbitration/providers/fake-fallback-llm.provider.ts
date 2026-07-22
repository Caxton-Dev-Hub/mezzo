import { Injectable } from '@nestjs/common';
import { ScriptableFakeLlmProvider } from './scriptable-fake-llm.provider';

@Injectable()
export class FakeFallbackLlmProvider extends ScriptableFakeLlmProvider {
  readonly name = 'FAKE_FALLBACK';
}
