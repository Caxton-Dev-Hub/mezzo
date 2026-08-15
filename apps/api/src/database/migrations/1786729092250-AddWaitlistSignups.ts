import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWaitlistSignups1786729092250 implements MigrationInterface {
    name = 'AddWaitlistSignups1786729092250'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "waitlist_signups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(320) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2c25d8edf518162f06c849c5fb3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6b481977b231a24ffaa69c57b8" ON "waitlist_signups" ("email") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_6b481977b231a24ffaa69c57b8"`);
        await queryRunner.query(`DROP TABLE "waitlist_signups"`);
    }

}
