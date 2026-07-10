import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReviewReply1783686063165 implements MigrationInterface {
    name = 'AddReviewReply1783686063165'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reviews" ADD "reply_text" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "reply_text"`);
    }

}
