import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCoupons1783772461165 implements MigrationInterface {
    name = 'AddCoupons1783772461165'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."coupons_type_enum" AS ENUM('percent', 'fixed')`);
        await queryRunner.query(`CREATE TABLE "coupons" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "type" "public"."coupons_type_enum" NOT NULL, "value" numeric(10,2) NOT NULL, "expires_at" TIMESTAMP NOT NULL, "min_order_amount" numeric(10,2) NOT NULL, "usage_limit" integer NOT NULL, "used_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_coupons_code" UNIQUE ("code"), CONSTRAINT "PK_coupons_id" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "coupons"`);
        await queryRunner.query(`DROP TYPE "public"."coupons_type_enum"`);
    }

}
