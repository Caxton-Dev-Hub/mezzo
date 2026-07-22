import { Injectable } from '@nestjs/common';
import { ScriptableFakeLlmProvider } from './scriptable-fake-llm.provider';

@Injectable()
export class FakePrimaryLlmProvider extends ScriptableFakeLlmProvider {
  readonly name = 'FAKE_PRIMARY';
}
