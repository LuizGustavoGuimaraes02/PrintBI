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

| Variable                   | Description                                                   |
| -------------------------- | ------------------------------------------------------------- |
| `NODE_ENV`                 | `development`, `test` or `production`                         |
| `PORT`                     | API port (default `3000`)                                     |
| `MONGO_URI`                | MongoDB connection string (replica set)                       |
| `CORS_ORIGINS`             | Comma-separated allowed web origins                           |
| `LOG_LEVEL`                | pino log level (default `info`)                               |
| `WEB_URL`                  | Public web URL, used in reset and invite links                |
| `JWT_ACCESS_SECRET`        | Access-token signing secret (32+ random characters)           |
| `ACCESS_TOKEN_TTL_MINUTES` | Access-token lifetime (default 15)                            |
| `REFRESH_TOKEN_TTL_DAYS`   | Refresh-token lifetime (default 7)                            |
| `SESSION_IDLE_MINUTES`     | Inactivity limit for refreshing (default 30)                  |
| `AUTH_RATE_LIMIT`          | Requests per IP per 15 minutes on auth routes (default 20)    |
| `CLOUDINARY_URL`           | Optional image storage: `cloudinary://<key>:<secret>@<cloud>` |

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

| Method            | Path                                                   | Access                                  |
| ----------------- | ------------------------------------------------------ | --------------------------------------- |
| POST              | `/auth/register`, `/auth/login`                        | Public, rate limited                    |
| POST              | `/auth/refresh`, `/auth/logout`                        | Refresh cookie                          |
| POST              | `/auth/password/forgot`, `/auth/password/reset`        | Public, rate limited                    |
| GET               | `/auth/me`                                             | Signed in                               |
| POST              | `/auth/logout-all`, `/auth/switch-company`             | Signed in                               |
| PUT               | `/auth/password`                                       | Signed in                               |
| POST              | `/companies`                                           | Signed in                               |
| GET               | `/companies/current`, `/companies/current/members`     | Member                                  |
| PATCH             | `/companies/current`                                   | `settings:manage`                       |
| PATCH, DELETE     | `/companies/current/members/:userId`                   | `members:manage`                        |
| GET, POST         | `/companies/current/invites`                           | `members:manage`                        |
| DELETE            | `/companies/current/invites/:inviteId`                 | `members:manage`                        |
| GET               | `/companies/current/settings`                          | Member                                  |
| PATCH             | `/companies/current/settings`                          | `settings:manage`                       |
| GET               | `/companies/current/printers`                          | Member (costs need `finance:view`)      |
| POST, PUT, DELETE | `/companies/current/printers[/:printerId]`             | `settings:manage`                       |
| GET               | `/companies/current/expense-categories`                | Member                                  |
| POST, PATCH       | `/companies/current/expense-categories[/:id]`          | `settings:manage`                       |
| GET               | `/invites/:token`                                      | Public preview, rate limited            |
| POST              | `/invites/accept`                                      | Signed in as the invited email          |
| GET               | `/printer-models`                                      | Signed in (cached for an hour)          |
| GET               | `/filament-products`                                   | Signed in (cached for an hour)          |
| GET               | `/inventory/summary`, `/inventory/items[/:id]`         | Member (costs need `finance:view`)      |
| GET               | `/inventory/items/:id/movements`                       | Member                                  |
| POST, PUT         | `/inventory/items[/:id]`                               | Member; key when stock moves            |
| POST              | `/inventory/items/:id/lots`                            | Member · Idempotency-Key                |
| PATCH             | `/inventory/items/:id/lots/:lotId`                     | Member (price needs finance)            |
| POST              | `/inventory/items/:id/lots/:lotId/adjust`              | Member · Idempotency-Key                |
| POST              | `/inventory/purchases`                                 | Member · Idempotency-Key                |
| GET               | `/inventory/unrecorded-lots`                           | `finance:manage`                        |
| POST              | `/inventory/unrecorded-lots/expenses`                  | `finance:manage`                        |
| POST              | `/inventory/consumptions`                              | Member · Idempotency-Key                |
| POST              | `/inventory/movements/:id/reverse`                     | Member · Idempotency-Key                |
| POST              | `/inventory/items/:id/archive`                         | `records:archive`                       |
| GET               | `/inventory/items/:id/delete-preview`                  | `records:archive`                       |
| DELETE            | `/inventory/items/:id[/lots/:lotId]`                   | `records:archive`                       |
| GET               | `/expenses`, `/expenses/summary`, `/expenses/:id`      | `finance:view`                          |
| POST, PATCH       | `/expenses[/:id]`                                      | `finance:manage`                        |
| POST, DELETE      | `/expenses/:id/payments[/:paymentId]`                  | `finance:manage` (POST: key)            |
| POST              | `/expenses/:id/cancel`                                 | `finance:manage` + `records:archive`    |
| DELETE            | `/expenses/:id`                                        | `finance:manage` + `records:archive`    |
| GET, POST         | `/labels`                                              | Member                                  |
| PATCH             | `/labels/:id`                                          | Member                                  |
| GET, POST, PUT    | `/products[/:id]`                                      | Member (cost needs `finance:view`)      |
| POST              | `/products/:id/archive`                                | `records:archive`                       |
| DELETE            | `/products/:id`                                        | `records:archive`                       |
| POST, PUT         | `/products/:id/images`                                 | Member (register, reorder, alt text)    |
| DELETE            | `/products/:id/images/:imageId`                        | Member                                  |
| PUT               | `/products/:id/showcase`                               | `showcase:manage`                       |
| GET               | `/uploads/config`                                      | Member                                  |
| POST              | `/uploads/sign`                                        | Member (logo: `settings:manage`)        |
| POST, DELETE      | `/companies/current/logo`                              | `settings:manage`                       |
| GET               | `/companies/current/showcase[/products]`               | Member                                  |
| PUT               | `/companies/current/showcase[/order]`                  | `showcase:manage`                       |
| GET               | `/public/showcase/:slug[/:productSlug]`                | Public, own rate limit, cached 60 s     |
| GET, POST         | `/calculations`                                        | `finance:view`                          |
| GET, PUT, DELETE  | `/calculations/:id`                                    | `finance:view`                          |
| GET, POST         | `/quotes`                                              | Member                                  |
| GET, PUT          | `/quotes/:id`                                          | Member                                  |
| DELETE            | `/quotes/:id`                                          | `records:archive`                       |
| POST              | `/quotes/:id/actions`                                  | Member (send, approve, reject, …)       |
| GET, POST         | `/orders`                                              | Member (filters in the query string)    |
| GET               | `/orders/from-quote/:quoteId`                          | Member (prefill for review)             |
| GET, PUT          | `/orders/:id`                                          | Member                                  |
| POST              | `/orders/:id/move`                                     | Member; to/from Cancelled needs archive |
| PATCH             | `/orders/:id/payment`                                  | `finance:manage`                        |
| PATCH             | `/orders/:id/hold`                                     | Member (waiting flag, or null to clear) |
| GET, PUT, DELETE  | `/orders/:id/picture`                                  | Member (PUT a data URL, 64 KB at most)  |
| POST              | `/orders/:id/reminder`                                 | Member (contacted, snooze, unsnooze)    |
| GET, POST         | `/orders/:id/movements`, `/orders/:id/consumptions`    | Member; POST needs `Idempotency-Key`    |
| DELETE            | `/orders/:id`                                          | `records:archive`                       |
| GET, POST         | `/sales`                                               | `finance:view`; POST `finance:manage`   |
| GET               | `/sales/draft`                                         | `finance:view` (order, quote, calc…)    |
| GET, PUT          | `/sales/:id`                                           | `finance:view`; PUT `finance:manage`    |
| POST, DELETE      | `/sales/:id/receipts`, `/sales/:id/receipts/:receipt`  | `finance:manage`                        |
| POST              | `/sales/:id/cancel`                                    | `finance:manage` + `records:archive`    |
| GET, POST         | `/sales/:id/movements`, `/sales/:id/consumptions`      | POST `finance:manage`, Idempotency-Key  |
| DELETE            | `/sales/:id`                                           | `finance:manage` + `records:archive`    |
| GET               | `/public/showcase/:slug/c/:collectionSlug`             | Public; 404 while the collection is off |
| GET               | `/companies/current/showcase/collections`              | Member                                  |
| PUT               | `/companies/current/showcase/collections/:key`         | `showcase:manage`                       |
| POST, DELETE      | `/companies/current/showcase/collections/:key/images`  | `showcase:manage`                       |
| GET               | `/companies/current/showcase/collections/:key/preview` | `showcase:manage`                       |
| GET, POST         | `/customer-sources`                                    | Member                                  |
| PATCH             | `/customer-sources/:id`                                | Member                                  |
| GET, POST, PUT    | `/customers[/:id]`                                     | Member                                  |
| POST              | `/customers/:id/archive`                               | `records:archive`                       |
| DELETE            | `/customers/:id`                                       | `records:archive`                       |
| DELETE            | `/labels/:id`, `/customer-sources/:id`                 | Member                                  |
| DELETE            | `/companies/current/expense-categories/:id`            | `settings:manage`                       |

