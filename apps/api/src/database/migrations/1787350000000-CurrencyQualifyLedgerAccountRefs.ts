import { MigrationInterface, QueryRunner } from 'typeorm';

export class CurrencyQualifyLedgerAccountRefs1787350000000 implements MigrationInterface {
  name = 'CurrencyQualifyLedgerAccountRefs1787350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "ledger_accounts" SET "ref" = "ref" || ':' || "currency" WHERE "type" IN ('USER_WALLET', 'PLATFORM_FEE_REVENUE', 'PROVIDER_CLEARING', 'TREASURY')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "ledger_accounts" SET "ref" = left("ref", length("ref") - length("currency") - 1) WHERE "type" IN ('USER_WALLET', 'PLATFORM_FEE_REVENUE', 'PROVIDER_CLEARING', 'TREASURY') AND "ref" LIKE '%:' || "currency"`,
    );
  }
}
