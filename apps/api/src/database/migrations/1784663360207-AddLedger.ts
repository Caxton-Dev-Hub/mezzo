import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLedger1784663360207 implements MigrationInterface {
    name = 'AddLedger1784663360207'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ledger_postings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "idempotency_key" character varying(256) NOT NULL, "correlation_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4cdc4ebcb3797412b9d9177df70" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6bd2b73e499bbb87115456a5a1" ON "ledger_postings" ("idempotency_key") `);
        await queryRunner.query(`CREATE TYPE "public"."ledger_accounts_type_enum" AS ENUM('USER_WALLET', 'ESCROW_HOLDING', 'PLATFORM_FEE_REVENUE', 'PROVIDER_CLEARING', 'TREASURY')`);
        await queryRunner.query(`CREATE TYPE "public"."ledger_accounts_normal_balance_enum" AS ENUM('DEBIT', 'CREDIT')`);
        await queryRunner.query(`CREATE TABLE "ledger_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ref" character varying(256) NOT NULL, "type" "public"."ledger_accounts_type_enum" NOT NULL, "currency" character varying(3) NOT NULL, "normal_balance" "public"."ledger_accounts_normal_balance_enum" NOT NULL, "cached_balance" bigint NOT NULL DEFAULT '0', "cached_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_62b34396dda564757cf123fff0e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_766cbe68824ff4cbf6608b7843" ON "ledger_accounts" ("ref") `);
        await queryRunner.query(`CREATE TYPE "public"."ledger_entries_direction_enum" AS ENUM('DEBIT', 'CREDIT')`);
        await queryRunner.query(`CREATE TABLE "ledger_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "posting_id" uuid NOT NULL, "account_id" uuid NOT NULL, "direction" "public"."ledger_entries_direction_enum" NOT NULL, "amount" bigint NOT NULL, "currency" character varying(3) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6efcb84411d3f08b08450ae75d5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b601d43adb9b8010b88e2da4c4" ON "ledger_entries" ("posting_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e4440167e470be69f9622c1cea" ON "ledger_entries" ("account_id") `);
        await queryRunner.query(`ALTER TABLE "ledger_entries" ADD CONSTRAINT "FK_b601d43adb9b8010b88e2da4c4b" FOREIGN KEY ("posting_id") REFERENCES "ledger_postings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ledger_entries" ADD CONSTRAINT "FK_e4440167e470be69f9622c1ceab" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ledger_entries" DROP CONSTRAINT "FK_e4440167e470be69f9622c1ceab"`);
        await queryRunner.query(`ALTER TABLE "ledger_entries" DROP CONSTRAINT "FK_b601d43adb9b8010b88e2da4c4b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e4440167e470be69f9622c1cea"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b601d43adb9b8010b88e2da4c4"`);
        await queryRunner.query(`DROP TABLE "ledger_entries"`);
        await queryRunner.query(`DROP TYPE "public"."ledger_entries_direction_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_766cbe68824ff4cbf6608b7843"`);
        await queryRunner.query(`DROP TABLE "ledger_accounts"`);
        await queryRunner.query(`DROP TYPE "public"."ledger_accounts_normal_balance_enum"`);
        await queryRunner.query(`DROP TYPE "public"."ledger_accounts_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6bd2b73e499bbb87115456a5a1"`);
        await queryRunner.query(`DROP TABLE "ledger_postings"`);
    }

}
