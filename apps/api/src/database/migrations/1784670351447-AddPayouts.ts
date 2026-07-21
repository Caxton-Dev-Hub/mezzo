import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPayouts1784670351447 implements MigrationInterface {
    name = 'AddPayouts1784670351447'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."payouts_status_enum" AS ENUM('PENDING', 'CONFIRMED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "payouts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "seller_id" uuid NOT NULL, "amount" bigint NOT NULL, "currency" character varying(3) NOT NULL, "bank_account_number" character varying(32) NOT NULL, "bank_code" character varying(32) NOT NULL, "provider" character varying(32) NOT NULL, "provider_reference" character varying(128) NOT NULL, "idempotency_key" character varying(128) NOT NULL, "status" "public"."payouts_status_enum" NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_76855dc4f0a6c18c72eea302e87" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_bf2b4f678282ddffabfd294757" ON "payouts" ("seller_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e121e548da5123eeeb201abcea" ON "payouts" ("provider_reference") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3f8601ef2a094568dcf22954ee" ON "payouts" ("idempotency_key") `);
        await queryRunner.query(`ALTER TABLE "payouts" ADD CONSTRAINT "FK_bf2b4f678282ddffabfd2947573" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payouts" DROP CONSTRAINT "FK_bf2b4f678282ddffabfd2947573"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3f8601ef2a094568dcf22954ee"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e121e548da5123eeeb201abcea"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bf2b4f678282ddffabfd294757"`);
        await queryRunner.query(`DROP TABLE "payouts"`);
        await queryRunner.query(`DROP TYPE "public"."payouts_status_enum"`);
    }

}