### Inventory and the stock ledger

- An item is a filament (material, brand, color, diameter, density, temperatures) or another
  consumable (screws, magnets, boxes...) in its own unit. Tools are expenses, not stock.
- Every physical roll or purchase is a separate **lot** with its own quantity and price. Its cost
  per gram (or per unit) is fixed when it is bought and kept as the lot's cost snapshot.
- Every change goes through a **ledger**: stock in, usage, loss, count corrections and reversals.
  Rows are never edited; a wrong entry is fixed by recording its exact opposite, once. Rows are only
  removed together with their item or roll, when that item or roll is deleted as a mistake.
- Taking stock out is a conditional update in the database (`remaining >= quantity`) inside a
  transaction. A multi-line usage either deducts every line or none, and stock never goes negative,
  even under concurrent requests.
- Every stock-changing request carries an `Idempotency-Key`. Replays and double clicks answer with
  the original result (`Idempotent-Replayed: true`) instead of writing twice.
- Every purchase is recorded in Costs & Expenses by default (one linked expense, in the same
  transaction); the switch is turned off only for stock owned before using the app. Priced rolls
  that still have no expense (switch turned off, or registered by a member without financial
  access) are listed on Inventory and Costs & Expenses, and can be recorded afterwards: rolls
  bought on the same day at the same store become one expense.
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
  Quotes and sales start from these values and can change them. The same document feeds the
  public showcase.
