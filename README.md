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

Done: database schema (migration) and the Sprint 2 design document.
Not finished yet: admin API routes, seed script and automated tests.
