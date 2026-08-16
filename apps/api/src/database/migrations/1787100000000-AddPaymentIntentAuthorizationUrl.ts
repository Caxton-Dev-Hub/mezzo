import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentIntentAuthorizationUrl1787100000000 implements MigrationInterface {
  name = 'AddPaymentIntentAuthorizationUrl1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_intents" ADD "authorization_url" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_intents" DROP COLUMN "authorization_url"`);
  }
}
