import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletFundingSupport1787700000000 implements MigrationInterface {
  name = 'AddWalletFundingSupport1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Make escrow_id nullable to support wallet top-ups
    await queryRunner.query(
      `ALTER TABLE "payment_intents" ALTER COLUMN "escrow_id" DROP NOT NULL`,
    );

    // Add funding_type column with default 'ESCROW' for existing records
    await queryRunner.query(
      `ALTER TABLE "payment_intents" ADD "funding_type" VARCHAR(32) NOT NULL DEFAULT 'ESCROW'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_intents" DROP COLUMN "funding_type"`);
    await queryRunner.query(
      `ALTER TABLE "payment_intents" ALTER COLUMN "escrow_id" SET NOT NULL`,
    );
  }
}
