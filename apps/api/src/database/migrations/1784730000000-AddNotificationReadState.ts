import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationReadState1784730000000 implements MigrationInterface {
  name = 'AddNotificationReadState1784730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" ADD "is_read" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD "read_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "read_at"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "is_read"`);
  }
}
