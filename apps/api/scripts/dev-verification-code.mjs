#!/usr/bin/env node
// Dev helper: recovers the pending e-mail verification code for an account by
// brute-forcing its SHA-256 hash, so a local signup can be completed without a
// real mailbox. Six digits is a 10^6 search — instant, and only possible here
// because the code is short and low-entropy by design.
//
//   set -a; . apps/api/.env; set +a
//   node scripts/dev-verification-code.mjs <email>
//   node scripts/dev-verification-code.mjs --pending
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const DB = process.env.DATABASE_URL;
if (!DB) {
  console.error('DATABASE_URL is not set. Run:  set -a; . apps/api/.env; set +a');
  process.exit(1);
}

const query = (sql) =>
  execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));

const target = process.argv[2];

if (!target || target === '--pending') {
  const rows = query(`
    SELECT u.email,
           u.email_verified_at IS NOT NULL,
           c.expires_at > now(),
           c.used_at IS NOT NULL
      FROM email_verification_codes c
      JOIN users u ON u.id = c.user_id
     ORDER BY c.created_at DESC
     LIMIT 20`);
  console.log('email\tverified\tcode_live\tcode_used');
  for (const [email, verified, live, used] of rows) {
    console.log(`${email}\t${verified === 't'}\t${live === 't'}\t${used === 't'}`);
  }
  console.log('\nPass an email to recover its code.');
  process.exit(0);
}

const rows = query(`
  SELECT c.code_hash,
         u.email_verified_at IS NOT NULL,
         c.expires_at > now(),
         c.used_at IS NOT NULL
    FROM email_verification_codes c
    JOIN users u ON u.id = c.user_id
   WHERE lower(u.email) = lower('${target.replace(/'/g, "''")}')`);

if (rows.length === 0) {
  console.error(`No verification code on record for ${target}.`);
  console.error('Either the account does not exist, or it never had a code issued.');
  process.exit(1);
}

const [hash, verified, live, used] = rows[0];

if (verified === 't') {
  console.log(`${target} is already verified — log in with the password, no code needed.`);
}
if (used === 't') {
  console.log('Warning: this code is already marked used. Request a new one from the app.');
}
if (live !== 't') {
  console.log('Warning: this code has expired. Use "Resend code" in the app, then re-run this.');
}

for (let n = 0; n < 1_000_000; n += 1) {
  const code = String(n).padStart(6, '0');
  if (createHash('sha256').update(code).digest('hex') === hash) {
    console.log(`\nVerification code for ${target}:  ${code}`);
    process.exit(0);
  }
}

console.error('\nNo six-digit code matches that hash.');
process.exit(1);
