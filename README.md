# E-Commerce Catalog (Sprint 2)

Catalog data foundation for the handmade and small-batch goods store.
Stack: Node.js, Express, PostgreSQL (see docs/SPRINT_1.md).
Sprint 2 design document: docs/SPRINT_2.md

## Local setup

1. Install Node.js and PostgreSQL.
2. Create the database:
   `createdb ecommerce_dev`
3. Create the tables:
   `psql -d ecommerce_dev -f backend/db/migrations/001_catalog.sql`
4. Copy `backend/.env.example` to `backend/.env` and fill in your own values.
5. Install packages from the backend folder:
   `npm install`

## Environment variables

| Name | Meaning |
|---|---|
| DATABASE_URL | PostgreSQL connection string |
| JWT_SECRET | Secret used to sign admin tokens |
| PORT | Port the server listens on |

Never commit the real `.env` file or any secrets.

## Current status

## Run the seed data and tests

Seed (creates 3 categories, 3 products, 4 SKUs and prints a demo admin token):
`npm run seed`

Tests need a separate test database, because they wipe the tables:
1. `createdb ecommerce_test`
2. `psql -d ecommerce_test -f backend/db/migrations/001_catalog.sql`
3. Set `TEST_DATABASE_URL` in `backend/.env`
4. Run `npm test`

## Current status

Implemented: database schema, admin routes (categories, products, variants, SKUs), JWT admin check, seed script and automated tests.
Not yet verified: the code was written but the test suite has not been run on a local database yet, so no test result is claimed.
