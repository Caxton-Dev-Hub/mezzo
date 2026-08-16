import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserStatusAndChatModeration1786835900443 implements MigrationInterface {
    name = 'AddUserStatusAndChatModeration1786835900443'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('ACTIVE', 'SUSPENDED')`);
        await queryRunner.query(`ALTER TABLE "users" ADD "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE'`);
        await queryRunner.query(`ALTER TABLE "chat_messages" ADD "hidden_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "chat_messages" ADD "hidden_by" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "hidden_by"`);
        await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "hidden_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
    }

}
