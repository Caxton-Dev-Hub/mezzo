import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPasswordResetTokens1786000000000 implements MigrationInterface {
    name = 'AddPasswordResetTokens1786000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_838b3b4d4b2b1b0d4c5a6f7e8d9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9a1b2c3d4e5f60718293a4b5c6" ON "password_reset_tokens" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7c6b5a4938271605f4e3d2c1b0" ON "password_reset_tokens" ("token_hash") `);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_1f2e3d4c5b6a79808172635445a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_1f2e3d4c5b6a79808172635445a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7c6b5a4938271605f4e3d2c1b0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9a1b2c3d4e5f60718293a4b5c6"`);
        await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    }

}
