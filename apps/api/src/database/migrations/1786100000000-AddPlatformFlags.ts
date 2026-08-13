import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPlatformFlags1786100000000 implements MigrationInterface {
    name = 'AddPlatformFlags1786100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "platform_flags" ("key" character varying(64) NOT NULL, "enabled" boolean NOT NULL, "updated_by_id" uuid, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3c9f8e7d6b5a4938271605f4e3d" PRIMARY KEY ("key"))`);
        await queryRunner.query(`ALTER TABLE "audit_events" ALTER COLUMN "entity_id" TYPE character varying(64) USING "entity_id"::text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_events" ALTER COLUMN "entity_id" TYPE uuid USING "entity_id"::uuid`);
        await queryRunner.query(`DROP TABLE "platform_flags"`);
    }

}
