# PrintBI

Business manager for small 3D-printing shops: filament spools and consumables, expenses,
catalog, customers, a manual cost calculator, quote PDFs, a production Kanban, sales and profit,
a dashboard, and a public product showcase.

> Status: **Part 4 - Catalog, labels and customers**. Features arrive in parts; see
> [Roadmap](#roadmap).

## Stack

| Layer    | Choice                                                                    |
| -------- | ------------------------------------------------------------------------- |
| Web      | React 19, Vite, TypeScript, React Router, TanStack Query, React Hook Form |
| UI       | Tailwind CSS v4, Radix primitives, Lucide icons, self-hosted fonts        |
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
    src/
      app/             Providers and routes (pages load on demand)
      design-system/   Studio Workshop components and printer-made visuals
      features/<area>/ Pages, hooks and queries per area (auth, settings, ...)
      layout/          App shell, navigation, sign-in layout
      lib/             API client, money and form helpers
packages/
  shared/              Code shared by API and web (money, pricing, schemas, permissions, view types)
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

| Method            | Path                                               | Access                               |
| ----------------- | -------------------------------------------------- | ------------------------------------ |
| POST              | `/auth/register`, `/auth/login`                    | Public, rate limited                 |
| POST              | `/auth/refresh`, `/auth/logout`                    | Refresh cookie                       |
| POST              | `/auth/password/forgot`, `/auth/password/reset`    | Public, rate limited                 |
| GET               | `/auth/me`                                         | Signed in                            |
| POST              | `/auth/logout-all`, `/auth/switch-company`         | Signed in                            |
| PUT               | `/auth/password`                                   | Signed in                            |
| POST              | `/companies`                                       | Signed in                            |
| GET               | `/companies/current`, `/companies/current/members` | Member                               |
| PATCH             | `/companies/current`                               | `settings:manage`                    |
| PATCH, DELETE     | `/companies/current/members/:userId`               | `members:manage`                     |
| GET, POST         | `/companies/current/invites`                       | `members:manage`                     |
| DELETE            | `/companies/current/invites/:inviteId`             | `members:manage`                     |
| GET               | `/companies/current/settings`                      | Member                               |
| PATCH             | `/companies/current/settings`                      | `settings:manage`                    |
| GET               | `/companies/current/printers`                      | Member (costs need `finance:view`)   |
| POST, PUT, DELETE | `/companies/current/printers[/:printerId]`         | `settings:manage`                    |
| GET               | `/companies/current/expense-categories`            | Member                               |
| POST, PATCH       | `/companies/current/expense-categories[/:id]`      | `settings:manage`                    |
| GET               | `/invites/:token`                                  | Public preview, rate limited         |
| POST              | `/invites/accept`                                  | Signed in as the invited email       |
| GET               | `/printer-models`                                  | Signed in (cached for an hour)       |
| GET               | `/filament-products`                               | Signed in (cached for an hour)       |
| GET               | `/inventory/summary`, `/inventory/items[/:id]`     | Member (costs need `finance:view`)   |
| GET               | `/inventory/items/:id/movements`                   | Member                               |
| POST, PUT         | `/inventory/items[/:id]`                           | Member; key when stock moves         |
| POST              | `/inventory/items/:id/lots`                        | Member · Idempotency-Key             |
| PATCH             | `/inventory/items/:id/lots/:lotId`                 | Member (price needs finance)         |
| POST              | `/inventory/items/:id/lots/:lotId/adjust`          | Member · Idempotency-Key             |
| POST              | `/inventory/purchases`                             | Member · Idempotency-Key             |
| POST              | `/inventory/consumptions`                          | Member · Idempotency-Key             |
| POST              | `/inventory/movements/:id/reverse`                 | Member · Idempotency-Key             |
| POST              | `/inventory/items/:id/archive`                     | `records:archive`                    |
| GET               | `/expenses`, `/expenses/summary`, `/expenses/:id`  | `finance:view`                       |
| POST, PATCH       | `/expenses[/:id]`                                  | `finance:manage`                     |
| POST, DELETE      | `/expenses/:id/payments[/:paymentId]`              | `finance:manage` (POST: key)         |
| POST              | `/expenses/:id/cancel`                             | `finance:manage` + `records:archive` |
| GET, POST         | `/labels`                                          | Member                               |
| PATCH             | `/labels/:id`                                      | Member                               |
| GET, POST, PUT    | `/products[/:id]`                                  | Member (cost needs `finance:view`)   |
| POST              | `/products/:id/archive`                            | `records:archive`                    |
| GET, POST, PUT    | `/customers[/:id]`                                 | Member                               |
| POST              | `/customers/:id/archive`                           | `records:archive`                    |

### Inventory and the stock ledger

- An item is a filament (material, brand, color, diameter, density, temperatures) or another
  consumable (screws, magnets, boxes...) in its own unit. Tools are expenses, not stock.
- Every physical roll or purchase is a separate **lot** with its own quantity and price. Its cost
  per gram (or per unit) is fixed when it is bought and kept as the lot's cost snapshot.
- Every change goes through an **append-only ledger**: stock in, usage, loss, count corrections and
  reversals. Rows are never edited or deleted; a wrong entry is fixed by recording its exact opposite,
  once.
- Taking stock out is a conditional update in the database (`remaining >= quantity`) inside a
  transaction. A multi-line usage either deducts every line or none, and stock never goes negative,
  even under concurrent requests.
- Every stock-changing request carries an `Idempotency-Key`. Replays and double clicks answer with
  the original result (`Idempotent-Replayed: true`) instead of writing twice.
- Recording a purchase as an expense creates one linked expense in the same transaction. A unique
  index on the lots it paid for makes a duplicate impossible. Stock bought before using the app needs
  no expense.
- **Multi-color purchases**: a whole order is entered like a cart. Set up one roll (product, weight,
  price, color, number of rolls), add it, then duplicate it and change only the color. Saving creates
  every roll in one transaction; a filament already in stock (same material, brand, color and
  diameter) receives the new rolls instead of being duplicated, and one expense covers the order.
- **Low-stock warnings per roll**: every filament roll warns once it drops below a limit. The default
  for all rolls is set in Settings → Stock warnings (100 g), and any roll can set its own. Other
  consumables warn on the item's total.
- A lot's price can be corrected only until stock is taken from it; after that it belongs to past
  records.
- The filament color picker covers the whole spectrum (basics, matte, silk, metallic, neon, glow,
  translucent, marble, galaxy, wood, carbon, multi-color, rainbow, color-changing) as static shared
  data, plus custom colors. Spool gauges are drawn in the filament's real color.
- When adding filament, users can pick one of 460 products from the filament catalog to fill
  material, diameter, density and temperatures, or type everything by hand.

### Expenses

- Expenses keep their original amount and currency and take one or more payments. The status
  (pending, partly paid, paid) follows from the payments; a payment can never exceed what is owed.
- The period summary separates **recorded** (purchases dated in the period), **paid** (payments
  made in the period, whatever the purchase date) and **still to pay**, per currency. Cancelled
  expenses stay on record but leave the totals.
- Only members with financial access see expenses; cancelling also needs the archive permission.

### Catalog, labels and customers

- **Products and services** share one collection: type, name, description, labels, usual price,
  sale unit (per piece, per hour, per job or a custom unit), estimated cost, private notes, and for
  products the size of a typical piece (width × depth × height in mm) and the filament it uses.
  Quotes and sales start from these values and can change them. The same document will feed the
  public showcase (Part 4b).
- The **estimated cost** is removed from responses for members without financial access, and their
  edits never overwrite it.
- **Labels** (Keychain, Fridge magnet, Gift...) live inside the company document, not in a
  collection of their own. They are created on the spot from the product form, with a color, and
  managed in one dialog that shows how many products use each. Names are unique per business,
  ignoring case. Archiving a label keeps it on the products that already carry it, but it can't be
  added to new ones.
- **Customers** need only a name; company, phone or WhatsApp, email, address and notes are optional.
  Search covers name, company, phone and email. The create dialog is a standalone component, so
  quotes, orders and sales can add a customer without leaving the screen. The customer page links
  straight to WhatsApp, a call or an email.
- Products and customers are archived, never deleted, so past quotes and sales keep them.

### Printer catalog

When adding a printer, users search a catalog of **162 FDM printers from 33 brands**. Picking one
fills the name, brand and model, and links a **spec sheet**: build volume, nozzle, maximum speed,
typical nozzle and bed temperatures, rated and heater power, typical price and maintenance. Any
field can still be changed, and a printer that is not in the catalog can always be entered by hand.

- The catalog is a shared collection (not company data), loaded from
  [`apps/api/data/printer-models.json`](apps/api/data/printer-models.json). When the API starts,
  it brings the database up to date, writing only when the bundled catalog changed.
- The source's power figure is the **rated (peak)** power. It appears on the spec sheet only. Energy
  cost uses the average power the user enters, which is much lower in practice.
- The source has no printer weight, external dimensions or photos, so the app shows none.

### Company settings

Settings, printers and expense categories live inside the company document (no extra
collections): currency (default CAD or BRL plus a manual BRL-per-CAD display rate), calculator
defaults, reminder thresholds and how long finished cards stay on the board. Printer costs are
removed from API responses for members without financial access. Machine cost per hour comes from
[`packages/shared/src/pricing.ts`](packages/shared/src/pricing.ts), shared by the API and the web.

### Web app and design system

The visual direction, **Studio Workshop**, combines soft rounded shapes with a data-dense layout.
Figures and labels use IBM Plex Mono (a slicer-readout feel), and text uses Schibsted Grotesk.
Tokens are in [`apps/web/src/styles/index.css`](apps/web/src/styles/index.css).

- Printer-made components: a nozzle laying a line (loading), a spool gauge that thins with use,
  filament bars for stock and progress, and an idle nozzle over an empty bed (empty states).
  Motion is off when the system asks for reduced motion.
- Forms validate with the same Zod schemas as the API and submit decimals as strings. Leaving a
  form with unsaved changes asks for confirmation.
- The API client adds the CSRF header, renews an expired access token once (shared by concurrent
  requests) and sends the user to sign-in when the session cannot be renewed.
- Signs out after 30 minutes without interaction, with a two-minute warning. Activity in any tab
  counts, and an active user's session is renewed every 10 minutes.
- Money is always shown with its currency code (`CAD 1,200.00`), since CAD and BRL can look alike.
- Pages load on demand. Libraries are split into separate chunks that stay cached between releases.

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
1. Authentication, companies, members and roles
2. Web shell, design system and settings
3. Inventory (spools and lots, stock ledger) and expenses
4. Catalog and customers (this part) · 4b public showcase · 4c seasonal showcases
5. Calculator
6. Quotes and PDF
7. Orders and Kanban, stock consumption
8. Sales and profit
9. Dashboard and reminders
10. Finish: accessibility, demo data, final docs, deploy configuration

## Image slots

Places where the business owner uploads their own photos or artwork. Each slot shows its
recommended size in the app and keeps a placeholder until something is uploaded. Uploads arrive
with image storage in Part 4b; more slots are added as features are built.

| Slot           | Where it appears                                     | Recommended size                       | Format / limit          |
| -------------- | ---------------------------------------------------- | -------------------------------------- | ----------------------- |
| Company logo   | Settings, quote PDF header, showcase header          | 512 × 512 (square, transparent)        | PNG, SVG or WebP · 1 MB |
| Product photos | Product form, showcase grid (cover) and product page | 1600 × 1600 (1:1), up to 8 per product | JPG, WebP or PNG · 5 MB |

## Data sources

- **Printer catalog**: adapted from the
  [Open 3D Printer Database](https://github.com/swordlab/open-3d-printer-database) by swordlab,
  licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Only FDM printers and
  selected fields are kept, and brand names are normalized. Details and the regeneration command
  are in [`apps/api/data/NOTICE.md`](apps/api/data/NOTICE.md).
- **Filament catalog**: adapted from the same database (`materials_catalog.json`), CC BY 4.0. Only
  FDM filaments and selected fields are kept, and material types are normalized.
- **Filament colors**: the color catalog is PrintBI's own static list.

## License

Code: [MIT](LICENSE) © Luiz Gustavo Guimaraes. Third-party data keeps its own license (see
[Data sources](#data-sources)).