- The **estimated cost** is removed from responses for members without financial access, and their
  edits never overwrite it.
- **Labels** (Keychain, Fridge magnet, Gift...) live inside the company document, not in a
  collection of their own. They are created on the spot from the product form, with a color, and
  managed in one dialog that shows how many products use each. Names are unique per business,
  ignoring case. Archiving a label keeps it on the products that already carry it, but it can't be
  added to new ones.
- **Customers** need only a name; company, phone or WhatsApp, email, address and notes are optional.
  Search covers name, company, phone and email.
- Each customer can record **where they came from**. Every business starts with WhatsApp, Referral
  and Instagram and adds its own (Facebook, Flyer...) from the customer form; a detail field holds
  who referred them. The customer list filters by source and shows how many customers each one
  brought. Sources live inside the company document, like labels. The create dialog is a standalone component, so
  quotes, orders and sales can add a customer without leaving the screen. The customer page links
  straight to WhatsApp, a call or an email.
- Products and customers can be archived (kept for history, hidden from new work) or deleted.

### Deleting records

Anything entered by mistake can be deleted, after a confirmation that says what goes with it.
Archive (or cancel, for expenses) stays available for records that really happened.

| Record                  | Who                        | What happens to linked data                                                                                                                 |
| ----------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Stock item or one roll  | `records:archive`          | Its ledger rows go with it. An expense that paid only for it can be deleted too (offered, needs `finance:manage`); a shared one is unlinked |
| Expense                 | `finance:manage` + archive | Its payments go with it; the rolls it paid for stay, listed again as not recorded in expenses                                               |
| Product or service      | `records:archive`          | Its photos are deleted from Cloudinary. Refused while an order or a sale uses it (archive it instead)                                       |
| Customer                | `records:archive`          | Refused while an order or a sale is for them (archive instead). Quotes keep their own copy of the details                                   |
| Label / customer source | Member                     | Taken off the products, orders / customers that carry it                                                                                    |
| Expense category        | `settings:manage`          | Refused while any expense uses it (archive it instead)                                                                                      |
| Printer                 | `settings:manage`          | Refused while an order is assigned to it (archive it instead)                                                                               |
| Quote                   | `records:archive`          | Refused while an order or a sale was made from it (delete that first)                                                                       |
| Order                   | `records:archive`          | Refused once it recorded stock use (cancel it instead: its ledger rows point to it) or while it has a sale                                  |

