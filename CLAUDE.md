# CLAUDE.md — Megawide WMS (PRC-WH APP)

Working notes for Claude Code sessions on this repo. This file is the part that must be
true every turn — workflow, architecture, security rules, current state. Session history
lives in `docs/CHANGELOG.md`; keep both current.

## Project

Warehouse Management System for Megawide Construction (Central Warehouse Taytay).
Vite + React 18 + React Router + Recharts + Supabase JS. Brand: Megawide Red `#ee3124`,
Montserrat / Barlow Condensed, light + dark mode.

## Standing workflow (agreed 2026-08-13)

1. Every prompt that changes anything → append an entry to **`docs/CHANGELOG.md`**
   (newest last). Keep THIS file short: it is re-read in full on every turn, so only
   facts that stay relevant belong here, never a narrative of what a session did.
2. Commit after every prompt (`git add -A && git commit`), then push to `origin`.
3. Never commit `.env` (gitignored). Only `.env.example` holds placeholder/public values.

## Current state

- **Data**: **Postgres (Supabase) only.** Loaded before first render by `src/lib/hydrate.js`.
  There is NO bundled fallback any more — `src/data/*.js` are empty shells since the repo
  went public (2026-08-16). If the load fails the app has no data and says so:
  `hydrationStatus.source === 'empty'` with a reason, surfaced on Settings → *Data source*.
  Master copies of the dataset live in `/private-data/` (gitignored).
- **Auth**: `src/context/AuthContext.jsx` uses Supabase `signInWithPassword`, then reads
  `public.profiles` for the role. The `DEMO_USERS` / `DEMO_PASSWORD` fallback in
  `src/data/roles.js` is `import.meta.env.DEV`-only — production accepts real accounts only.
- **Backend**: `supabase/schema.sql` (all tables, RLS, `is_admin()`, role-escalation guard,
  signup trigger) + `supabase/seed/NN_seed.sql` (**generated** — never edit by hand,
  gitignored, run in order).

## Data architecture (Phase 2, 2026-08-16)

**Seeded reference tables** — `trades`, `projects`, `item_master` (7,378),
`inventory` (827), `ledger` (295), `safekeeping_soh` (189), `safekeeping_incoming` (305),
`safekeeping_outgoing` (287), `delivery_tracker` (355, of which 87 are warehouse-bound and shown),
`audit_ratings` (350), `audit_findings` (592), `audit_counts` (3,244). Read by all signed-in users;
**only admins write**. Counts are the 2026-09-07 snapshot — they change with every
import, so treat them as "roughly this size", not as a contract.

**The audit dataset is a THIRD dataset, not part of the stock one.** The three
`audit_*` tables come from the Project Warehouse Audit programme — projects audited on a
date, scored against five weighted criteria — and share nothing with inventory but a
project name. They are joined to each other only by `(audit_date, project)`, which is
what an "audit" is. `src/data/audit.js` holds every view model as a pure function of a
row set; `src/data/auditCriteria.js` holds the audit form's own criteria order and
wording (the instrument, not the results — the only audit file NOT loaded from Postgres,
for the same reason `trades.js` is not). Project Type lives only on the findings rows and
is rebuilt there into a per-audit map, because the ratings table has no such column and
the Power BI report resolves it through a relationship.

**Empty transactional tables** — `movements`, `reservations`, `purchase_requests`,
`material_requests`, `approvals`, `safekeeping_requests`, `audit_log`. Any signed-in user
reads and inserts; only admins update/delete. `audit_log` has no update/delete policy at
all. Every row carries `created_by` (uuid) and `created_by_email`.

**Why the loader looks the way it does.** `src/data/*.js` compute their view models
eagerly at import and ~20 pages import them directly. Rather than rewrite every page to
await a query, `src/lib/hydrate.js` fetches all tables and fills the exported arrays
**in place** (never reassigns them), then calls each module's `rebuild*()` to recompute
derived exports. It runs once in `src/main.jsx` *before* `ReactDOM.render`, so no page
needs a loading state. `AuthContext.signIn` re-runs it after login, because the tables
are RLS-gated and the pre-render pass returns nothing without a session.

Consequence: **arrays in `src/data/` must be mutated, never reassigned.** A
`export const x = [...]` that gets replaced instead of refilled silently breaks hydration.

**Refreshing the data from a new warehouse workbook — the whole loop:**

```bash
npm run import -- "sample/<stock workbook>.xlsx"            # inventory / ledger / safekeeping
npm run import:delivery -- "sample/<delivery workbook>.xlsx" # delivery_tracker only
npm run import:audit -- "sample/<audit workbook>.xlsx"       # audit_ratings / findings / counts
npm run seed                                                 # /private-data/*.js -> supabase/seed/NN_seed.sql
```

**Three importers, because they read three different files.** `import-snapshot.mjs`
handles the monthly stock workbook; `import-delivery-tracker.mjs` handles the OSM Delivery
Tracker, whose sheet is hierarchical (trade > item > project > batch > line item, with the
batch level merged and carrying the target date); `import-audit-report.mjs` handles the
Audit Report Data Source, reading three of its ten sheets and skipping the five hidden ones
(they are partial working copies of the same records — reading them would double-count).
Each documents its own reading rules and prints a report — read the report, it is where a
bad workbook shows up. Only run the one whose source actually changed.

