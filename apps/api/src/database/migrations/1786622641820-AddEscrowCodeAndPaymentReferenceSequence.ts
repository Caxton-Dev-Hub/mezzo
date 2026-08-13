import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEscrowCodeAndPaymentReferenceSequence1786622641820 implements MigrationInterface {
  name = 'AddEscrowCodeAndPaymentReferenceSequence1786622641820';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE "escrow_code_seq"`);
    await queryRunner.query(`CREATE SEQUENCE "payment_reference_seq"`);

    await queryRunner.query(`ALTER TABLE "escrows" ADD "code" character varying(20)`);
    await queryRunner.query(
      `UPDATE "escrows" SET "code" = 'ESC-' || lpad(nextval('escrow_code_seq')::text, 6, '0') WHERE "code" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "escrows" ALTER COLUMN "code" SET NOT NULL`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_escrows_code" ON "escrows" ("code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_escrows_code"`);
    await queryRunner.query(`ALTER TABLE "escrows" DROP COLUMN "code"`);
    await queryRunner.query(`DROP SEQUENCE "payment_reference_seq"`);
    await queryRunner.query(`DROP SEQUENCE "escrow_code_seq"`);
  }
}
