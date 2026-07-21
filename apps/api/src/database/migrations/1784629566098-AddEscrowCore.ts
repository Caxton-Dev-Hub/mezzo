import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEscrowCore1784629566098 implements MigrationInterface {
    name = 'AddEscrowCore1784629566098'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."escrows_state_enum" AS ENUM('DRAFT', 'PENDING_COUNTERPARTY', 'AGREED', 'FUNDED', 'SHIPPED', 'DELIVERED', 'RELEASED', 'DISPUTED', 'RESOLVED_RELEASE', 'RESOLVED_REFUND', 'REFUNDED', 'CANCELLED', 'EXPIRED')`);
        await queryRunner.query(`CREATE TABLE "escrows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "state" "public"."escrows_state_enum" NOT NULL DEFAULT 'DRAFT', "version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9cd10ae5b52350c3a20d124f5d3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "invites" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "escrow_id" uuid NOT NULL, "token" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "used_by_user_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_aa52e96b44a714372f4dd31a0af" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_18a9a6c85f7cc6f42ebef3b318" ON "invites" ("token") `);
        await queryRunner.query(`CREATE TABLE "escrow_terms" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "escrow_id" uuid NOT NULL, "price_amount" bigint NOT NULL, "price_currency" character varying(8) NOT NULL, "inspection_window_hours" integer NOT NULL, "delivery_method" character varying(255) NOT NULL, "item_description" text NOT NULL, "fee_bps" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_381adfc8d935864435a4730b39e" UNIQUE ("escrow_id"), CONSTRAINT "REL_381adfc8d935864435a4730b39" UNIQUE ("escrow_id"), CONSTRAINT "PK_1422835a08d26869532ac367106" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."escrow_parties_role_enum" AS ENUM('BUYER', 'SELLER')`);
        await queryRunner.query(`CREATE TABLE "escrow_parties" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "escrow_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" "public"."escrow_parties_role_enum" NOT NULL, "terms_accepted_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_005489df59d3d446c1d10ac608f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_23e5cf6a77c746a255ce92b87e" ON "escrow_parties" ("escrow_id", "role") `);
        await queryRunner.query(`CREATE TYPE "public"."escrow_events_from_state_enum" AS ENUM('DRAFT', 'PENDING_COUNTERPARTY', 'AGREED', 'FUNDED', 'SHIPPED', 'DELIVERED', 'RELEASED', 'DISPUTED', 'RESOLVED_RELEASE', 'RESOLVED_REFUND', 'REFUNDED', 'CANCELLED', 'EXPIRED')`);
        await queryRunner.query(`CREATE TYPE "public"."escrow_events_to_state_enum" AS ENUM('DRAFT', 'PENDING_COUNTERPARTY', 'AGREED', 'FUNDED', 'SHIPPED', 'DELIVERED', 'RELEASED', 'DISPUTED', 'RESOLVED_RELEASE', 'RESOLVED_REFUND', 'REFUNDED', 'CANCELLED', 'EXPIRED')`);
        await queryRunner.query(`CREATE TABLE "escrow_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "escrow_id" uuid NOT NULL, "actor_id" uuid, "from_state" "public"."escrow_events_from_state_enum" NOT NULL, "to_state" "public"."escrow_events_to_state_enum" NOT NULL, "reason" text, "correlation_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e4a1edcfed4c7f4f57bcfb7b800" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fc9ba614d2c6ec671568c4bcf4" ON "escrow_events" ("escrow_id") `);
        await queryRunner.query(`ALTER TABLE "invites" ADD CONSTRAINT "FK_04bff9bcc38d585c6445a80dedb" FOREIGN KEY ("escrow_id") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "escrow_terms" ADD CONSTRAINT "FK_381adfc8d935864435a4730b39e" FOREIGN KEY ("escrow_id") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "escrow_parties" ADD CONSTRAINT "FK_540aeb6cd44d7572605814c6720" FOREIGN KEY ("escrow_id") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "escrow_parties" ADD CONSTRAINT "FK_cc8f6eb2336ebd63e8062f91002" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "escrow_events" ADD CONSTRAINT "FK_fc9ba614d2c6ec671568c4bcf4a" FOREIGN KEY ("escrow_id") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "escrow_events" DROP CONSTRAINT "FK_fc9ba614d2c6ec671568c4bcf4a"`);
        await queryRunner.query(`ALTER TABLE "escrow_parties" DROP CONSTRAINT "FK_cc8f6eb2336ebd63e8062f91002"`);
        await queryRunner.query(`ALTER TABLE "escrow_parties" DROP CONSTRAINT "FK_540aeb6cd44d7572605814c6720"`);
        await queryRunner.query(`ALTER TABLE "escrow_terms" DROP CONSTRAINT "FK_381adfc8d935864435a4730b39e"`);
        await queryRunner.query(`ALTER TABLE "invites" DROP CONSTRAINT "FK_04bff9bcc38d585c6445a80dedb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fc9ba614d2c6ec671568c4bcf4"`);
        await queryRunner.query(`DROP TABLE "escrow_events"`);
        await queryRunner.query(`DROP TYPE "public"."escrow_events_to_state_enum"`);
        await queryRunner.query(`DROP TYPE "public"."escrow_events_from_state_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_23e5cf6a77c746a255ce92b87e"`);
        await queryRunner.query(`DROP TABLE "escrow_parties"`);
        await queryRunner.query(`DROP TYPE "public"."escrow_parties_role_enum"`);
        await queryRunner.query(`DROP TABLE "escrow_terms"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_18a9a6c85f7cc6f42ebef3b318"`);
        await queryRunner.query(`DROP TABLE "invites"`);
        await queryRunner.query(`DROP TABLE "escrows"`);
        await queryRunner.query(`DROP TYPE "public"."escrows_state_enum"`);
    }

}
