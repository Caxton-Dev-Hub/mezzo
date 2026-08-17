import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKycDocuments1787200000000 implements MigrationInterface {
  name = 'AddKycDocuments1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."kyc_documents_document_type_enum" AS ENUM('GOVERNMENT_ID', 'SELFIE', 'PROOF_OF_ADDRESS')`,
    );
    await queryRunner.query(
      `CREATE TABLE "kyc_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "verification_id" uuid, "document_type" "public"."kyc_documents_document_type_enum" NOT NULL, "storage_key" character varying(512) NOT NULL, "content_hash" character varying(64) NOT NULL, "declared_mime" character varying(128) NOT NULL, "detected_mime" character varying(128) NOT NULL, "size_bytes" bigint NOT NULL, "width" integer, "height" integer, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_02e49877f1578e6285f84e57ab6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_83d1e7b68c12df09ba0e272c1a" ON "kyc_documents" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_61ab5e3e4616069c52c6407ed8" ON "kyc_documents" ("verification_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e0943dfe889dc4bdf21b7e6795" ON "kyc_documents" ("content_hash") `,
    );
    await queryRunner.query(
      `ALTER TABLE "kyc_documents" ADD CONSTRAINT "FK_83d1e7b68c12df09ba0e272c1a5" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "kyc_documents" ADD CONSTRAINT "FK_61ab5e3e4616069c52c6407ed81" FOREIGN KEY ("verification_id") REFERENCES "kyc_verifications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "public"."kyc_documents" ENABLE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "public"."kyc_documents" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `ALTER TABLE "kyc_documents" DROP CONSTRAINT "FK_61ab5e3e4616069c52c6407ed81"`,
    );
    await queryRunner.query(
      `ALTER TABLE "kyc_documents" DROP CONSTRAINT "FK_83d1e7b68c12df09ba0e272c1a5"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_e0943dfe889dc4bdf21b7e6795"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_61ab5e3e4616069c52c6407ed8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_83d1e7b68c12df09ba0e272c1a"`);
    await queryRunner.query(`DROP TABLE "kyc_documents"`);
    await queryRunner.query(`DROP TYPE "public"."kyc_documents_document_type_enum"`);
  }
}
