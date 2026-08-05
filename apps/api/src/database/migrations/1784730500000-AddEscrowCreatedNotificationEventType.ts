import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEscrowCreatedNotificationEventType1784730500000 implements MigrationInterface {
  name = 'AddEscrowCreatedNotificationEventType1784730500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_event_type_enum" RENAME TO "notifications_event_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_event_type_enum" AS ENUM('ESCROW_CREATED', 'INVITED', 'AGREED', 'FUNDED', 'SHIPPED', 'DELIVERED', 'INSPECTION_ENDING_SOON', 'RELEASED', 'DISPUTED', 'RESOLVED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "event_type" TYPE "public"."notifications_event_type_enum" USING "event_type"::"text"::"public"."notifications_event_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notifications_event_type_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_event_type_enum" RENAME TO "notifications_event_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_event_type_enum" AS ENUM('INVITED', 'AGREED', 'FUNDED', 'SHIPPED', 'DELIVERED', 'INSPECTION_ENDING_SOON', 'RELEASED', 'DISPUTED', 'RESOLVED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "event_type" TYPE "public"."notifications_event_type_enum" USING "event_type"::"text"::"public"."notifications_event_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notifications_event_type_enum_old"`);
  }
}
