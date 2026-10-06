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
- **The dataset's own date is in the database**, not in a source file: `dataset_meta`
  row `snapshot_date`. `hydrate()` reads it *before the rebuilds* and calls `setToday()`,
  which **mutates** `TODAY` in `src/lib/format.js` (`TODAY.setTime`) — never reassigns it,
  for the same reason the data arrays are filled in place. The literal in `format.js` is
  only the fallback for a database with no such row.
- **Auth**: `src/context/AuthContext.jsx` uses Supabase `signInWithPassword`, then reads
  `public.profiles` for the role. The `DEMO_USERS` / `DEMO_PASSWORD` fallback in
  `src/data/roles.js` is `import.meta.env.DEV`-only — production accepts real accounts only.
- **Backend**: `supabase/schema.sql` (all tables, RLS, `is_admin()`, role-escalation guard,
  signup trigger) + `supabase/seed/NN_seed.sql` (**generated** — never edit by hand,
  gitignored, run in order).

## Data architecture (Phase 2, 2026-08-16)

**Seeded reference tables** — `trades`, `projects`, `item_master` (7,378),
`inventory` (764), `ledger` (299), `safekeeping_soh` (243), `safekeeping_incoming` (368),
`safekeeping_outgoing` (342), `delivery_tracker` (355, of which 87 are warehouse-bound and shown),
`audit_ratings` (350), `audit_findings` (592), `audit_counts` (3,244). Read by all signed-in users;
**only admins write**. Counts are the 2026-09-28 snapshot — they change with every
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

**Refreshing the data from a new warehouse workbook — TWO paths, and the stock
workbook now has a shorter one.**

*In the app (stock workbook only, 2026-10-06 onwards).* Admin → **Import Data**
(`/import`) uploads the monthly inventory workbook straight into Postgres: parse and
preview in the browser, stage into `import_rows`, then one `import_commit(uuid)` RPC
that swaps `inventory` / `ledger` / `safekeeping_*` inside a single transaction and
moves `dataset_meta.snapshot_date` with them. No node, no SQL editor, no `TODAY` edit.
This is the routine monthly path.

*On the command line.* Still the way to regenerate `/private-data/` — needed to re-seed
a database from scratch, and the only path for the delivery tracker and the audit report.

```bash
npm run import -- "sample/<stock workbook>.xlsx"            # inventory / ledger / safekeeping
npm run import:delivery -- "sample/<delivery workbook>.xlsx" # delivery_tracker only
npm run import:audit -- "sample/<audit workbook>.xlsx"       # audit_ratings / findings / counts
npm run seed                                                 # /private-data/*.js -> supabase/seed/NN_seed.sql
```

**THE READING RULES LIVE IN `src/lib/snapshotRules.js`, SHARED BY BOTH PATHS.** They
were lifted out of `import-snapshot.mjs` on 2026-10-06 precisely so there can never be
two answers for one workbook — every rule in that file exists because a real workbook
broke something, usually silently. `src/lib/xlsx.js` holds the ZIP+XML parse with no
I/O and no decompressor; node injects `inflateRawSync` (`scripts/lib/xlsx.mjs`,
synchronous, unchanged signature) and the browser injects `DecompressionStream`.
**Add a rule in one place only.** Changing a row shape means changing it in three:
`snapshotRules.js`, the mapper in `src/lib/importSnapshot.js`, and the column list in
`import_commit` in `schema.sql`.

**Three importers, because they read three different files.** `import-snapshot.mjs`
handles the monthly stock workbook; `import-delivery-tracker.mjs` handles the OSM Delivery
Tracker, whose sheet is hierarchical (trade > item > project > batch > line item, with the
batch level merged and carrying the target date); `import-audit-report.mjs` handles the
Audit Report Data Source, reading three of its ten sheets and skipping the five hidden ones
(they are partial working copies of the same records — reading them would double-count).
Each documents its own reading rules and prints a report — read the report, it is where a
bad workbook shows up. Only run the one whose source actually changed.

After a command-line STOCK import, **re-run `supabase/schema.sql`** and paste the seed
parts into the Supabase SQL Editor **in order** (they are split only because the editor
rejects a submission over ~1 MB). `TODAY` no longer needs a hand edit — it follows
`dataset_meta.snapshot_date`, which the seed sets. The in-app importer sets it directly.

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
| 6 | Transactional writes still go nowhere | Add Material and movement entry are read-only UI; only Safekeeping Requests persist. Phase 3. (Reference data *is* now writable — admin → Import Data replaces the whole stock dataset, 2026-10-06.) |
| 7 | `supabase/migrations/2026-10-06_in_app_import.sql` not yet run | Until `schema.sql` is re-run on the live project, Import Data parses a workbook and then reports the database is not ready. |

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

**Audit's layout rule (2026-10-05): no grids of equal tiles.** Each sub-view opens with
one headline panel (`.au-hero`) — a ring and a verdict, the detail that explains it
beside, supporting figures on a hairline-separated strip underneath — and everything
below it is an asymmetric 7:5 pair (`.au-split`) or a full-width table. Six equally
weighted KPI boxes say every number matters the same amount, which in an audit programme
is never true. Keep new cards off the 50/50 grid, and **never print the same figure in a
panel twice** (the ring and its headline, a sentence and the strip under it) — that is
the failure mode this layout keeps producing, and it reads as a discrepancy.

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
