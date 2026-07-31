import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProfiles1784730300000 implements MigrationInterface {
  name = 'AddUserProfiles1784730300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "business_name" character varying(80)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "bio" character varying(280)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "location" character varying(80)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "avatar_key" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_key"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "location"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "bio"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "business_name"`);
  }
}
