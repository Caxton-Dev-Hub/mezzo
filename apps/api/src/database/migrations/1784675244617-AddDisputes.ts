import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDisputes1784675244617 implements MigrationInterface {
    name = 'AddDisputes1784675244617'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."disputes_reason_code_enum" AS ENUM('NOT_RECEIVED', 'NOT_AS_DESCRIBED', 'DAMAGED', 'WRONG_ITEM', 'PARTIAL')`);
        await queryRunner.query(`CREATE TYPE "public"."disputes_state_enum" AS ENUM('OPEN', 'EVIDENCE', 'UNDER_REVIEW', 'RESOLVED')`);
        await queryRunner.query(`CREATE TYPE "public"."disputes_resolved_outcome_enum" AS ENUM('RELEASE_TO_SELLER', 'REFUND_TO_BUYER', 'SPLIT')`);
        await queryRunner.query(`CREATE TABLE "disputes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "escrow_id" uuid NOT NULL, "raised_by_user_id" uuid NOT NULL, "reason_code" "public"."disputes_reason_code_enum" NOT NULL, "statement" text NOT NULL, "state" "public"."disputes_state_enum" NOT NULL DEFAULT 'OPEN', "version" integer NOT NULL DEFAULT '1', "evidence_window_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "resolved_outcome" "public"."disputes_resolved_outcome_enum", "resolved_by_user_id" uuid, "resolved_at" TIMESTAMP WITH TIME ZONE, "resolved_seller_amount" bigint, "resolved_buyer_amount" bigint, "resolved_fee_amount" bigint, "resolved_currency" character varying(8), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c621776068b60ee72409b89a92b" UNIQUE ("escrow_id"), CONSTRAINT "REL_c621776068b60ee72409b89a92" UNIQUE ("escrow_id"), CONSTRAINT "PK_3c97580d01c1a4b0b345c42a107" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."dispute_events_from_state_enum" AS ENUM('OPEN', 'EVIDENCE', 'UNDER_REVIEW', 'RESOLVED')`);
        await queryRunner.query(`CREATE TYPE "public"."dispute_events_to_state_enum" AS ENUM('OPEN', 'EVIDENCE', 'UNDER_REVIEW', 'RESOLVED')`);
        await queryRunner.query(`CREATE TABLE "dispute_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "dispute_id" uuid NOT NULL, "actor_id" uuid, "from_state" "public"."dispute_events_from_state_enum" NOT NULL, "to_state" "public"."dispute_events_to_state_enum" NOT NULL, "reason" text, "correlation_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_791ab0a705af485ff4e976fa78c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f0240c0a2bb543b6d078d3d7e2" ON "dispute_events" ("dispute_id") `);
        await queryRunner.query(`ALTER TABLE "disputes" ADD CONSTRAINT "FK_c621776068b60ee72409b89a92b" FOREIGN KEY ("escrow_id") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_events" ADD CONSTRAINT "FK_f0240c0a2bb543b6d078d3d7e2d" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dispute_events" DROP CONSTRAINT "FK_f0240c0a2bb543b6d078d3d7e2d"`);
        await queryRunner.query(`ALTER TABLE "disputes" DROP CONSTRAINT "FK_c621776068b60ee72409b89a92b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f0240c0a2bb543b6d078d3d7e2"`);
        await queryRunner.query(`DROP TABLE "dispute_events"`);
        await queryRunner.query(`DROP TYPE "public"."dispute_events_to_state_enum"`);
        await queryRunner.query(`DROP TYPE "public"."dispute_events_from_state_enum"`);
        await queryRunner.query(`DROP TABLE "disputes"`);
        await queryRunner.query(`DROP TYPE "public"."disputes_resolved_outcome_enum"`);
        await queryRunner.query(`DROP TYPE "public"."disputes_state_enum"`);
        await queryRunner.query(`DROP TYPE "public"."disputes_reason_code_enum"`);
    }

}
