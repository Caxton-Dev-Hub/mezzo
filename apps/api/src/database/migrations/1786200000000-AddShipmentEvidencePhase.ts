import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShipmentEvidencePhase1786200000000 implements MigrationInterface {
  name = 'AddShipmentEvidencePhase1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."evidence_items_phase_enum" RENAME TO "evidence_items_phase_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."evidence_items_phase_enum" AS ENUM('AT_CREATION', 'AT_SHIPMENT', 'AT_DELIVERY', 'CHAT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidence_items" ALTER COLUMN "phase" TYPE "public"."evidence_items_phase_enum" USING "phase"::"text"::"public"."evidence_items_phase_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."evidence_items_phase_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."evidence_items_phase_enum" RENAME TO "evidence_items_phase_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."evidence_items_phase_enum" AS ENUM('AT_CREATION', 'AT_DELIVERY', 'CHAT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidence_items" ALTER COLUMN "phase" TYPE "public"."evidence_items_phase_enum" USING "phase"::"text"::"public"."evidence_items_phase_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."evidence_items_phase_enum_old"`);
  }
}
