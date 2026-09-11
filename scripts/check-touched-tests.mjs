#!/usr/bin/env node
// Heuristic diff check: a feature module's logic files changed without its
// tests or its README changing in the same commit/PR. See CONTRIBUTING.md
// ("What has to be true before you open a PR") for the policy this enforces.
import { execSync } from 'node:child_process';

const API_MODULES = [
  'admin',
  'arbitration',
  'auth',
  'chat',
  'disputes',
  'escrow',
  'evidence',
  'kyc',
  'ledger',
  'notifications',
  'payments',
  'stellar',
  'users',
  'whatsapp',
];

const NON_LOGIC_PATTERN = /\/(dto|entities|errors)\/|\.module\.ts$/;

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function getChangedFiles() {
  const staged = process.argv.includes('--staged');
  const baseArgIndex = process.argv.indexOf('--base');
  const base = baseArgIndex !== -1 ? process.argv[baseArgIndex + 1] : null;

  if (staged) {
    const out = sh('git diff --cached --name-only --diff-filter=ACMR');
    return out ? out.split('\n') : [];
  }

  if (base) {
    let mergeBase;
    try {
      mergeBase = sh(`git merge-base ${base} HEAD`);
    } catch {
      mergeBase = base;
    }
    const out = sh(`git diff --name-only --diff-filter=ACMR ${mergeBase} HEAD`);
    return out ? out.split('\n') : [];
  }

  throw new Error('Usage: check-touched-tests.mjs (--staged | --base <ref>)');
}

function moduleOf(path) {
  const match = path.match(/^apps\/api\/src\/([^/]+)\//);
  return match && API_MODULES.includes(match[1]) ? match[1] : null;
}

function main() {
  const changed = getChangedFiles();
  const byModule = new Map();

  for (const file of changed) {
    const mod = moduleOf(file);
    if (!mod) continue;
    if (!byModule.has(mod)) {
      byModule.set(mod, { logic: [], spec: [], readme: false });
    }
    const entry = byModule.get(mod);
    if (file.endsWith('.spec.ts')) {
      entry.spec.push(file);
    } else if (file.endsWith('README.md')) {
      entry.readme = true;
    } else if (file.endsWith('.ts') && !NON_LOGIC_PATTERN.test(file)) {
      entry.logic.push(file);
    }
  }

  const missingTests = [];
  const missingDocs = [];

  for (const [mod, entry] of byModule) {
    if (entry.logic.length === 0) continue;
    if (entry.spec.length === 0) missingTests.push({ mod, files: entry.logic });
    if (!entry.readme) missingDocs.push({ mod, files: entry.logic });
  }

  if (missingDocs.length > 0) {
    console.warn('\n⚠ Modules with logic changes but no README.md touched:');
    for (const { mod, files } of missingDocs) {
      console.warn(`  - ${mod} (apps/api/src/${mod}/README.md) — ${files.length} file(s) changed`);
    }
    console.warn(
      '  If this changed the module\'s design (not just its implementation), update the README in this PR.\n' +
        '  If not, this is just a reminder — no action needed.\n',
    );
  }

  if (missingTests.length > 0) {
    console.error('\n✗ Modules with logic changes but no *.spec.ts touched:');
    for (const { mod, files } of missingTests) {
      console.error(`  - ${mod}:`);
      for (const f of files) console.error(`      ${f}`);
    }
    console.error(
      '\n  CLAUDE.md requires every state transition and money movement to be covered by\n' +
        '  a test. Add or update a spec in the same module, or if this change genuinely\n' +
        "  needs no new test coverage, set SKIP_TEST_TOUCH_CHECK=1 and say why in the PR.\n",
    );
    if (process.env.SKIP_TEST_TOUCH_CHECK === '1') {
      console.warn('  SKIP_TEST_TOUCH_CHECK=1 set — not failing.\n');
    } else {
      process.exitCode = 1;
    }
  }
}

main();
