import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEvidence1784634105821 implements MigrationInterface {
    name = 'AddEvidence1784634105821'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."evidence_items_phase_enum" AS ENUM('AT_CREATION', 'AT_DELIVERY')`);
        await queryRunner.query(`CREATE TABLE "evidence_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "escrow_id" uuid NOT NULL, "uploader_id" uuid NOT NULL, "phase" "public"."evidence_items_phase_enum" NOT NULL, "storage_key" character varying(512) NOT NULL, "content_hash" character varying(64) NOT NULL, "declared_mime" character varying(128) NOT NULL, "detected_mime" character varying(128) NOT NULL, "size_bytes" bigint NOT NULL, "width" integer, "height" integer, "captured_at" TIMESTAMP WITH TIME ZONE, "device_make" character varying(128), "device_model" character varying(128), "gps_latitude" double precision, "gps_longitude" double precision, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5c67144bedcbdc385c0716d8e50" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_26f89958df7f07841622034bbc" ON "evidence_items" ("escrow_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_311fe33e89d687ee8d2ea7e3b7" ON "evidence_items" ("content_hash") `);
        await queryRunner.query(`CREATE TYPE "public"."evidence_flags_type_enum" AS ENUM('DUPLICATE_CONTENT', 'MISSING_METADATA', 'TIMESTAMP_MISMATCH')`);
        await queryRunner.query(`CREATE TABLE "evidence_flags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "evidence_item_id" uuid NOT NULL, "type" "public"."evidence_flags_type_enum" NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_afb6329f85419d4163b5c8fe20e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7a1a3346ab9bd313de3291291b" ON "evidence_flags" ("evidence_item_id") `);
        await queryRunner.query(`ALTER TABLE "evidence_items" ADD CONSTRAINT "FK_26f89958df7f07841622034bbc7" FOREIGN KEY ("escrow_id") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "evidence_items" ADD CONSTRAINT "FK_d7df7975014b711252607caa4b5" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "evidence_flags" ADD CONSTRAINT "FK_7a1a3346ab9bd313de3291291b1" FOREIGN KEY ("evidence_item_id") REFERENCES "evidence_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "evidence_flags" DROP CONSTRAINT "FK_7a1a3346ab9bd313de3291291b1"`);
        await queryRunner.query(`ALTER TABLE "evidence_items" DROP CONSTRAINT "FK_d7df7975014b711252607caa4b5"`);
        await queryRunner.query(`ALTER TABLE "evidence_items" DROP CONSTRAINT "FK_26f89958df7f07841622034bbc7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7a1a3346ab9bd313de3291291b"`);
        await queryRunner.query(`DROP TABLE "evidence_flags"`);
        await queryRunner.query(`DROP TYPE "public"."evidence_flags_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_311fe33e89d687ee8d2ea7e3b7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_26f89958df7f07841622034bbc"`);
        await queryRunner.query(`DROP TABLE "evidence_items"`);
        await queryRunner.query(`DROP TYPE "public"."evidence_items_phase_enum"`);
    }

}
