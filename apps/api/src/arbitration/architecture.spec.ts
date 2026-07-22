import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN_TOKENS = [
  'LedgerService',
  'ledger.module',
  'ledger/ledger.service',
  'EscrowStateMachine',
  'DisputeStateMachine',
  'postTransaction',
  'escrow-state-machine',
  'dispute-state-machine',
];

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('arbitration module architecture guardrail', () => {
  it('has no code path that references the ledger or drives a state machine transition', () => {
    const arbitrationDir = join(__dirname);
    const files = listSourceFiles(arbitrationDir);
    expect(files.length).toBeGreaterThan(0);

    const offenders: { file: string; token: string }[] = [];

    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      for (const token of FORBIDDEN_TOKENS) {
        if (contents.includes(token)) {
          offenders.push({ file, token });
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('the module definition never imports LedgerModule or EscrowModule', () => {
    const moduleSource = readFileSync(join(__dirname, 'arbitration.module.ts'), 'utf8');
    expect(moduleSource).not.toMatch(/LedgerModule/);
    expect(moduleSource).not.toMatch(/EscrowModule/);
  });
});
