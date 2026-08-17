import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayoutAccounts1787300000000 implements MigrationInterface {
  name = 'AddPayoutAccounts1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "payout_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "bank_code" character varying(32) NOT NULL, "bank_name" character varying(128) NOT NULL, "account_number" character varying(32) NOT NULL, "account_name" character varying(128) NOT NULL, "provider" character varying(32) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_payout_accounts_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payout_accounts_user_id" ON "payout_accounts" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "payout_accounts" ADD CONSTRAINT "FK_payout_accounts_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "public"."payout_accounts" ENABLE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "public"."payout_accounts" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `ALTER TABLE "payout_accounts" DROP CONSTRAINT "FK_payout_accounts_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_payout_accounts_user_id"`);
    await queryRunner.query(`DROP TABLE "payout_accounts"`);
  }
}
