import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStellarRail1787400000000 implements MigrationInterface {
  name = 'AddStellarRail1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "stellar_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "network" character varying(16) NOT NULL, "account_id" character varying(56) NOT NULL, "linked_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_stellar_accounts_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_stellar_accounts_user_network" ON "stellar_accounts" ("user_id", "network")`,
    );
    await queryRunner.query(
      `ALTER TABLE "stellar_accounts" ADD CONSTRAINT "FK_stellar_accounts_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "public"."stellar_accounts" ENABLE ROW LEVEL SECURITY`);

    await queryRunner.query(
      `CREATE TABLE "stellar_escrows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "escrow_id" uuid NOT NULL, "network" character varying(16) NOT NULL, "deposit_account_id" character varying(56) NOT NULL, "memo" character varying(28) NOT NULL, "asset_code" character varying(12) NOT NULL, "asset_issuer" character varying(56) NOT NULL, "expected_amount" bigint NOT NULL, "expected_currency" character varying(8) NOT NULL, "status" character varying(24) NOT NULL DEFAULT 'AWAITING_DEPOSIT', "funding_transaction_hash" character varying(64), "settlement_transaction_hash" character varying(64), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_stellar_escrows_escrow_id" UNIQUE ("escrow_id"), CONSTRAINT "PK_stellar_escrows_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_stellar_escrows_funding_tx" ON "stellar_escrows" ("funding_transaction_hash") WHERE "funding_transaction_hash" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "stellar_escrows" ADD CONSTRAINT "FK_stellar_escrows_escrow_id" FOREIGN KEY ("escrow_id") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "public"."stellar_escrows" ENABLE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "public"."stellar_escrows" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `ALTER TABLE "stellar_escrows" DROP CONSTRAINT "FK_stellar_escrows_escrow_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_stellar_escrows_funding_tx"`);
    await queryRunner.query(`DROP TABLE "stellar_escrows"`);

    await queryRunner.query(`ALTER TABLE "public"."stellar_accounts" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `ALTER TABLE "stellar_accounts" DROP CONSTRAINT "FK_stellar_accounts_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_stellar_accounts_user_network"`);
    await queryRunner.query(`DROP TABLE "stellar_accounts"`);
  }
}
