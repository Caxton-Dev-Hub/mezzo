import { MigrationInterface, QueryRunner } from "typeorm";

export class AddKycTiersAndVerification1784626898352 implements MigrationInterface {
    name = 'AddKycTiersAndVerification1784626898352'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."kyc_verifications_requested_tier_enum" AS ENUM('TIER_0', 'TIER_1', 'TIER_2', 'TIER_3')`);
        await queryRunner.query(`CREATE TYPE "public"."kyc_verifications_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')`);
        await queryRunner.query(`CREATE TABLE "kyc_verifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "requested_tier" "public"."kyc_verifications_requested_tier_enum" NOT NULL, "status" "public"."kyc_verifications_status_enum" NOT NULL DEFAULT 'PENDING', "provider" character varying(32) NOT NULL, "provider_reference" character varying(128) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_57b7c6b141dd225ce5dc95d7fb0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5cfe18d7496f88a0f34e98b509" ON "kyc_verifications" ("provider_reference") `);
        await queryRunner.query(`CREATE TYPE "public"."kyc_events_type_enum" AS ENUM('SUBMITTED', 'APPROVED', 'REJECTED', 'EXPIRED')`);
        await queryRunner.query(`CREATE TYPE "public"."kyc_events_previous_tier_enum" AS ENUM('TIER_0', 'TIER_1', 'TIER_2', 'TIER_3')`);
        await queryRunner.query(`CREATE TYPE "public"."kyc_events_new_tier_enum" AS ENUM('TIER_0', 'TIER_1', 'TIER_2', 'TIER_3')`);
        await queryRunner.query(`CREATE TABLE "kyc_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "verification_id" uuid NOT NULL, "type" "public"."kyc_events_type_enum" NOT NULL, "previous_tier" "public"."kyc_events_previous_tier_enum" NOT NULL, "new_tier" "public"."kyc_events_new_tier_enum", "provider_reference" character varying(128) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ee8f016565dae1f5794ea482e74" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c0eb2af090f98a7fce3789142e" ON "kyc_events" ("user_id") `);
        await queryRunner.query(`CREATE TYPE "public"."users_kyc_tier_enum" AS ENUM('TIER_0', 'TIER_1', 'TIER_2', 'TIER_3')`);
        await queryRunner.query(`ALTER TABLE "users" ADD "kyc_tier" "public"."users_kyc_tier_enum" NOT NULL DEFAULT 'TIER_0'`);
        await queryRunner.query(`ALTER TABLE "kyc_verifications" ADD CONSTRAINT "FK_1e23c7821d740b4881f773c39aa" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "kyc_events" ADD CONSTRAINT "FK_bf35a0f9c7e389c9c210d4c0888" FOREIGN KEY ("verification_id") REFERENCES "kyc_verifications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "kyc_events" DROP CONSTRAINT "FK_bf35a0f9c7e389c9c210d4c0888"`);
        await queryRunner.query(`ALTER TABLE "kyc_verifications" DROP CONSTRAINT "FK_1e23c7821d740b4881f773c39aa"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "kyc_tier"`);
        await queryRunner.query(`DROP TYPE "public"."users_kyc_tier_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c0eb2af090f98a7fce3789142e"`);
        await queryRunner.query(`DROP TABLE "kyc_events"`);
        await queryRunner.query(`DROP TYPE "public"."kyc_events_new_tier_enum"`);
        await queryRunner.query(`DROP TYPE "public"."kyc_events_previous_tier_enum"`);
        await queryRunner.query(`DROP TYPE "public"."kyc_events_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5cfe18d7496f88a0f34e98b509"`);
        await queryRunner.query(`DROP TABLE "kyc_verifications"`);
        await queryRunner.query(`DROP TYPE "public"."kyc_verifications_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."kyc_verifications_requested_tier_enum"`);
    }

}
