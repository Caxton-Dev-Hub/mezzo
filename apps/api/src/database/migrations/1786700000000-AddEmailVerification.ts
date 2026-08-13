import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerification1786700000000 implements MigrationInterface {
  name = 'AddEmailVerification1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "email_verified_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `UPDATE "users" SET "email_verified_at" = "created_at" WHERE "google_sub" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "email_verification_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "code_hash" text NOT NULL, "attempts" integer NOT NULL DEFAULT 0, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_email_verification_codes" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_email_verification_codes_user_id" ON "email_verification_codes" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_verification_codes" ADD CONSTRAINT "FK_email_verification_codes_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_verification_codes" DROP CONSTRAINT "FK_email_verification_codes_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_email_verification_codes_user_id"`);
    await queryRunner.query(`DROP TABLE "email_verification_codes"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_verified_at"`);
  }
}
