# Smart City Management System (SCMS)

CMPE344 Database Management Systems and Programming II — full-stack PostgreSQL/PLpgSQL + Express 5 + TypeScript implementation.

## Stack (Zero-Cost Friendly)

- **Backend:** Express 5 · TypeScript · `pg` · `bcryptjs` · `zod` (4 runtime dependencies)
- **Database:** PostgreSQL 15+ with PL/pgSQL triggers, stored procedures, and stored functions
- **Frontend:** Vanilla HTML5 · CSS3 · JavaScript (8 screens, role-scoped navigation, zero frontend build step)
- **Deployment ($0/month):** Vercel Hobby (`api/index.ts` + `public/`) or Render Free Web Service (`render.yaml`) + Neon / Supabase PostgreSQL
- **Tests:** Vitest + Supertest

---

## Quick Start (4 Steps)

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL and SESSION_SECRET
npm run db:apply              # applies sql/ddl.sql, sql/plpgsql.sql, sql/dml.sql
npm run dev                   # opens http://localhost:3000
```

In PowerShell, copy `.env.example` with:

```powershell
Copy-Item .env.example .env
```

### Demo Accounts (Password: `Passw0rd!`)

| Username | Role | Access Summary |
|---|---|---|
| `admin` | `admin` | Full system CRUD, department/user/role management, analytics |
| `staff.elena` | `employee` | Service requests, technician dispatch, work orders, devices, citizens, utilities, analytics |
| `tech.kemal` | `technical_staff` | Assigned work orders, IoT devices & readings, analytics |
| `citizen.ali` | `citizen` | Own service requests, own citizen profile & utility bill payments |

---

## SQL Package (`sql/`)

1. **`sql/ddl.sql`** — 9 normalized tables (`roles`, `users`, `municipal_departments`, `citizens`, `utility_accounts`, `devices`, `sensor_readings`, `service_requests`, `work_orders`) with PKs, FKs, `UNIQUE`, `CHECK`, `DEFAULT`, and indexes.
2. **`sql/plpgsql.sql`** — 7 PL/pgSQL blocks:
   - Triggers: `trg_service_request_resolved_at`, `trg_sensor_reading_anomaly`, `trg_work_order_completion`
   - Procedures: `assign_technician(...)`, `record_utility_payment(...)`
   - Functions: `avg_resolution_hours(...)`, `count_overdue_requests(...)`
3. **`sql/dml.sql`** — Seed rows for all 9 tables using scalar lookups (keeps `SERIAL` sequences synchronized) plus commented sample `UPDATE`/`DELETE` examples.
4. **`sql/queries.sql`** — 7 management analytical SQL queries (`JOIN`, `LEFT JOIN`, `LATERAL`, nested subquery + `HAVING`, `GROUP BY`, `SUM`, `AVG`, `COUNT`, `DATE_TRUNC`, `LIMIT`).
5. **`sql/apply_all.sql`** — Combined `ddl.sql` + `plpgsql.sql` + `dml.sql` script for one-paste execution in Supabase SQL Editor or `psql`.

---

## GUI Screens (8 Screens)

1. **Sign In & Register Citizen** — Authenticated session cookie + citizen registration transaction (`users` + `citizens`).
2. **Operations Overview** — Role-scoped KPI cards, PostgreSQL connectivity badge, urgent backlog, sensor anomaly feed.
3. **Service Requests** — Filter/search + CRUD + `Assign tech` drawer (`CALL assign_technician`).
4. **Work Orders** — Filter + CRUD + `Mark completed` action demonstrating completion cascade to parent request.
5. **IoT Devices & Sensor Readings** — Device CRUD + inline sensor reading logger demonstrating anomaly detection and automatic `Alert` status.
6. **Citizens & Utility Accounts** — Citizen profiles & utility account CRUD + `Record payment` drawer (`CALL record_utility_payment`).
7. **Departments, Users & Roles (Admin)** — Full CRUD for `municipal_departments`, `users`, and custom user groups (`roles`).
8. **Analytics & PL/SQL Lab** — Interactive runner for all 7 queries (table + bar chart + SQL inspector) and live `avg_resolution_hours()` / `count_overdue_requests()` evaluators.

---

## Environment & Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start development server with live TypeScript reload |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm start` | Run compiled production server (`node dist/src/server.js`) |
| `npm test` | Run unit, SQL structural, and Supertest API suites |
| `npm run test:db` | Run live PostgreSQL integration tests (`RUN_DB_TESTS=1`) |
| `npm run db:apply` | Apply schema, PL/pgSQL blocks, and seed data (pass `-- --reset` to rebuild) |
| `npm run db:check` | Verify database connectivity, table list, triggers, and routines |
| `npm run db:fingerprint` | Print redacted DSN fingerprint for verifying deployment env vars |

---

## $0/month Cloud Deployment

### Option A: Vercel Hobby + Neon / Supabase
1. Create a free PostgreSQL database on Neon or Supabase and run `sql/apply_all.sql` (or `npm run db:apply` locally with `DATABASE_URL_UNPOOLED` set).
2. Push this repository to GitHub (public repository per CMPE344 submission instructions).
3. Import the repo into Vercel (`vercel.json` routes `/api/*` to `api/index.ts` and serves `public/` statically).
4. Set `DATABASE_URL` and `SESSION_SECRET` in Vercel Environment Variables and deploy.

### Option B: Render Free Web Service
1. Push to GitHub and connect via **New -> Blueprint** (`render.yaml`) or **New -> Web Service**.
2. Build Command: `npm install && npm run build` · Start Command: `npm start` · Health Check: `/api/health`.
3. Add `DATABASE_URL` and `SESSION_SECRET` environment variables.
