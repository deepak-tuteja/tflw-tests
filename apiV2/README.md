# apiV2

The realistic e-commerce API for testFlow-tests' v2 rewrite (NestJS + TypeORM + Postgres). Not
run directly — brought up via Docker Compose from the repo root: see `../README.md` and
`../plan_v2.md`.

## Local dev (outside Docker)

Point at a Postgres instance via `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` env vars,
then:

```sh
npm run migration:run   # apply migrations
npm run seed             # deterministic, idempotent seed (admin + alice + bob, categories, products)
npm run start:dev        # nest start --watch, listens on :4001 (or $PORT)
```

## Migrations

`src/data-source.ts` is the single TypeORM DataSource used by both the CLI and the app's
`TypeOrmModule.forRootAsync`, so schema and migrations can't drift from what the app connects
with.

```sh
npm run migration:generate -- src/migrations/SomeName   # diff entities against a live DB
npm run migration:run
npm run migration:revert
```
