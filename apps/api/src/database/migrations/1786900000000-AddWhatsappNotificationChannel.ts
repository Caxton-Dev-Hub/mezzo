import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsappNotificationChannel1786900000000 implements MigrationInterface {
  name = 'AddWhatsappNotificationChannel1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_channel_enum" RENAME TO "notifications_channel_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_channel_enum" AS ENUM('EMAIL', 'SMS', 'WHATSAPP')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "channel" TYPE "public"."notifications_channel_enum" USING "channel"::"text"::"public"."notifications_channel_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notifications_channel_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "notifications" WHERE "channel" = 'WHATSAPP'`);
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_channel_enum" RENAME TO "notifications_channel_enum_old"`,
    );
    await queryRunner.query(`CREATE TYPE "public"."notifications_channel_enum" AS ENUM('EMAIL', 'SMS')`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "channel" TYPE "public"."notifications_channel_enum" USING "channel"::"text"::"public"."notifications_channel_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notifications_channel_enum_old"`);
  }
}
