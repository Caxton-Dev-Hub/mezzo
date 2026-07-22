import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdminAuditAndArbitrationLink1784719147193 implements MigrationInterface {
    name = 'AddAdminAuditAndArbitrationLink1784719147193'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid, "action" character varying(64) NOT NULL, "entity_type" character varying(64) NOT NULL, "entity_id" uuid NOT NULL, "reason" text, "before_state" jsonb, "after_state" jsonb, "correlation_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_910f64d901a5c3e9878f0d4a407" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e97eb59ad6b44182dbd1570151" ON "audit_events" ("entity_type") `);
        await queryRunner.query(`CREATE INDEX "IDX_24530679b55965efb260852679" ON "audit_events" ("entity_id") `);
        await queryRunner.query(`ALTER TABLE "disputes" ADD "resolved_arbitration_record_id" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "disputes" DROP COLUMN "resolved_arbitration_record_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_24530679b55965efb260852679"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e97eb59ad6b44182dbd1570151"`);
        await queryRunner.query(`DROP TABLE "audit_events"`);
    }

}
