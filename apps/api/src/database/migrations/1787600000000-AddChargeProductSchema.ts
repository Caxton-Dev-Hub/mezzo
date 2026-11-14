import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChargeProductSchema1787600000000 implements MigrationInterface {
  name = 'AddChargeProductSchema1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."users_role_enum" ADD VALUE 'STAFF'`);
    await queryRunner.query(
      `ALTER TYPE "public"."ledger_accounts_type_enum" ADD VALUE 'RENTAL_HOLDING'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."ledger_accounts_type_enum" ADD VALUE 'RENTAL_REVENUE'`,
    );

    await queryRunner.query(
      `CREATE TABLE "shops" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "location" character varying(255) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3c6aaa6607d287de99b2d6297280" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."powerbanks_status_enum" AS ENUM('AVAILABLE', 'RENTED', 'OVERDUE', 'UNRETURNED', 'LOST', 'MAINTENANCE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "powerbanks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shop_id" uuid NOT NULL, "number" character varying(50) NOT NULL, "status" "public"."powerbanks_status_enum" NOT NULL, "replacement_price_amount" bigint NOT NULL, "replacement_price_currency" character varying(3) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5c7c3e9e5b3a1e2c6a8f1d2e3b4c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_powerbank_shop_number" ON "powerbanks" ("shop_id", "number")`,
    );
    await queryRunner.query(
      `ALTER TABLE "powerbanks" ADD CONSTRAINT "FK_powerbanks_shop_id" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."rentals_status_enum" AS ENUM('ACTIVE', 'RETURNED', 'OVERDUE', 'UNRETURNED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "rentals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "powerbank_id" uuid NOT NULL, "user_id" uuid NOT NULL, "shop_id" uuid NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "due_at" TIMESTAMP WITH TIME ZONE NOT NULL, "returned_at" TIMESTAMP WITH TIME ZONE, "status" "public"."rentals_status_enum" NOT NULL, "base_charge_amount" bigint NOT NULL, "base_charge_currency" character varying(3) NOT NULL, "total_charged_amount" bigint NOT NULL, "total_charged_currency" character varying(3) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2b11f5d6e3e6c2d4f1a8c9b0e1f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rentals_powerbank_id" ON "rentals" ("powerbank_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_rentals_user_id" ON "rentals" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_rentals_shop_id" ON "rentals" ("shop_id")`);
    await queryRunner.query(
      `ALTER TABLE "rentals" ADD CONSTRAINT "FK_rentals_powerbank_id" FOREIGN KEY ("powerbank_id") REFERENCES "powerbanks"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rentals" ADD CONSTRAINT "FK_rentals_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rentals" ADD CONSTRAINT "FK_rentals_shop_id" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."rental_charges_charge_type_enum" AS ENUM('BASE', 'OVERAGE', 'REPLACEMENT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "rental_charges" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "rental_id" uuid NOT NULL, "charge_type" "public"."rental_charges_charge_type_enum" NOT NULL, "amount" bigint NOT NULL, "currency" character varying(3) NOT NULL, "charged_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ledger_posting_id" uuid, "reason" character varying(500), CONSTRAINT "PK_3d4e5f6a7b8c9d0e1f2a3b4c5d6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rental_charges_rental_id" ON "rental_charges" ("rental_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "rental_charges" ADD CONSTRAINT "FK_rental_charges_rental_id" FOREIGN KEY ("rental_id") REFERENCES "rentals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rental_charges" ADD CONSTRAINT "FK_rental_charges_ledger_posting_id" FOREIGN KEY ("ledger_posting_id") REFERENCES "ledger_postings"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."verification_submissions_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "verification_submissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "full_name" character varying(255) NOT NULL, "phone_number" character varying(32) NOT NULL, "photo_storage_key" text NOT NULL, "status" "public"."verification_submissions_status_enum" NOT NULL, "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL, "reviewed_at" TIMESTAMP WITH TIME ZONE, "reviewed_by" uuid, "review_notes" text, CONSTRAINT "PK_4e5f6a7b8c9d0e1f2a3b4c5d6e7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_verification_submissions_user_id" ON "verification_submissions" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_submissions" ADD CONSTRAINT "FK_verification_submissions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_submissions" ADD CONSTRAINT "FK_verification_submissions_reviewed_by" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "staff_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "shop_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5f6a7b8c9d0e1f2a3b4c5d6e7f8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_staff_assignment_user_shop" ON "staff_assignments" ("user_id", "shop_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_assignments" ADD CONSTRAINT "FK_staff_assignments_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_assignments" ADD CONSTRAINT "FK_staff_assignments_shop_id" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "accessories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shop_id" uuid NOT NULL, "name" character varying(255) NOT NULL, "price_amount" bigint NOT NULL, "price_currency" character varying(3) NOT NULL, "stock_level" int NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6f7a8b9c0d1e2f3a4b5c6d7e8f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_accessories_shop_id" ON "accessories" ("shop_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "accessories" ADD CONSTRAINT "FK_accessories_shop_id" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "accessory_sales" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "accessory_id" uuid NOT NULL, "shop_id" uuid NOT NULL, "sold_by" uuid NOT NULL, "quantity" int NOT NULL, "total_amount" bigint NOT NULL, "total_currency" character varying(3) NOT NULL, "sold_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_7f8a9b0c1d2e3f4a5b6c7d8e9f0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_accessory_sales_accessory_id" ON "accessory_sales" ("accessory_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_accessory_sales_shop_id" ON "accessory_sales" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_accessory_sales_sold_by" ON "accessory_sales" ("sold_by")`,
    );
    await queryRunner.query(
      `ALTER TABLE "accessory_sales" ADD CONSTRAINT "FK_accessory_sales_accessory_id" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accessory_sales" ADD CONSTRAINT "FK_accessory_sales_shop_id" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accessory_sales" ADD CONSTRAINT "FK_accessory_sales_sold_by" FOREIGN KEY ("sold_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."outstanding_balances_reason_enum" AS ENUM('RENTAL_OVERAGE', 'REPLACEMENT_CHARGE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "outstanding_balances" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "amount" bigint NOT NULL, "currency" character varying(3) NOT NULL, "reason" "public"."outstanding_balances_reason_enum" NOT NULL, "rental_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "cleared_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_8f9a0b1c2d3e4f5a6b7c8d9e0f1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_outstanding_balances_user_id" ON "outstanding_balances" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_outstanding_balances_rental_id" ON "outstanding_balances" ("rental_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "outstanding_balances" ADD CONSTRAINT "FK_outstanding_balances_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "outstanding_balances" ADD CONSTRAINT "FK_outstanding_balances_rental_id" FOREIGN KEY ("rental_id") REFERENCES "rentals"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "outstanding_balances" DROP CONSTRAINT "FK_outstanding_balances_rental_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outstanding_balances" DROP CONSTRAINT "FK_outstanding_balances_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_outstanding_balances_rental_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_outstanding_balances_user_id"`);
    await queryRunner.query(`DROP TABLE "outstanding_balances"`);
    await queryRunner.query(`DROP TYPE "public"."outstanding_balances_reason_enum"`);

    await queryRunner.query(
      `ALTER TABLE "accessory_sales" DROP CONSTRAINT "FK_accessory_sales_sold_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accessory_sales" DROP CONSTRAINT "FK_accessory_sales_shop_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accessory_sales" DROP CONSTRAINT "FK_accessory_sales_accessory_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_accessory_sales_sold_by"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_accessory_sales_shop_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_accessory_sales_accessory_id"`);
    await queryRunner.query(`DROP TABLE "accessory_sales"`);

    await queryRunner.query(`ALTER TABLE "accessories" DROP CONSTRAINT "FK_accessories_shop_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_accessories_shop_id"`);
    await queryRunner.query(`DROP TABLE "accessories"`);

    await queryRunner.query(
      `ALTER TABLE "staff_assignments" DROP CONSTRAINT "FK_staff_assignments_shop_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_assignments" DROP CONSTRAINT "FK_staff_assignments_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_staff_assignment_user_shop"`);
    await queryRunner.query(`DROP TABLE "staff_assignments"`);

    await queryRunner.query(
      `ALTER TABLE "verification_submissions" DROP CONSTRAINT "FK_verification_submissions_reviewed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_submissions" DROP CONSTRAINT "FK_verification_submissions_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_verification_submissions_user_id"`);
    await queryRunner.query(`DROP TABLE "verification_submissions"`);
    await queryRunner.query(`DROP TYPE "public"."verification_submissions_status_enum"`);

    await queryRunner.query(
      `ALTER TABLE "rental_charges" DROP CONSTRAINT "FK_rental_charges_ledger_posting_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rental_charges" DROP CONSTRAINT "FK_rental_charges_rental_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_rental_charges_rental_id"`);
    await queryRunner.query(`DROP TABLE "rental_charges"`);
    await queryRunner.query(`DROP TYPE "public"."rental_charges_charge_type_enum"`);

    await queryRunner.query(`ALTER TABLE "rentals" DROP CONSTRAINT "FK_rentals_shop_id"`);
    await queryRunner.query(`ALTER TABLE "rentals" DROP CONSTRAINT "FK_rentals_user_id"`);
    await queryRunner.query(`ALTER TABLE "rentals" DROP CONSTRAINT "FK_rentals_powerbank_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_rentals_shop_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_rentals_user_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_rentals_powerbank_id"`);
    await queryRunner.query(`DROP TABLE "rentals"`);
    await queryRunner.query(`DROP TYPE "public"."rentals_status_enum"`);

    await queryRunner.query(`ALTER TABLE "powerbanks" DROP CONSTRAINT "FK_powerbanks_shop_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_powerbank_shop_number"`);
    await queryRunner.query(`DROP TABLE "powerbanks"`);
    await queryRunner.query(`DROP TYPE "public"."powerbanks_status_enum"`);

    await queryRunner.query(`DROP TABLE "shops"`);
  }
}
