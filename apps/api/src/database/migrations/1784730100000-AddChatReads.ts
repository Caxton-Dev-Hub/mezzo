import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatReads1784730100000 implements MigrationInterface {
  name = 'AddChatReads1784730100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chat_reads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "escrow_id" uuid NOT NULL, "user_id" uuid NOT NULL, "last_read_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_chat_reads_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_chat_reads_escrow_user" ON "chat_reads" ("escrow_id", "user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_reads" ADD CONSTRAINT "FK_chat_reads_escrow_id" FOREIGN KEY ("escrow_id") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_reads" ADD CONSTRAINT "FK_chat_reads_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_reads" DROP CONSTRAINT "FK_chat_reads_user_id"`);
    await queryRunner.query(`ALTER TABLE "chat_reads" DROP CONSTRAINT "FK_chat_reads_escrow_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_chat_reads_escrow_user"`);
    await queryRunner.query(`DROP TABLE "chat_reads"`);
  }
}
