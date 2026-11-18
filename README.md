# PrintBI

Business manager for small 3D-printing shops: filament spools and consumables, expenses,
catalog, customers, a manual cost calculator, quote PDFs, a production Kanban, sales and profit,
a dashboard, and a public product showcase.

> Status: **Part 1 - Authentication and companies**. Features arrive in parts; see [Roadmap](#roadmap).

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

| Variable                   | Description                                                |
| -------------------------- | ---------------------------------------------------------- |
| `NODE_ENV`                 | `development`, `test` or `production`                      |
| `PORT`                     | API port (default `3000`)                                  |
| `MONGO_URI`                | MongoDB connection string (replica set)                    |
| `CORS_ORIGINS`             | Comma-separated allowed web origins                        |
| `LOG_LEVEL`                | pino log level (default `info`)                            |
| `WEB_URL`                  | Public web URL, used in reset and invite links             |
| `JWT_ACCESS_SECRET`        | Access-token signing secret (32+ random characters)        |
| `ACCESS_TOKEN_TTL_MINUTES` | Access-token lifetime (default 15)                         |
| `REFRESH_TOKEN_TTL_DAYS`   | Refresh-token lifetime (default 7)                         |
| `SESSION_IDLE_MINUTES`     | Inactivity limit for refreshing (default 30)               |
| `AUTH_RATE_LIMIT`          | Requests per IP per 15 minutes on auth routes (default 20) |

## Design decisions

### Money in micro-units

Every amount is an integer in millionths of a unit plus a currency (`CAD 0.025` → `25000`).
Integer math is exact, sortable and aggregates with MongoDB `$sum`. Intermediate products use
`BigInt`. Rounding is half-up and happens only when an input has more than 6 decimals or when a
result is rounded to cents for totals and display. CAD and BRL are never added without an explicit
conversion rate. See [`packages/shared/src/money.ts`](packages/shared/src/money.ts).

### Errors

Services throw typed `AppError`s. One error handler turns every failure into
`{ message, code, details? }`. Validation errors list each invalid field. Records of another
company answer 404, exactly like missing ones. Unexpected errors answer a generic 500 and are logged without being exposed.

### Authentication and sessions

- Passwords: argon2id (19 MiB, 2 iterations). At least 8 characters with a letter and a number.
  The email rule matches the reference project, Manage My Shifts.
- Sessions: a 15-minute access JWT and a 7-day refresh token, both in `httpOnly`,
  `SameSite=Strict` cookies (`Secure` in production). The refresh cookie is only sent to
  `/api/v1/auth`.
- Refresh tokens rotate on every use and are stored only as SHA-256 hashes. Reusing an old token
  after a 30-second grace window revokes the session (theft detection).
- Inactivity: a session unused for 30 minutes can no longer be refreshed. The server enforces this;
  the web app also signs out on its own idle timer.
- Every authenticated request loads the session and membership in one indexed query. Logout,
  removing a member and permission changes therefore apply on the next request.
- CSRF: double-submit token (`pb_csrf` cookie echoed in the `X-CSRF-Token` header) on top of
  SameSite.
- Rate limits on login, registration, password reset and invite routes.
- Password reset: single-use token, 30-minute expiry, signs out every device. Email delivery is a
  future feature. Outside production the reset link is written to the API log; in production
  nothing secret is logged.

In production the web app must reach the API on the **same site** (for example a Vercel rewrite
from `/api` to the API host), because the session cookies are `SameSite=Strict`.

### Companies, roles and isolation

- A user can belong to several companies; the active one travels in the session.
- Roles: `admin` (everything) and `employee`. An employee gets financial access only when an
  admin enables it. Permissions live in
  [`packages/shared/src/permissions.ts`](packages/shared/src/permissions.ts) and are enforced by
  the API.
- A company always keeps at least one admin.
- Invites are bound to an email, expire after 7 days and work once. Sending a new invite to the
  same email cancels the old link. Admins copy the link from the app (no email delivery yet).
- Every company-owned collection uses the `tenantScope` Mongoose plugin, which **refuses** any
  query or aggregation that does not filter by `companyId`.
- Sensitive changes are written to an append-only audit log.

### API endpoints (`/api/v1`)

| Method        | Path                                               | Access                         |
| ------------- | -------------------------------------------------- | ------------------------------ |
| POST          | `/auth/register`, `/auth/login`                    | Public, rate limited           |
| POST          | `/auth/refresh`, `/auth/logout`                    | Refresh cookie                 |
| POST          | `/auth/password/forgot`, `/auth/password/reset`    | Public, rate limited           |
| GET           | `/auth/me`                                         | Signed in                      |
| POST          | `/auth/logout-all`, `/auth/switch-company`         | Signed in                      |
| PUT           | `/auth/password`                                   | Signed in                      |
| POST          | `/companies`                                       | Signed in                      |
| GET           | `/companies/current`, `/companies/current/members` | Member                         |
| PATCH         | `/companies/current`                               | `settings:manage`              |
| PATCH, DELETE | `/companies/current/members/:userId`               | `members:manage`               |
| GET, POST     | `/companies/current/invites`                       | `members:manage`               |
| DELETE        | `/companies/current/invites/:inviteId`             | `members:manage`               |
| GET           | `/invites/:token`                                  | Public preview, rate limited   |
| POST          | `/invites/accept`                                  | Signed in as the invited email |

### API health

- `GET /health`: liveness (the process is up).
- `GET /health/ready`: readiness (MongoDB is reachable); 503 otherwise.

## Testing

`npm test` runs every workspace. API integration tests start **one** in-memory MongoDB replica set
for the whole run, and each test file uses its own database on it.

The first run downloads the MongoDB binary (~600 MB). On some Windows machines `mongod` takes
about a minute to start; the test setup allows for that.

## Roadmap

0. Foundation
1. Authentication, companies, members and roles (this part)
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
