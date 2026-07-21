import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPayments1784665103837 implements MigrationInterface {
    name = 'AddPayments1784665103837'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."payment_intents_status_enum" AS ENUM('PENDING', 'FUNDED', 'QUARANTINED')`);
        await queryRunner.query(`CREATE TABLE "payment_intents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "escrow_id" uuid NOT NULL, "buyer_id" uuid NOT NULL, "amount" bigint NOT NULL, "currency" character varying(3) NOT NULL, "provider" character varying(32) NOT NULL, "provider_reference" character varying(128) NOT NULL, "status" "public"."payment_intents_status_enum" NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cc99975b98c8001a336976fd018" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3f0cbb4c58f89cdb21afdec8c8" ON "payment_intents" ("escrow_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b77beab2e2645d298f28053236" ON "payment_intents" ("provider_reference") `);
        await queryRunner.query(`CREATE TABLE "payment_webhook_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider" character varying(32) NOT NULL, "provider_event_id" character varying(128) NOT NULL, "escrow_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_750875e71d97974be92cee813ba" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fe716618e28a78e3dc8d8cc723" ON "payment_webhook_events" ("provider", "provider_event_id") `);
        await queryRunner.query(`ALTER TABLE "payment_intents" ADD CONSTRAINT "FK_3f0cbb4c58f89cdb21afdec8c8e" FOREIGN KEY ("escrow_id") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payment_intents" ADD CONSTRAINT "FK_c54ab1a25c73eb7f960b42b2719" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payment_intents" DROP CONSTRAINT "FK_c54ab1a25c73eb7f960b42b2719"`);
        await queryRunner.query(`ALTER TABLE "payment_intents" DROP CONSTRAINT "FK_3f0cbb4c58f89cdb21afdec8c8e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fe716618e28a78e3dc8d8cc723"`);
        await queryRunner.query(`DROP TABLE "payment_webhook_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b77beab2e2645d298f28053236"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3f0cbb4c58f89cdb21afdec8c8"`);
        await queryRunner.query(`DROP TABLE "payment_intents"`);
        await queryRunner.query(`DROP TYPE "public"."payment_intents_status_enum"`);
    }

}
