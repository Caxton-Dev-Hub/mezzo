import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleAuth1784730400000 implements MigrationInterface {
  name = 'AddGoogleAuth1784730400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "users" ADD "google_sub" character varying(255)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_google_sub" ON "users" ("google_sub")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_users_google_sub"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "google_sub"`);
    await queryRunner.query(`DELETE FROM "users" WHERE "password_hash" IS NULL`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL`);
  }
}
