import { MigrationInterface, QueryRunner } from "typeorm";

export class AddArbitration1784711031115 implements MigrationInterface {
    name = 'AddArbitration1784711031115'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."arbitration_records_status_enum" AS ENUM('RECOMMENDED', 'NEEDS_HUMAN')`);
        await queryRunner.query(`CREATE TYPE "public"."arbitration_records_outcome_enum" AS ENUM('RELEASE_TO_SELLER', 'REFUND_TO_BUYER', 'SPLIT')`);
        await queryRunner.query(`CREATE TYPE "public"."arbitration_records_abstention_reason_enum" AS ENUM('PARSE_FAILURE', 'NO_CITED_EVIDENCE', 'UNRESOLVED_INTEGRITY_FLAGS', 'CONTRADICTORY_OR_MISSING_EVIDENCE', 'LOW_CONFIDENCE', 'PROVIDER_ERROR')`);
        await queryRunner.query(`CREATE TABLE "arbitration_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "dispute_id" uuid NOT NULL, "provider" character varying(32) NOT NULL, "status" "public"."arbitration_records_status_enum" NOT NULL, "outcome" "public"."arbitration_records_outcome_enum", "split_seller_bps" integer, "confidence" real NOT NULL DEFAULT '0', "rationale" text NOT NULL DEFAULT '', "cited_evidence_ids" jsonb NOT NULL DEFAULT '[]', "contradictions" jsonb NOT NULL DEFAULT '[]', "missing_evidence" jsonb NOT NULL DEFAULT '[]', "abstention_reason" "public"."arbitration_records_abstention_reason_enum", "raw_response" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_49c2e857f1e5dc5eb5a3677fc5f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f5a62a7c63768e259a0e1d9081" ON "arbitration_records" ("dispute_id") `);
        await queryRunner.query(`ALTER TABLE "arbitration_records" ADD CONSTRAINT "FK_f5a62a7c63768e259a0e1d9081a" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "arbitration_records" DROP CONSTRAINT "FK_f5a62a7c63768e259a0e1d9081a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f5a62a7c63768e259a0e1d9081"`);
        await queryRunner.query(`DROP TABLE "arbitration_records"`);
        await queryRunner.query(`DROP TYPE "public"."arbitration_records_abstention_reason_enum"`);
        await queryRunner.query(`DROP TYPE "public"."arbitration_records_outcome_enum"`);
        await queryRunner.query(`DROP TYPE "public"."arbitration_records_status_enum"`);
    }

}
