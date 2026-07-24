import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderWebhookUrl1784921878708 implements MigrationInterface {
  name = 'AddOrderWebhookUrl1784921878708';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "webhook_url" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "webhook_url"`);
  }
}
