import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsapp1786800000000 implements MigrationInterface {
  name = 'AddWhatsapp1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "whatsapp_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "phone_number" character varying(32) NOT NULL, "verified_at" TIMESTAMP WITH TIME ZONE NOT NULL, "pin_hash" text, "pin_failed_attempts" integer NOT NULL DEFAULT 0, "pin_locked_until" TIMESTAMP WITH TIME ZONE, "notifications_opted_out_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_whatsapp_accounts" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_whatsapp_accounts_user_id" ON "whatsapp_accounts" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_whatsapp_accounts_phone_number" ON "whatsapp_accounts" ("phone_number")`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "FK_whatsapp_accounts_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "whatsapp_link_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "phone_number" character varying(32) NOT NULL, "code_hash" text NOT NULL, "attempts" integer NOT NULL DEFAULT 0, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_whatsapp_link_codes" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_whatsapp_link_codes_user_id" ON "whatsapp_link_codes" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_whatsapp_link_codes_phone_number" ON "whatsapp_link_codes" ("phone_number")`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_link_codes" ADD CONSTRAINT "FK_whatsapp_link_codes_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_link_codes" DROP CONSTRAINT "FK_whatsapp_link_codes_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_whatsapp_link_codes_phone_number"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_whatsapp_link_codes_user_id"`);
    await queryRunner.query(`DROP TABLE "whatsapp_link_codes"`);

    await queryRunner.query(
      `ALTER TABLE "whatsapp_accounts" DROP CONSTRAINT "FK_whatsapp_accounts_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_whatsapp_accounts_phone_number"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_whatsapp_accounts_user_id"`);
    await queryRunner.query(`DROP TABLE "whatsapp_accounts"`);
  }
}