Every delete is written to the audit log. Stock moved by an order or a sale can't be deleted, only
archived. A sale can be deleted (finance:manage and records:archive) until it records stock use;
deleting it frees its order, whose payment is then set by hand again.

### Public showcase

- Each business gets a public page at `/s/<link>` with a search, a filter by label, and a page per
  product (`/s/<link>/<product>`) with a photo gallery, size, filament weight and a WhatsApp button
  that opens a chat with a ready message ("{product}" becomes the product name). It is set up in
  the **Showcase** page (sidebar): published or not, link, title, description, language (Portuguese or
  English), WhatsApp number and message.
- **No new collection.** Visibility, badge ("Already made" or "Made to order"), "show the price",
  featured and order live in `products.showcase`; the settings live in the company document. A
  product gets its link the first time it is shown and keeps it if renamed.
- **Only an admin** (`showcase:manage`) shows or hides products, changes the order or the
  settings. Hiding a product never touches quotes, sales or history. Archived products never show.
- **The public API is built from an allowlist**: name, description, labels, badge, specs, photos,
  and the price only when chosen. Costs, notes, sales data and internal ids never appear (tests
  check the exact keys). Unpublished showcases and hidden products answer 404. Responses carry
  `Cache-Control` (60 s) and an ETag, under their own rate limit.
- **Images live on Cloudinary**, never in MongoDB, and only their id and facts are stored. The API
  signs each upload for one exact id, folder and set of formats; the browser sends the file
  straight to Cloudinary; then the API checks what was stored (folder, format, size) before linking
  it, and deletes anything that breaks the rules. Removing or replacing an image deletes the file.
  Folder names are keyed hashes, so public image URLs reveal no company or product id. Sizes come
  from URL transformations (`f_auto,q_auto`, 400, 800 and 1600 px).
- **Setup:** create a free Cloudinary account and copy the "API environment variable"
  (`cloudinary://...`) into `CLOUDINARY_URL` in `apps/api/.env`. Without it, the app runs and the
  upload slots say storage is not set up.

### Seasonal collections

- Four themed pages: Valentine’s Day, Easter, Halloween and Christmas, at `/s/<link>/c/<collection>`.
  **Every collection starts hidden** and only an admin turns one on; nothing switches by date. A
  hidden page answers 404 to visitors; the admin previews it full screen while signed in.
- Each active collection adds a slide to a banner at the top of the main showcase. Several become a
  carousel with arrows, dots, keyboard and swipe; it advances every 6 s, pauses on hover or focus,
  and never moves for visitors who ask for reduced motion.
- **Themes** live in a registry (`apps/web/src/features/showcase/themes/`, one file per season):
  colors as CSS variables, an accent font loaded only when the theme shows, an original SVG
  illustration, gentle motion (snow, hearts, confetti, bats) and closing copy. A new season is one
  more file. All artwork is original, drawn for PrintBI.
