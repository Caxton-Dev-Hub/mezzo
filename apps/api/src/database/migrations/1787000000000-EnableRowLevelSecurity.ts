import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = [
  'migrations',
  'users',
  'refresh_tokens',
  'password_reset_tokens',
  'email_verification_codes',
  'invites',
  'kyc_verifications',
  'kyc_events',
  'escrows',
  'escrow_parties',
  'escrow_terms',
  'escrow_events',
  'evidence_items',
  'evidence_flags',
  'ledger_accounts',
  'ledger_entries',
  'ledger_postings',
  'payment_intents',
  'payment_webhook_events',
  'payouts',
  'disputes',
  'dispute_events',
  'arbitration_records',
  'chat_messages',
  'chat_reads',
  'notifications',
  'audit_events',
  'platform_flags',
  'waitlist_signups',
  'whatsapp_accounts',
  'whatsapp_link_codes',
];

export class EnableRowLevelSecurity1787000000000 implements MigrationInterface {
  name = 'EnableRowLevelSecurity1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE "public"."${table}" DISABLE ROW LEVEL SECURITY`);
    }
  }
}
