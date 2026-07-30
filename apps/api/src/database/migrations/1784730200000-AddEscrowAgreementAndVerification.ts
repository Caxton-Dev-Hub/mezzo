import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEscrowAgreementAndVerification1784730200000 implements MigrationInterface {
  name = 'AddEscrowAgreementAndVerification1784730200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "escrow_terms" ADD "requires_verification" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "escrow_terms" ADD "agreement_text" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "escrow_terms" DROP COLUMN "agreement_text"`);
    await queryRunner.query(`ALTER TABLE "escrow_terms" DROP COLUMN "requires_verification"`);
  }
}