After a STOCK import, update `TODAY` in `src/lib/format.js` to the new `SNAPSHOT_DATE`.
Then **re-run `supabase/schema.sql`** and paste the seed parts into the Supabase SQL
Editor **in order** (they are split only because the editor rejects a submission over
~1 MB).

**Re-running `schema.sql` is the answer to every schema error, and it is the whole
answer.** It ends with a CATCH-UP block replaying every column change any migration has
ever made, idempotently — because `create table if not exists` skips an existing table
*columns and all*, so before that block a database created a month ago could re-run
schema.sql, report success, and still be missing a column. That is exactly what killed
the 2026-09-21 seed run (`column "designation" of relation "delivery_tracker" does not
exist`, taking `audit_ratings` down with it, since both live in part 04).

So: **adding a column means TWO edits to `schema.sql`** — the `create table` (for a new
database) and one line in the CATCH-UP block (for every database that already exists) —
plus the dated file in `supabase/migrations/`, which stays as the record of *why*.

Both importers are committed for the same reason: the July snapshot's importer was ad hoc
and lost, and so was the first delivery-tracker one. Never read a workbook by hand — add
the rules to the script so the next month is one command.
- **Git**: branch `main`, single clean root commit (history reset 2026-08-16).
- **Deploy**: GitHub Pages project site at `https://prcdepartment.github.io/prc-wh/`,
  built by `.github/workflows/deploy.yml` on every push to `main`.

## Deployment (GitHub Pages)

- **Repo**: `prcdepartment/prc-wh` · **Branch**: `main` · **Pages source**: GitHub Actions.
  (Moved 2026-08-16 from `ljrondina/Warehouse-Management`.)
- **Base path**: `vite.config.js` sets `base = '/prc-wh/'` for production. **It must equal
  the repository name.** Rename the repo and this must change in the same commit, or every
  asset 404s and the page loads blank.
  (`BASE_PATH=/ npm run build` to build for a root-level host instead).
  `BrowserRouter basename={import.meta.env.BASE_URL}` in `src/main.jsx` matches it, and
  `src/components/Logo.jsx` prefixes `public/` assets with `import.meta.env.BASE_URL`.
- **SPA routing**: Pages has no rewrites, so `public/404.html` encodes the requested path into
  a query string and `index.html` restores it with `history.replaceState` before React Router
  boots (rafgraph/spa-github-pages technique).
- **Secrets**: repo → Settings → Secrets and variables → Actions → `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`. Vite inlines these at build time; the anon/publishable key is
  public by design — RLS is the actual protection.
- **Caveat**: a Pages site on a free account is publicly reachable. Access control rests
  entirely on Supabase auth + RLS.

## Known blockers for a real production deployment

| # | Issue | Why it matters |
|---|-------|----------------|
| ~~1~~ | ~~Demo-password fallback in `AuthContext.signIn`~~ | **Fixed 2026-08-16** — gated behind `import.meta.env.DEV`. Production builds accept only real Supabase credentials. |
| ~~2~~ | ~~`switchRole()` lets any user change their own role client-side~~ | **Fixed 2026-08-16** — no-op in production, and the Switch Role button is hidden. |
| ~~3~~ | ~~All business data lives in JS files~~ | **Fixed 2026-08-16** — all data in Postgres. The JS modules are empty shells; no data ships in the bundle. |
| ~~4~~ | ~~Role permissions enforced only in the UI~~ | **Fixed 2026-08-16** — RLS on every table, plus a trigger that blocks self-escalation to admin. |
| 5 | No CI, no tests, no error boundary | |
| 6 | Writes still go nowhere | Add Material and movement entry are read-only UI; only Safekeeping Requests persist. Phase 3. |

## Commands

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview
```

## Dashboard tabs

`src/pages/Dashboard.jsx` is a shell: a shared toolbar, a tab strip, and one tab
component per dataset. `Warehouse` (the default) and `Safekeeping` run off the stock
pool the shell filters with `FilterSearch`; `Audit` sets `ownsFilters: true` on its TAB
entry, which swaps the shared search bar for a spacer so the tab can carry its own
filter row — an item-code token cannot narrow an audit finding, and offering one would
imply the two datasets are the same. `Excess` and `Scrap` are still locked placeholders.

The Audit tab's three sub-views are the three visible pages of
`MCC. PRC. WM. Project Warehouse Audit Report. 2026.pbix`, and **every figure was
reconciled against that report's own rendered numbers** (unfiltered and under each
Project Type split) before any of it was drawn — see the 2026-09-21 changelog entry for
the reconciliation table and for the one visual that deliberately does not match.

## Changelog

Moved to **`docs/CHANGELOG.md`** on 2026-09-10. This file is re-read in full on every
turn; the changelog was ~51,000 tokens of that and grew with each prompt, so it now
lives on its own and is opened only when history is actually needed.

**The standing workflow has not changed** — every prompt that changes anything appends
its entry to `docs/CHANGELOG.md`, and every prompt still ends in a commit and a push.
Append to the END of that file, newest last, matching the existing `### YYYY-MM-DD —
Session: <what>` heading style.

Read it (or `grep` it) before assuming how something came to be the way it is: it
carries the reasoning behind most non-obvious decisions in this codebase, the bugs that
have already been fixed once, and the measurement traps that have cost several sessions
each.
