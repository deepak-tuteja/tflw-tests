import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderCoupon1783772463165 implements MigrationInterface {
    name = 'AddOrderCoupon1783772463165'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ADD "coupon_code" character varying`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "discount_amount" numeric(10,2)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "discount_amount"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "coupon_code"`);
    }

}
