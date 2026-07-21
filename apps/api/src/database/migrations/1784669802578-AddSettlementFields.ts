import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSettlementFields1784669802578 implements MigrationInterface {
    name = 'AddSettlementFields1784669802578'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "escrows" ADD "tracking_reference" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "escrows" ADD "delivered_at" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "escrows" DROP COLUMN "delivered_at"`);
        await queryRunner.query(`ALTER TABLE "escrows" DROP COLUMN "tracking_reference"`);
    }

}
