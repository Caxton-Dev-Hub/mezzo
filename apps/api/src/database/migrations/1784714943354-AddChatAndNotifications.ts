import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChatAndNotifications1784714943354 implements MigrationInterface {
    name = 'AddChatAndNotifications1784714943354'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."notifications_event_type_enum" AS ENUM('INVITED', 'AGREED', 'FUNDED', 'SHIPPED', 'DELIVERED', 'INSPECTION_ENDING_SOON', 'RELEASED', 'DISPUTED', 'RESOLVED')`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_channel_enum" AS ENUM('EMAIL', 'SMS')`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_status_enum" AS ENUM('PENDING', 'SENT', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "escrow_id" uuid NOT NULL, "user_id" uuid NOT NULL, "event_type" "public"."notifications_event_type_enum" NOT NULL, "channel" "public"."notifications_channel_enum" NOT NULL, "status" "public"."notifications_status_enum" NOT NULL DEFAULT 'PENDING', "dedupe_key" character varying(255) NOT NULL, "sent_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1d50bc0cabbd8a288a2487ca60" ON "notifications" ("escrow_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_9a8a82462cab47c73d25f49261" ON "notifications" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_1ce34a3c9fd97cd56bcb734ca9" ON "notifications" ("dedupe_key") `);
        await queryRunner.query(`CREATE TABLE "chat_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "escrow_id" uuid NOT NULL, "sender_id" uuid NOT NULL, "body" text NOT NULL, "attachment_evidence_item_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ab3a3e530698e984d42a912895" ON "chat_messages" ("escrow_id") `);
        await queryRunner.query(`ALTER TABLE "users" ADD "phone" character varying(32)`);
        await queryRunner.query(`ALTER TYPE "public"."evidence_items_phase_enum" RENAME TO "evidence_items_phase_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."evidence_items_phase_enum" AS ENUM('AT_CREATION', 'AT_DELIVERY', 'CHAT')`);
        await queryRunner.query(`ALTER TABLE "evidence_items" ALTER COLUMN "phase" TYPE "public"."evidence_items_phase_enum" USING "phase"::"text"::"public"."evidence_items_phase_enum"`);
        await queryRunner.query(`DROP TYPE "public"."evidence_items_phase_enum_old"`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_ab3a3e530698e984d42a9128953" FOREIGN KEY ("escrow_id") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_9e5fc47ecb06d4d7b84633b1718" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_49c95ff939293a097260ec70845" FOREIGN KEY ("attachment_evidence_item_id") REFERENCES "evidence_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_49c95ff939293a097260ec70845"`);
        await queryRunner.query(`ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_9e5fc47ecb06d4d7b84633b1718"`);
        await queryRunner.query(`ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_ab3a3e530698e984d42a9128953"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`);
        await queryRunner.query(`CREATE TYPE "public"."evidence_items_phase_enum_old" AS ENUM('AT_CREATION', 'AT_DELIVERY')`);
        await queryRunner.query(`ALTER TABLE "evidence_items" ALTER COLUMN "phase" TYPE "public"."evidence_items_phase_enum_old" USING "phase"::"text"::"public"."evidence_items_phase_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."evidence_items_phase_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."evidence_items_phase_enum_old" RENAME TO "evidence_items_phase_enum"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phone"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ab3a3e530698e984d42a912895"`);
        await queryRunner.query(`DROP TABLE "chat_messages"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1ce34a3c9fd97cd56bcb734ca9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9a8a82462cab47c73d25f49261"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1d50bc0cabbd8a288a2487ca60"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_channel_enum"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_event_type_enum"`);
    }

}
