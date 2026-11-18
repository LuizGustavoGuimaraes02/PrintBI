# PrintBI

Business manager for small 3D-printing shops: filament spools and consumables, expenses,
catalog, customers, a manual cost calculator, quote PDFs, a production Kanban, sales and profit,
a dashboard, and a public product showcase.

> Status: **Part 0 - Foundation**. Features arrive in parts; see [Roadmap](#roadmap).

## Stack

| Layer    | Choice                                                                    |
| -------- | ------------------------------------------------------------------------- |
| Web      | React 19, Vite, TypeScript                                                |
| API      | Node 22+, Express 5, TypeScript, Mongoose 9, Zod                          |
| Database | MongoDB (Atlas in production; a replica set is required for transactions) |
| Shared   | `@printbi/shared`: Zod schemas, money math, types used by API and web     |
| Tests    | Vitest, supertest, mongodb-memory-server                                  |

## Repository layout

```
apps/
  api/                 Express API
    src/
      config/          Environment validation (fails fast on bad config)
      core/            Cross-cutting: errors, logger, database, HTTP helpers
      modules/<feature>/  routes → controller → service → model + schema
    test/              Test helpers and integration tests
  web/                 React app
packages/
  shared/              Code shared by API and web (money, schemas)
```

## Getting started

Requirements: Node 22 or newer, and a MongoDB replica set (a free MongoDB Atlas cluster works).

```bash
npm install
cp apps/api/.env.example apps/api/.env   # then set MONGO_URI
npm run dev                              # API on :3000, web on :5173
```

The web dev server proxies `/api` and `/health` to the API, so the browser talks to one origin.

### Scripts

| Command             | What it does                  |
| ------------------- | ----------------------------- |
| `npm run dev`       | API and web in watch mode     |
| `npm test`          | All tests (shared, API, web)  |
| `npm run typecheck` | TypeScript in every workspace |
| `npm run lint`      | ESLint                        |
| `npm run format`    | Prettier                      |
| `npm run build`     | Production builds             |

### Environment variables (`apps/api/.env`)

| Variable       | Description                             |
| -------------- | --------------------------------------- |
| `NODE_ENV`     | `development`, `test` or `production`   |
| `PORT`         | API port (default `3000`)               |
| `MONGO_URI`    | MongoDB connection string (replica set) |
| `CORS_ORIGINS` | Comma-separated allowed web origins     |
| `LOG_LEVEL`    | pino log level (default `info`)         |

## Design decisions

### Money in micro-units

Every amount is an integer in millionths of a unit plus a currency (`CAD 0.025` → `25000`).
Integer math is exact, sortable and aggregates with MongoDB `$sum`. Intermediate products use
`BigInt`. Rounding is half-up and happens only when an input has more than 6 decimals or when a
result is rounded to cents for totals and display. CAD and BRL are never added without an explicit
conversion rate. See [`packages/shared/src/money.ts`](packages/shared/src/money.ts).

### Errors

Services throw typed `AppError`s. One error handler turns every failure into
`{ message, code, details? }`. Validation errors list each invalid field. Malformed ids answer 404,
like missing records. Unexpected errors answer a generic 500 and are logged without being exposed.

### API health

- `GET /health`: liveness (the process is up).
- `GET /health/ready`: readiness (MongoDB is reachable); 503 otherwise.

## Testing

`npm test` runs every workspace. API integration tests start **one** in-memory MongoDB replica set
for the whole run, and each test file uses its own database on it.

The first run downloads the MongoDB binary (~600 MB). On some Windows machines `mongod` takes
about a minute to start; the test setup allows for that.

## Roadmap

0. Foundation (this part)
1. Authentication, companies, members and roles
2. Web shell, design system and settings
3. Inventory (spools and lots, stock ledger) and expenses
4. Catalog and customers · 4b public showcase · 4c seasonal showcases
5. Calculator
6. Quotes and PDF
7. Orders and Kanban, stock consumption
8. Sales and profit
9. Dashboard and reminders
10. Finish: accessibility, demo data, final docs, deploy configuration

## Image slots

Places where the business owner uploads photos or artwork. The full table (with sizes) is added as
those features are built (Parts 2 and 4b-4c).
