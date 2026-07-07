import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTokenRecords1783424701435 implements MigrationInterface {
    name = 'AddTokenRecords1783424701435'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "token_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "expires_at" TIMESTAMP NOT NULL, "revoked_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_464184b0c62eeb8d823dcf2543a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "token_records" ADD CONSTRAINT "FK_91eb80e1705565dc07e3ce512cd" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "token_records" DROP CONSTRAINT "FK_91eb80e1705565dc07e3ce512cd"`);
        await queryRunner.query(`DROP TABLE "token_records"`);
    }

}
