import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewReplies1784917863905 implements MigrationInterface {
  name = 'AddReviewReplies1784917863905';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "review_replies" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "review_id" uuid NOT NULL,
                "parent_reply_id" uuid,
                "author_user_id" uuid NOT NULL,
                "text" text NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_review_replies_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "review_replies"
            ADD CONSTRAINT "FK_review_replies_review_id" FOREIGN KEY ("review_id")
            REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "review_replies"
            ADD CONSTRAINT "FK_review_replies_parent_reply_id" FOREIGN KEY ("parent_reply_id")
            REFERENCES "review_replies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "review_replies"
            ADD CONSTRAINT "FK_review_replies_author_user_id" FOREIGN KEY ("author_user_id")
            REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "review_replies" DROP CONSTRAINT "FK_review_replies_author_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_replies" DROP CONSTRAINT "FK_review_replies_parent_reply_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_replies" DROP CONSTRAINT "FK_review_replies_review_id"`,
    );
    await queryRunner.query(`DROP TABLE "review_replies"`);
  }
}