- **Two languages.** Every public page has a flag button (Brazil for Portuguese, Canada for English,
  matching the app’s en-CA formatting). Pages start in the showcase language; the visitor’s choice
  is remembered in their browser. Collection name, title, intro and banner exist in both languages;
  an empty English text, or a missing English banner, falls back to Portuguese. Prices keep the
  product’s currency.
- **No new collection in MongoDB:** collections live in `companies.collections[]` (only edited
  ones are stored; the rest use their defaults) and products join them through
  `products.showcase.collections[]`. A product in a hidden collection still shows on the main
  showcase when it is visible there.

### Calculator

- A manual cost model (no G-code import). Every section can be switched on or off: filament (from
  a stock roll at its own cost per gram, or typed in from a spool's weight and price), energy
  (kWh = W ÷ 1000 × hours), labor (activities × hourly rate), machine (a printer's cost per hour or
  payback plan: (purchase + repairs) ÷ planned hours), materials and consumables, a risk
  allowance on filament, all materials or the total, and fees and taxes.
- **Per piece or per batch:** entered time, grams and quantities are multiplied by the number of
  pieces only when they are per piece, never twice. Results show the cost and price per piece
  and for the batch.
- **Price:** by margin (cost ÷ (1 − margin)), by markup (cost × (1 + markup)) or typed in, always
  showing profit, margin and markup. Fees taken from the price (platform, card, tax included) are
  solved algebraically, so the price never depends on itself; tax added on top is shown as what
  the customer pays and never counts as revenue. Nothing about taxes is assumed.
- **One engine, two places:** `packages/shared/src/calculator.ts` runs live in the browser and
  again on the server when a calculation is saved, after the server replaces the page's numbers
  with the records: each roll's real cost and stock, the printer's rate and the CAD/BRL rate. A
  line in the other currency needs that rate; without it the result is marked incomplete instead
  of adding different currencies. Estimates never touch stock; going past a roll's grams warns.
- Saved calculations keep their inputs and result as a snapshot. Saving can also write the unit
  cost into the linked product's estimated cost. The calculator needs `finance:view`.

### Quotes and PDF

- A quote has a customer (picked from the customers, whose details are copied in, or typed for a
  one-off), items, a discount, delivery, any number of taxes, dates and terms. Numbers come from
  an atomic counter per company: ORC-0001, ORC-0002, … never reused, even after a delete.
- **Totals:** each line is rounded to cents first; subtotal − discount + delivery is the tax
  base; each tax is a percentage of it. `packages/shared/src/quotes.ts` adds up live in the
  browser and again on the server when the quote is saved.
- Items can start from a product (its price) or a saved calculation (its price, quantity and cost
  breakdown). The PDF can show that breakdown, estimated production cost and added profit under
  the item. Only members with `finance:view` see or change it; others never receive it.
- **Status:** draft → sent → approved, rejected or cancelled; any closed quote can be reopened as a
  draft. A draft or sent quote past its valid-until date shows as expired. Approved, rejected and
  cancelled quotes are locked. Every change of status is kept in the quote's history.
- **PDF in Portuguese or English**, made in the browser with `@react-pdf/renderer` from the saved
  quote, with the company's logo, contact details and terms. The fonts are self-hosted. The PDF
  uses Schibsted Grotesk only, because the engine can't embed IBM Plex Mono's accented letters.
  The fonts are registered again before each PDF: the engine drops letters a second document
  uses for the first time when it reuses a loaded font.

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

### Orders and the board

- **One job per order**, of three types: sale, gift or personal. Only a sale has an agreed price and
  a payment status (unpaid, partly paid, paid). Gifts and personal jobs record cost without revenue.
  The recipient is a customer, a plain name or "Myself". One primary printer per order.
- **Board columns:** To do, Printing, Ready, Done. Cancelled orders leave the board and keep their
  history. Production and payment are separate: a card can be Ready and unpaid.
- **Waiting flags instead of extra columns:** a card can wait for quote approval, the customer,
  filament, a printer fix, a reprint or something else (`blocked` on the order, `PATCH
/orders/:id/hold`). It keeps its column and shows the flag in orange; finishing or cancelling
  clears it. Quote drafts and sent quotes live on the Quotes page.
- **Moving from the first eight-column board:** `npm run migrate:order-stages -w @printbi/api -- --dry`
  counts what would move, and without `--dry` it moves it: Quote draft and Waiting for customer go to
  To do flagged "Waiting for quote approval", Blocked goes to To do with its reason, Printed goes to
  Ready. Orders it has not reached yet are read the same way, and history keeps the old names.
- **Manual order:** each card has a fractional string `rank` (`packages/shared/src/orders.ts`), so
  a move writes only that card. Without a chosen spot (a new card, or "Move to" in the card), it
  goes before the first card with a later deadline. The list view sorts late cards first, then the
  nearest deadlines, then the rest.
- **Adding:** "New order" and each column's "+ Add" open a centered window: a big title, then
  one property per line (filament, for whom, type, due date, printer, quantity). "Show more" adds
  price, payment, waiting for, priority and labels, and is remembered per person in the browser.
  "Add another after this" keeps the window open. Editing uses the same list on its own page.
- **Filament from stock:** the rolls in stock show as spools in their own color; the person taps
  the roll they loaded (several for multicolor). The file never picks it, it only lists rolls of
  its material first. Picked rolls are saved on the order (`filaments`, with the file's grams
  for a single roll) and show on the card. Nothing is deducted.
- **Card picture:** the plate preview from the print file becomes the card's picture; the person
  can choose another photo or remove it. The browser shrinks it (400 px, WebP) and it is stored
  apart from the order (`orderpictures`), so board lists stay light; its URL changes with it.
- **Confirm print:** a card in Done that has deducted nothing shows "Confirm print". It opens the
  usage dialog filled with the picked rolls and grams; confirming deducts them through the order,
  like "Record usage" in the card, which stays as the manual way.
- **Print file autofill** (`apps/web/src/features/orders/printFile.ts`): drop a `.3mf` (Bambu
  Studio, OrcaSlicer, PrusaSlicer) or `.gcode` (PrusaSlicer, OrcaSlicer, Bambu Studio, Cura,
  Simplify3D). It is read in the browser and never uploaded or stored. It fills the title, copies
  as quantity, the matching printer, time and grams, and shows the plate thumbnail. A value already typed is never overwritten, and removing the file clears what it
  filled. These are planning estimates: stock only changes when usage is recorded. A `.3mf` saved
  before slicing has no time or weight; Cura only gives filament length, so its grams are
  estimated (1.75 mm PLA).
- **Drag and drop** with dnd-kit: mouse, long press on touch, and keyboard (space on a card's grip
  button, arrows, space to drop), with spoken announcements.
- **Moving never touches stock, payments or sales.** Usage is recorded explicitly from the card
  ("Record usage"): several rolls and lots in one transaction, idempotent with `Idempotency-Key`,
  "not enough stock" names the roll and deducts nothing. Ledger rows carry the order's id; the
  order's `costSummary` (used and lost, per currency) is summed again from the ledger in the same
  transaction, including corrections made with "Correct".
- **Late** is computed from the due date (in the viewer's calendar day). **Reminders** use the
  per-column thresholds in Settings → Reminders, counted from when the card entered its column, the
  last "Contacted" or the last recorded usage. A flagged card uses its flag's threshold instead
  (customer flags the quote one, the others the "waiting for filament or a fix" one), counted from
  when the flag was set. Editing or opening a card doesn't reset them;
  "Snooze" quiets one for 1, 3 or 7 days.
- **Board retention:** a card becomes done when it is Completed (and Paid, for a sale). It leaves
  the active board after the company's retention days (default 7), counted from that moment, and
  stays findable under "Off the board". Reopening it, or the payment going back from Paid, brings
  it back and restarts the count. Nothing is deleted.
- **From a quote:** an approved quote offers "Create printing order", which opens the form
  prefilled with the customer, items, agreed price, and the calculator's time, grams and cost
  scaled to the quote's quantities. Approving creates nothing by itself. A unique index allows one
  order per quote, and the quote links to its order.

### Sales and profit

- **A sale** is direct (the counter, a walk-in customer), or made from an approved quote, a
  sale order or a saved calculation, prefilled for review. It is numbered VEN-0001 and copies
  each line's description, price and product labels, so later catalog edits never change it.
  Each order and each quote makes one sale (unique indexes on `orderId` and `quoteId`).
- **Total** = lines − discount + delivery charged to the customer. **Receipts** are separate
  from the amount sold: partial payments add up until it is paid. Production (to start, in
  production, ready, delivered) is separate too; a sale linked to an order follows the order's
  column, and the order's payment follows the sale's receipts (its own payment control steps
  aside), so the board's done-and-paid retention keeps working.
- **Profit** = total − material cost − costs the business entered for that sale (shipping it
  paid, platform or card fees, packaging, labor). Material cost is the recorded stock use (on
  the linked order, or recorded on the sale when it has no order); until then it is the lines'
  estimate, and the page and the list say "estimated". Nothing is counted twice: a sale with an
  order never records stock of its own.
- **Currencies:** each sale keeps its own currency, and summaries list one total per currency.
  The BRL-per-CAD rate in Settings → Currency is saved with each sale when it is made, to convert
  stock bought in the other currency; changing the rate later never rewrites old sales. Without a
  rate, those costs are shown apart instead of being added.
- **Cancelling** keeps the sale and its receipts on record and takes it out of the totals; stock
  used and money received are not reversed.
- Sales need financial access. Customers show their sales count to everyone and the total bought
  to people with financial access; products show how many units were sold.

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
4. Catalog and customers · 4b public showcase · 4c seasonal showcases
5. Calculator
6. Quotes and PDF
7. Orders and Kanban, stock consumption
8. Sales and profit (this part)
9. Dashboard and reminders
10. Finish: accessibility, demo data, final docs, deploy configuration

## Hints on actions

Buttons whose effect isn't obvious from their label explain it on hover and keyboard focus
(`hint` on `Button` and `DeleteAction`, or the `Hint` wrapper for links): what changes, what
stays, and the gentler option when there is one ("Archive keeps the history"). Touch screens have
no hover, so anything that matters, such as a stock deduction, is also said in the dialog that
follows.

## Image slots

Places where the business owner uploads their own photos or artwork. Each slot shows its
recommended size in the app and keeps a placeholder until something is uploaded. More slots are
added as features are built.

| Slot                            | Where it appears                                                      | Recommended size                                                                                                 | Format / limit                         |
| ------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Company logo                    | Settings → Business; showcase header; quote PDF                       | 512 × 512 (square, transparent)                                                                                  | PNG, SVG or WebP · 1 MB                |
| Product photos                  | Product page; showcase grid (first photo = cover) and product gallery | 1600 × 1600 (1:1), up to 8 per product                                                                           | JPG, WebP or PNG · 5 MB                |
| Seasonal banner                 | Banner/carousel at the top of the main showcase (per collection)      | 1920 × 640 desktop (3:1) · 1080 × 1350 mobile (4:5); text inside the central 60% · Portuguese, English optional  | JPG or WebP · 5 MB                     |
| Order card picture              | Top of the order card on the board and of the order window            | Any; the browser shrinks it to 400 px on the longest side. The plate preview of a .3mf/.gcode is used by default | PNG, JPEG or WebP · stored up to 64 KB |
| Seasonal page header (optional) | Top of a seasonal page, instead of the illustration                   | 1920 × 800, both languages                                                                                       | JPG or WebP · 5 MB                     |

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
