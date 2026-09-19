import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStellarSettlementAttempt1787500000000 implements MigrationInterface {
  name = 'AddStellarSettlementAttempt1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stellar_escrows" ADD "settlement_attempt_hash" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "stellar_escrows" ADD "settlement_attempt_expires_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stellar_escrows" DROP COLUMN "settlement_attempt_expires_at"`,
    );
    await queryRunner.query(`ALTER TABLE "stellar_escrows" DROP COLUMN "settlement_attempt_hash"`);
  }
}
