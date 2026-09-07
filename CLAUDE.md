# CLAUDE.md — Megawide WMS (PRC-WH APP)

Working notes for Claude Code sessions on this repo. Keep this file current: every
prompt that changes something should add a changelog entry below and be committed.

## Project

Warehouse Management System for Megawide Construction (Central Warehouse Taytay).
Vite + React 18 + React Router + Recharts + Supabase JS. Brand: Megawide Red `#ee3124`,
Montserrat / Barlow Condensed, light + dark mode.

## Standing workflow (agreed 2026-08-13)

1. Every prompt that changes anything → update the **Changelog** below.
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
`inventory` (827), `ledger` (214), `safekeeping_soh` (178), `safekeeping_incoming` (372),
`safekeeping_outgoing` (262), `delivery_tracker` (27). Read by all signed-in users;
**only admins write**. Counts are the 2026-09-02 snapshot — they change with every
import, so treat them as "roughly this size", not as a contract.

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
npm run import -- "sample/<new workbook>.xlsx"   # xlsx  -> /private-data/*.js
npm run seed                                      # /private-data/*.js -> supabase/seed/NN_seed.sql
```

Then update `TODAY` in `src/lib/format.js` to the new `SNAPSHOT_DATE`, and paste the seed
parts into the Supabase SQL Editor **in order** (they are split only because the editor
rejects a submission over ~1 MB). `scripts/import-snapshot.mjs` documents every reading
rule and prints a report — row counts, valuation, how many lines it could not price and
how many carry a recorded location. Read that report; it is where a bad workbook shows up.
(The old hand-written `seed_inventory.sql` had drifted to a different snapshot and was
missing five columns; generating removes that failure mode. The import step is generated
for the same reason — the July snapshot's importer was ad-hoc and lost.)
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

## Changelog

### 2026-08-13 — Session: push & deploy planning
- Created this `CLAUDE.md`; recorded standing workflow and the production-readiness gaps.
- Committed pending working-tree changes (DataSheet, DeliveryTracker, ui, format,
  SafekeepingTab, styles) from the date-format / dashboard work.
- Next: create GitHub remote, decide host, harden auth, migrate data to Supabase.

### 2026-08-16 — Session: GitHub Pages deploy + auth hardening
Decisions: host on **GitHub Pages** as `ljrondina/Warehouse-Management`; remove the demo-password
fallback now; keep the existing Supabase project `ahwfkdgvkmhnrlmhumgn`.

- `vite.config.js` — production `base` of `/Warehouse-Management/` (override via `BASE_PATH`).
- `src/main.jsx` — `BrowserRouter basename={import.meta.env.BASE_URL}`.
- `src/components/Logo.jsx` — `public/` image paths prefixed with the base path (they were
  hard-coded to `/`, which 404s under a Pages sub-path).
- `public/404.html` + `index.html` — SPA deep-link redirect shim for GitHub Pages.
- `.github/workflows/deploy.yml` — build on push to `main`, publish `dist/` to Pages; reads
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from repo Actions secrets.
- `src/context/AuthContext.jsx` — demo-password fallback and the "no Supabase configured"
  sign-in path are now `import.meta.env.DEV`-only; `switchRole()` is a no-op in production and
  exposes `canSwitchRole` on the context.
- `src/components/Layout.jsx` — Switch Role control hidden in production builds.
- `src/pages/Login.jsx` — no credential prefill and no demo quick-sign-in panel in production.
- Verified `npm run build` succeeds and emits the correct `/Warehouse-Management/` asset paths.
- Next: run `supabase/schema.sql`, create the real user accounts, then Phase 2 (move
  `src/data/` into Postgres tables with RLS).

### 2026-08-16 — Session: Phase 2, data into Postgres
Decisions: transactional tables **start empty** (no synthesized rows carried over);
scope = schema + seeds + read path; **admin-only writes** on reference data.

- `supabase/schema.sql` — rewritten: 15 tables, RLS on all of them, an `is_admin()`
  helper, and a `guard_role_change()` trigger. That trigger closes a real hole: the
  existing "a user may update their own profile" policy let anyone set their own role
  to admin, because a USING clause cannot see which column changed.
- `scripts/generate-seeds.mjs` + `npm run seed` — generates `supabase/seed_data.sql`
  (1,622 rows) from the JS modules. Deleted the stale hand-written `seed_inventory.sql`,
  which had drifted to a different snapshot and was missing five columns.
- `src/lib/hydrate.js` — new. Pages through PostgREST's 1000-row cap, maps snake_case →
  camelCase, fills the data arrays in place, falls back to the bundled snapshot on any
  failure, and records the outcome in `hydrationStatus`.
- `src/data/{insights,safekeeping,deliveryTracker,projects,ledger}.js` — derived exports
  are now built by `rebuild*()` into arrays filled in place. `LEDGER_OLDEST`/`LEDGER_NEWEST`
  became `LEDGER_SPAN`: number exports cannot be re-derived after hydration.
- `src/data/transactions.js` — synthesized movements/reservations/PRs/approvals/audit
  replaced by empty arrays fed from `setTransactions()`.
- `src/context/SafekeepingContext.jsx` — requests persist to `safekeeping_requests`
  (optimistic insert, rolled back if the insert fails) instead of dying on refresh.
- `src/main.jsx` — hydrate before render, via `.then()` rather than top-level await
  (TLA would force the build target up to es2022 and drop older browsers).
- `src/pages/Settings.jsx` — "Data source" card: Postgres vs bundled snapshot, with counts.
- Verified: build passes; all 14 routes render with zero console errors against empty
  transactional tables; the emptied pages show empty states rather than crashing.
- Next (Phase 3): wire writes — Add Material, movement entry, approvals — with audit
  logging; then CI and an error boundary.

### 2026-08-16 — Session: first deploy attempt, hosting decision
- Pushed to `origin` (https://github.com/ljrondina/Warehouse-Management), branch `main`.
  The Pages workflow ran and failed at `actions/configure-pages` with "Get Pages site
  failed … Not Found". **Cause: the repo is private, and GitHub Pages does not serve
  private repositories on a free account.** Not a misconfiguration — retrying won't help.
- Bumped `actions/checkout` → v5, `actions/setup-node` → v5, build Node → 22, clearing
  the Node 20 deprecation warning.
- **Hosting decision: make the repository public.** Vercel (free, private repo, optional
  site password) was recommended and declined.
- **Blocker found while planning that:** going public exposes the entire commit history,
  not just the current tree. Commits 3fceb5c..dd741e2 contain `src/data/inventory.js`
  (unit prices, valuations) and `supabase/seed_data.sql`. Deleting the files now would
  not help — they stay readable in history.
- **Agreed sequence** (user chose to sequence it this way, deliberately):
  1. Run `schema.sql` + `seed_data.sql` in Supabase and confirm the data is really there.
  2. Only then: strip the bundled dataset from `src/data/*`, so the published bundle
     ships empty and fills from Postgres after login; move `seed_data.sql` and the
     source data modules out of the repo (gitignored, kept locally); replace the git
     history with a single clean root commit.
  3. Then make the repo public and re-run the Pages workflow.
- **Bug fixed same session:** `guard_role_change()` rejected role changes made from the
  SQL Editor (`auth.uid()` is null there), which made the first admin impossible to
  create — the guard was unbootstrappable. It now exempts null-uid callers (SQL Editor,
  migrations, service_role); anonymous browser clients are still stopped earlier by the
  `profiles_self_update` policy, so the guard is unchanged for real user sessions.
### 2026-08-16 — Session: strip confidential data for a public repository

Database confirmed working first: `schema.sql` + `seed_data.sql` loaded, a real
Supabase account signs in, Settings reports Postgres live.

**Found while auditing what would become public:** `sample/` contained two tracked
real company documents — an 8 MB engineering drawing (`EPC. ENG. BIM. TCW101 FCD EE
Rev00`) and a real packing list (`DN015490_3641_1855`). Removed from tracking, kept
on disk, and `sample/` plus `*.pdf` / `*.xls*` / `*.csv` are now gitignored.

- **`/private-data/` (gitignored)** now holds the master copies of the real dataset:
  `inventory.js`, `ledger.js`, `safekeepingSheets.js`, `deliveryTrackerSheet.js`,
  `itemMaster.js`, `projects.js`. This is what `npm run seed` reads.
- **`src/data/*` are now empty shells** — same exports, no rows, with a comment saying
  where the data went. `trades.js` stays populated: generic construction taxonomy,
  nothing confidential. `supabase/seed_data.sql` is gitignored (it *is* the dataset).
- **`item_master` is now a table** (7,378 rows). It was an 849 KB bundled module;
  `src/components/ItemLookup.jsx` fetches it from Postgres on first use instead, and
  degrades to plain typing if the fetch fails.
- **No more fallback.** `hydrate.js` fills unconditionally and reports
  `source: 'empty'` with a reason when it cannot load. Settings shows "No data loaded"
  in red rather than a reassuring "Offline copy". The Login hero stats are hidden when
  there are no items — three confident zeroes read as an empty warehouse.
- Bundle dropped 1,546 KB → 903 KB. Verified `dist/` contains no project name, item
  code, brand or price; the only hits were form placeholders, and the one real project
  name used as an example was genericised.

**Remaining step — history reset, not yet done.** Commits carrying the dataset and the
two PDFs are still in the history, so the repo cannot go public until it is replaced
with a single clean root commit. Full backup taken first at
`private-data/history-backup-before-public.bundle` (12.9 MB, gitignored) — restore with
`git clone history-backup-before-public.bundle`. The commands were blocked by the
tooling's destructive-action guard and need to be run by the user.

Order after that: make the repo public → Settings → Pages → Source: GitHub Actions →
re-run the workflow.

### 2026-08-16 — Session: history reset landed; seed split for the SQL Editor

- History reset done by the user and **verified from outside**: the repo is public,
  has exactly one commit, and `sample/*.pdf` and `seed_data.sql` both 404 on
  raw.githubusercontent.com. `src/data/inventory.js` serves the empty shell.
- **Pages 404 diagnosis**: both workflow runs failed. Run #2 was the force-push of the
  clean commit and failed *before* Pages was enabled; enabling the source afterwards
  does not retrigger a build, so nothing has ever been published. Fix is to re-run the
  workflow manually (`workflow_dispatch` is already in the file).
- **Seed no longer fits the SQL Editor.** Adding `item_master` took the file to 1.09 MB,
  over Supabase's ~1 MB submission cap. `generate-seeds.mjs` now emits statement-aligned
  parts into `supabase/seed/NN_seed.sql`, capped at 400 KB each (currently 3 files), to
  be pasted in order. `truncate public.ledger` sits before the ledger inserts and the
  parts are ordered, so a full in-order run stays idempotent.
- `supabase/seed/` is gitignored — verified with `git check-ignore`. **Nothing in that
  folder may ever be committed: it is the dataset.**

### 2026-08-16 — Session: Inventory module — blank insight cards, mock-data audit

**Symptom:** on the live site the Inventory dashboard showed real KPIs, real charts and
a real trade distribution, but *High Stock*, *High Value*, *Low Stock*, *Fast Moving*
and *Dead Stock* were all empty. The data was not "reset" — it was never read.

**Cause:** `src/pages/dashboard/InventoryTab.jsx` built `INSIGHT_ROWS` at **module
scope**. `App.jsx` imports `Dashboard` eagerly and `Dashboard` imports `InventoryTab`
eagerly, so that top-level code ran during the import graph — i.e. while `items` was
still the empty shell, *before* `hydrate()` resolved and again ahead of the post-sign-in
re-hydration. The five lists were therefore frozen at zero rows for the life of the tab.
Everything else on the tab (`KPIS(pool)`, `movementCombinedSeries`, `byTradeL1`) is
called **during render**, which is why only these five cards were blank. Pages that call
the same helpers inside a component (`LowStock`, `Reports`, `Analytics`) were unaffected
— they are also lazy-loaded, so they mount well after hydration.

**Fix:** `INSIGHT_ROWS` is now `useMemo(buildInsightRows, [items.length])` inside the
component. Same memoisation (the lists still ignore the filter bar), but it recomputes
after every hydration pass. `items` is now imported from `../../data/insights`.

**Mock-data audit requested this session.** Confirmed genuinely from Postgres: all six
quantity KPIs, the three value KPIs, the composition battery, the trade/item-group
donut, the five insight lists, Low Stock, Reports and the Inventory table. Confirmed
**not** real, and left in place for now:
- `Analytics.jsx` — `Stock Turnover 2.4x` and `Warehouse Utilization 78%` are hard-coded
  literals, and all four trend arrows (`3.2`, `5.1`, `1.4`, `-2.3`) are invented.
- `insights.js` `TRENDS` — hard-coded percentages. Currently unused by the dashboard.
- Movement History: incoming/outgoing bars are the real ledger, and the stock curve is
  back-cast from it, but the **available/reserved split** is modelled (the sheets carry
  no reservation history) and buckets older than the ledger window are **projected** at
  the recorded daily average, not measured.
- The high-value "secure cage" (Zone HV / rack CAGE, top 36 by line value) is assigned
  in code, not a real warehouse location.

Verified `npm run build` passes.

### 2026-08-16 — Session: Analytics page — every figure now derived

Removed the last fabricated numbers in the app. Previously `Analytics.jsx` showed
`Stock Turnover 2.4x` and `Warehouse Utilization 78%` as string literals, four
hard-coded trend arrows (`3.2`, `5.1`, `1.4`, `-2.3`), and two "Last 6 months"
charts fed by a `trend(base, seed)` helper that shaped a fake curve out of the
current total. None of it touched the ledger.

**New `analytics(pool)` in `src/data/insights.js`.** One function, computed per
hydration, returning `null` (never zero) for anything the data cannot support:
- `avgCostByCode(pool)` — weighted average unit cost per item code. The ledger
  records only a code, while inventory carries several priced lines per code, so
  flows are priced at the code's blended cost to stay consistent with the valuation
  they are wound back from.
- `valueAt(t)` — valuation at day-offset `t`: today's value undone by every recorded
  flow since. Same back-cast technique as the Movement History stock curve.
- **Stock Turnover** = cost issued over the ledger window ÷ average of opening and
  closing valuation, annualised by `365 / windowDays`. Trend compares the recent half
  of the window against the earlier half.
- **Inventory Value trend** compares `valueAt(newest)` with `valueAt(newest + 30)` —
  anchored to the ledger's newest recorded day, **not to today**. Anchoring to today
  would compare the current value against itself whenever the sheets lag, and report
  a confident 0%.
- **Warehouse Utilization is gone.** Nothing in the system records rack capacity —
  zones, racks and bins are derived from the item rows in `rebuildItems()` and
  `StorageMap.jsx` — so utilisation is not computable at any accuracy. That tile now
  shows **Stock Availability** (`available / total`), which is real. It carries no
  trend arrow: there is no reservation history to compare against.
- **Non-Moving Value** was reading `overstock()` (`totalQty > minLevel * 6`), which is
  overstock, not non-movement. Now reads `issueFrequency <= 1`, matching its label and
  the Dead Stock card.
- Both trend charts now plot `valueSeries(6)` and the real monthly totals from
  `movementCombinedSeries`. Buckets predating the ledger repeat the opening valuation
  rather than sloping; the card subtitles say "back-cast from the ledger".
- The page header now states the ledger's coverage and how stale the newest movement
  is, so no reader assumes the comparison reaches the present.
- Deleted the unused hard-coded `TRENDS` export from `insights.js`.

**Verified** by bundling `insights.js` with esbuild and running it under Node against a
synthetic two-item, three-row fixture: turnover, the back-cast series, the anchored
value trend, availability and non-moving value all matched hand-computed expectations.
`npm run build` passes.

**Mock data remaining in the app after this session:** the Available/Reserved split in
Movement History (modelled — no reservation history exists) and the high-value secure
cage assignment (top 36 by line value, assigned in code, not a real location).

### 2026-08-16 — Session: Inventory module UI revamp (sub-views, composition, donut)

Three changes to the Inventory dashboard, plus the data functions they needed.

**1. The six quantity KPI cards are gone; their figures live in the composition card.**
`src/components/InventoryComposition.jsx` (new) replaces `StockBattery.jsx` (deleted —
it had no other caller). The gauge still shows the Available/Reserved split of stock on
hand; beside it sit six tiles — Total, Available, Reserved, Incoming, Outgoing, Damaged
— each with its role colour and icon, a hover description, and a click that opens the
existing `KpiListModal` drawer filtered to that column. `COMPOSITION_STATS` in that file
is the single definition of the six (field, role, icon, tooltip); `InventoryTab` no
longer carries its own `QTY_CARDS`.

**2. The distribution donut labels its slices in place.** `DistributionDonut` takes
`leaderLines`; the legend is dropped and each slice gets a leader line to its name and
percentage. Recharts' own `label`/`labelLine` places labels independently and they
collide on a 9-slice donut, so `makeLeaderLabel` lays them out as a whole: mid-angles
computed up front, split into left/right columns, spread to a 15px minimum and clamped
to the chart box. That requires deterministic geometry, hence the fixed
`startAngle={90} endAngle={-270}` and `paddingAngle={0}` in leader mode — a padding
angle makes recharts redistribute the sweep and every label drifts off its slice.
Slices under 2% are left unlabelled with a note saying how many (an unlabelled slice
must not read as missing data).

Two layout traps found while verifying and fixed:
- The ring is sized from the measured container (`useElementWidth`), not a constant: a
  126px radius that fits a desktop card pushes its labels off a phone screen. Below
  460px the donut falls back to the legend entirely.
- That measurement reads the OUTER `.donut-wrap`, never `.donut-chart`. The `leader`
  class changes `.donut-chart`'s max-width, so measuring it latched: once it fell back
  to the legend the narrower box kept the condition false and it could never return.
- `.donut-wrap.wide` now stacks under 900px. The Inventory donut asks for `wide` at
  every size, and the old rigid `flex: 0 0 360px` overflowed its own card on a phone.

**3. The tab is split into Overview / Insights / Activity**, held in `?view=` so each is
linkable and Back works between them. `Dashboard.selectTab` clears `?view` when leaving
Inventory. Order within each view puts visualisations before lists.
- *Overview* — the three value KPIs, then Inventory Composition, then Distribution.
- *Insights* — ABC analysis and Aging analysis (both follow the filter bar), then the
  five ranked lists (whole warehouse, unfiltered — labelled as such, since mixing the
  two behaviours silently was the confusing part).
- *Activity* — a totals strip, Movement History, Net Inventory Change, then Top
  Incoming / Top Outgoing.

**New in `src/data/insights.js`, all derived from Postgres rows:**
- `abcAnalysis(pool)` — Pareto by line value. Class boundaries use the cumulative share
  *before* the line is added, so the line straddling 80% lands in A and class A is
  guaranteed to cover ≥80% of value. Lines with no price are excluded, not dumped in C:
  a zero there means "no price recorded", not "cheap". Returns the per-line curve.
- `agingAnalysis(pool)` — six bands over `lastMovementOffset`, a real column, so aging
  works for lines the ledger window never reaches. Surfaces the over-90-day value.
- `ledgerActivity(pool, granularity)` — RECORDED movement only, deliberately unlike
  `movementCombinedSeries`, which projects pre-ledger buckets so its stock curve does
  not draw a cliff. Buckets outside the recorded window report zero and carry
  `covered: false`.

**New charts** in `charts.jsx`: `ParetoCurve`, `AgingBars`, `NetChangeChart`.
`NetChangeChart` shades uncovered stretches and prints "no ledger record" over them —
an uncovered bucket has a net of zero, and a zero-height hollow bar draws nothing, so
"we have no record" and "nothing moved" would have looked identical. The shading is
computed as contiguous runs rather than one span: the ledger window is contiguous, so
what falls outside it is a leading and/or trailing stretch, and one span across both
would have wrongly greyed out the covered middle.

**Supporting changes:** `Card` now forwards unrecognised props to its root element, so
`data-tour` anchors attach without a wrapper div that would break grid row sizing.
`NoData` (in `InventoryTab`) is used wherever a source is genuinely absent, instead of
an empty chart that reads as "all zeroes". The guided tour gained `search` on a step,
`Tour.jsx` compares pathname+search rather than pathname alone, and the steps were
rewritten for the new structure (two new steps: the sub-views, and Activity).

**Verified in a browser against a temporary local fixture** (240 lines, 700 ledger rows;
the fixture and its `main.jsx` hook were deleted afterwards — the dev machine has no
Supabase session, so the dashboard would otherwise render empty):
- ABC returned A 80.14% / B 14.98% / C 4.88% of value with all 240 lines classified —
  the ≥80% guarantee holds. Aging bucketed all 240 with none missing.
- Donut: 9 slices, 9 labels, minimum column gap 42.5px, nothing clipped at 1440px;
  clean fallback to the legend at 478px; no horizontal scroll at 375px.
- Clicking the Reserved tile opened the drawer with 232 materials.
- Year granularity marked 2022–2025 uncovered and shaded them; month granularity
  correctly treated a partially-overlapping February as covered.
- `abcAnalysis([])`, `agingAnalysis([])`, an unpriced-only pool and a pool with no
  movement dates all return `null`; `ledgerActivity([])` reports `hasLedger: false` —
  these are what drive the NoData panels.
- Dark mode renders all three new charts; Analytics and the Safekeeping donut (legend
  mode) are unaffected.

`npm run build` passes.

**Mock data remaining in the app after this session:** unchanged — the Available/Reserved
split inside Movement History (modelled; no reservation history exists) and the
high-value secure cage assignment on the floor plan.

### 2026-08-16 — Session: move to prcdepartment/prc-wh

Site address changes from `ljrondina.github.io/Warehouse-Management` to
`prcdepartment.github.io/prc-wh`. Code side done and committed (NOT pushed until the
repo is actually renamed — pushing first would 404 every asset on the live site):

- `vite.config.js` — production base `/prc-wh/`.
- `public/404.html`, `src/components/Logo.jsx`, `README.md` — path references updated.
- Verified `npm run build` emits `/prc-wh/` asset URLs and the SPA shim keeps
  `pathSegmentsToKeep = 1` (still exactly one repo segment).

User side: create the `prcdepartment` org, rename repo → `prc-wh`, transfer, then
`git remote set-url`, push, re-enable Pages, **re-add the two Actions secrets**
(they do not reliably survive a transfer), re-run the workflow.

**Move completed and verified 2026-08-16.** `prcdepartment/prc-wh` exists, the old repo
returns 301, run #9 on `ecd3827` succeeded, and `https://prcdepartment.github.io/prc-wh/`
returns 200 and routes to `/login`. The two Actions secrets ARE now present — the
deployed bundle contains the Supabase URL and publishable key. The deployed bundle
contains no project name, item code, brand or price. Production build confirmed: no demo
quick-sign-in panel, no credential prefill.

**Note for future confusion:** the **Actions** tab is on the REPOSITORY page, not the
organisation page. An organisation has Settings → Actions (policy only) and no run list.

Remaining before the system is usable end to end: paste `supabase/seed/01..03_seed.sql`
into the SQL Editor in order (the live database still lacks `item_master`, so the Add
Material / Safekeeping lookups will find nothing).

### 2026-08-16 — Session: Overview layout, donut figures, overlay sidebar, mobile pass

**1. Donut labels carry the figure, sized by share.** Each leader label is now two
lines: the category name at a constant 10.5px, and beneath it the quantity (or peso
value) plus the percentage, sized between 10px and 22px by the slice's share of the
ring. Scaled against the LARGEST share present, not against 100% — on a balanced
nine-slice donut every label would otherwise render at the minimum and the emphasis
would say nothing. The ramp is eased off linear (`^0.75`): pure square root compressed
26% and 8% to three pixels apart, pure linear pushed the small slices under a
comfortable reading size. `LABEL_GAP` went 15 → 30 for the second line.

**2. Overview is two cards side by side; the value KPI cards are gone.**
`.overview-grid` puts Composition beside Distribution above 1200px and stacks below it
(under that, two columns push the donut below its leader-label minimum and bounce it
into legend mode). The three value cards were removed: Total Inventory Value and
Reserved Value are the same two figures the composition tiles now show in Value mode,
and Average Value / SKU went with them, as agreed.

**3. The composition card has its own Quantity/Value toggle** — the same control the
donut has. `KPIS()` gained `totalValue`, `availableValue`, `incomingValue`,
`outgoingValue` and `damagedValue`, each the quantity column times unit price, so the
identity total = available + reserved holds for the pesos exactly as it does for the
units. The gauge's split is computed from whichever metric is showing: reserved stock
is not worth the same per unit as available stock, so the value split is genuinely a
different percentage, and drawing one while labelling it as the other would be a quiet
lie. `value` (the recorded `inventoryValue` column) is untouched and still what
Analytics reports.

**4. The available-of-SOH readout is now the card's headline** — `.comp-headline`, the
largest type on the card at 30px, with the total in a smaller weight beside it, a
caption, and Available/Reserved percentage chips underneath.

**5. Sidebar: closed by default, and it overlays instead of resizing the page.** One
piece of state (`open`), starting false. Closed on desktop is the 60px icon rail;
closed on mobile is fully off-canvas. Open is the 240px labelled panel, and on BOTH
breakpoints it now lies over the page — `.main`'s margin is pinned to the rail width
and never changes, so the dashboard underneath does not reflow and its charts do not
re-measure and redraw. A scrim appears at every width (it is a dismissible layer now,
so it also takes the click-outside and Escape closes it).

**Icon alignment** is the reason the two states read as one object: `.nav` and
`.nav-item` carry IDENTICAL horizontal padding in both, and the icon is the first
child in both, so its centre sits at 10 + 10 + 10 = 30px either way — which is also
the centre of the 60px rail. The old rules that centred the collapsed item and shrank
its icon to 17px were removed; each would move the icons on open. There is a comment
in the stylesheet saying so, because it is easy to "tidy" back in.

**6. Movement History always spans the page, legend on the left.** The expand toggle is
gone and `wide` is passed unconditionally. `.movement-wrap.wide .legend-side` is
ordered before the chart, so the reader learns what the six series are before meeting
them stacked on one frame; below 900px it drops beneath the chart as a two-column
strip.

**7. Mobile pass.** Card heads put the title on its own line and give the controls the
full width beneath. Sub-tabs scroll horizontally rather than wrapping. The composition
card stacks the gauge beside the headline at tablet width and above it on a phone; the
tiles go 3-up → 2-up → 1-up, since a peso figure plus its label will not share a
half-width tile without one of them truncating. The tile tooltip pins to the card
below 560px instead of centring on a tile it is wider than. Activity's summary strip
and the aging/ABC band rows narrow the same way.

**Bug found and fixed while verifying:** making `.card-pad` a flex row to centre the
two Overview cards collapsed the donut to zero width and it rendered NOTHING — a
recharts `ResponsiveContainer` has no intrinsic width, so as a bare flex item it
shrinks to nothing, and with `isAnimationActive={false}` that opening zero-sweep frame
is the one that sticks. Both pads now set `width: 100%; min-width: 0` on their child.

Also added: a soft `feDropShadow` on the donut ring (on the Pie, not per Cell — per
Cell each slice casts onto its neighbours and the ring looks striped), tuned separately
for light and dark.

**Verified in a browser** against the temporary local fixture (deleted afterwards,
along with its `main.jsx` hook):
- Overview at 1440px: two cards side by side, no value KPI cards, donut labels at
  22/21/20/17/16/15px following share, nothing clipped.
- Item Group view: 9 slices, 9 two-line labels, zero vertical overlaps, none clipped.
- Sidebar closed → open: width 60 → 240, icon centres 31 → 31 (unchanged), `.main`
  left edge 60 → 60 and content width 1370 → 1370 (page does not move).
- Value toggle: all six tiles and the headline switch to pesos, Available ₱408.9M +
  Reserved ₱73.4M = Total ₱482.4M.
- Movement History: card 1314px wide, legend left of the chart on desktop, below it at
  375px, expand button absent.
- 375px across all three sub-views: no page-level horizontal scroll, nothing truncated.
  (The only element exceeding the viewport is the locked Excess tab inside
  `.dash-tabs`, which is a scroll container by design.)
- No console errors.

**Measurement caveat:** the browser pane was hidden during this session, so CSS
transitions do not advance and screenshots are unavailable. Sidebar widths were
therefore measured with transitions disabled; the end states are correct, but the
open/close animation itself was not observed.

`npm run build` passes.

### 2026-08-16 — Session: strip card sub-headers, fix the Overview desktop layout

**1. Descriptive card sub-headers removed app-wide.** Every `sub=` that restated what a
card showed or explained how to use it is gone — the seven on the Inventory tab, the
Delivery Tracker's, and MaterialProfile's "Repository". Card heads now carry a title,
an icon and their controls, nothing else.

Two of them were not descriptions but data caveats, so those moved under their chart as
a `.card-note` footnote rather than being deleted: Movement History's "available/reserved
split is modelled" and Analytics' "back-cast from the ledger" on both trend charts. The
`sub` props that survive are counts, not prose — MaterialProfile's "12 transactions",
Settings' "7 trades" — which are data the header is the right place for.

**2. Analytics' Trade Distribution now uses leader lines.** It was the last donut still
drawing the old colour-key legend, which is what "the distribution chart still uses the
old legend style" was pointing at — the Inventory Overview donut was already in leader
mode at every desktop width I could measure (verified again this session at 1280, 1440
and 1920). The Safekeeping donut deliberately keeps `hideLegend` and no leader lines: it
is paired with a ranked list of the same breakdown, so labelling the ring too would
print every category twice.

**3. The Overview desktop layout was genuinely broken, and this was the mess.** In the
two-column grid the composition card is ~490px wide, and `.comp-wrap` was a plain flex
row with the tile grid at `flex-basis: 420px`. Gauge (230px) plus tiles (420px) does not
fit 490px, so the tiles wrapped BELOW the gauge — leaving the gauge stranded in a 230px
column with a third of the card empty beside it, and the card 80px taller than the donut
it sits next to (531px vs 448px).

Above 1200px the card now lays out top-to-bottom instead: a horizontal gauge band (tube
beside the headline, which is where the headline reads best anyway) with the six tiles
in a full-width row underneath. Card heights are now 395 vs 448 at 1440px and 461 vs 448
at 1280px.

The tile grid uses `repeat(auto-fit, minmax(150px, 1fr))` rather than a fixed three
columns: the composition column is three tiles wide at 1440 and two at 1280, and forcing
three truncated the longest label on the narrower screen.

**4. The per-tile unit chip is gone.** Printing "units" six times down the card cost the
figures the width they needed — at three-across every tile truncated both its value and
its label. The headline beside the gauge already names the unit once, the card's own
Quantity/Value toggle says which metric is showing, and each tile's title attribute
still carries the exact figure with its unit. "Total Inventory" was also renamed **Total
on Hand** — more accurate for what it counts, and the one label short enough to fit a
third-width tile.

**Verified** against the temporary fixture (deleted afterwards with its `main.jsx` hook):
zero `.card-sub` elements on all three Inventory views and on Analytics; both caveat
footnotes present; Analytics' donut renders 6 leader labels with quantities and nothing
clipped; at 1280/1440 nothing truncates in either Quantity or Value mode (Value tiles
run ₱482.4M / ₱408.9M / ₱73.4M / ₱70.7M / ₱51.7M / ₱6.8M); card-head height is a uniform
59px across every card on Insights and Activity; no horizontal scroll at 375px and the
mobile stacking is unchanged. `npm run build` passes.

### 2026-08-16 — Session: topbar restructure, sidebar simplification, mobile leader lines

**Sidebar — the icon rail is gone.** One state, two positions: the burger either shows
the 240px labelled panel over the page or hides it off-canvas, at every width. `.main`
reserves no width for it at all, so content keeps the same width in both states and the
dashboard never reflows when the nav opens. All the `.app-shell.nav-collapsed` rules and
the `collapsedRail` logic were deleted along with the alignment machinery that existed
only to keep the two states' icons in the same place.

**Topbar — page title left, warehouse right, account behind the avatar.** `pageTitle()`
in `Layout.jsx` derives the title from the route (the dashboard's three tabs are the one
path that carries two names). The warehouse name moved to the right as fixed context and
drops below 1100px. The user's name, department and the separate sign-out button — the
widest thing in the bar — are now inside an avatar dropdown holding the name, department,
role, Account settings and Sign out.

**Consequence, handled: every page carried its own heading that now duplicated the
topbar.** Removed from thirteen pages. Two kept theirs for cause: MaterialProfile's is
the material's description, not a page title, and StorageMap's carried the guided tour's
`floor` anchor, which moved onto the note beneath it. Three pages lost their last `<Icon>`
with the heading, so those imports went too.

**Filter bar** — placeholder copy and the "779 materials" count both removed. The
`resultCount`/`noun` props stay so no caller needed editing.

**Insights — ABC analysis removed**, and Aging takes the slot beside Dead Stock: six
cards in three uniform two-across rows, all 681px wide and within 31px of the same
height. Both cards answer "what is not moving", so they belong together. `abcAnalysis()`
and the `ParetoCurve` chart were deleted rather than left as dead exports. Aging is the
only card on the view that follows the filter bar, so it carries a "current filter" chip
— the lists beside it read the whole warehouse.

**Overview desktop — uniform and scroll-free.** Both cards stretch to the same height
and centre their contents; measured identical at 1440×900 and 1366×768, with no vertical
scrolling at either. Inside the composition card the headline now takes `flex: 1` beside
the tube, which closed a ~150px dead gap at the band's right edge — the gauge band's
edges now line up exactly with the tile row beneath it.

**Donut — leader lines everywhere, full names.** The fixed geometry constants were
replaced by `LEDGER_TIERS`, four width tiers that trade ring size against the room the
two text columns need. Phones get leader lines now (they fell back to the legend before):
at a 324px chart the ring drops to 62px and all six trade names render in full with their
quantities, or all nine item groups with four ellipsised. `maxName` went from a flat 16
to 28 at desktop, so nothing ellipsises there at all. Each tier's `gap` is the label's
own two-line height rather than an arbitrary number — at 25px the bottom two labels in a
column still touched.

**Mobile card heads — the real bug.** `.card-head` inherits `flex-wrap: wrap`, and last
session's mobile rule switched it to `flex-direction: column`. Wrapping in a column
container happens along the COLUMN axis, so the segmented toggles did not drop under the
title: they wrapped into a second column beside it and ran clear off the right edge of
the card (measured right edge 575px against a card ending at 362px). That is what "the
option buttons are a mess" was. `flex-wrap: nowrap` plus `flex: 0 0 auto` on the first
child fixes it; controls now stack under the title, left-aligned to the same edge, inside
the card.

**Mobile page head** — the title moved to the topbar, so this row is just the greeting
and two actions. Both buttons collapse to 36×36 icons below 760px, and the role drops off
the greeting below 520px rather than ellipsising mid-word.

**Verified** against the temporary fixture (deleted afterwards with its `main.jsx` hook):
no vertical scroll at 1440×900 or 1366×768; composition and distribution identical height
and top edge; donut leader labels present at 1440 (6 trades, 9 item groups, none clipped,
none overlapping, none ellipsised) and at a 324px chart (same counts, no clipping, no
overlaps); sidebar closed x=-240 → open x=0 with content width unchanged at 1440 in both;
account menu opens in-viewport with name, department, role and both options; zero
`.card-sub` and zero `.fs-count` anywhere; eight routes checked for the correct topbar
title and no duplicated heading. `npm run build` passes.

### 2026-08-16 — Session: Floor Plan module rebuilt from the CW Taytay warehouse plan

The floor plan was a fiction: five invented zones A–E, racks R01–R30, shelves S1–S6 and
bins B01–B35, none of which describe the building. It is now drawn from
`sample/EPC. FIN. WM. CW Taytay Warehouse Plan.pptx` and has three levels.

**How the reference was read.** The deck was unpacked and its slides rendered through
PowerPoint COM (`$app.Presentations.Open(...).Export(...)`); LibreOffice and Python are
not on this machine. The zone overlays are native PowerPoint shapes over CAD rasters, so
the geometry was pulled straight out of the slide XML — including group transforms and
the 90° rotation slide 9 applies to its base image — rather than eyeballed. The rack runs
were located by scanning the CAD raster for its magenta wall lines and grey rack frames.

**What the drawing actually says, once decoded.** The plan has SIX rack runs, but the deck
names ELEVEN racks. Run 1 stands alone against the west wall (13 bays, `1159 R-W`); runs
2–6 are back-to-back pairs (10 bays a side, `3950 R-R`). 1 + 5×2 = 11. That reading was
then confirmed against the highlight geometry: mapping slide 9's Structural strip back
into raster pixels lands on ix 208.6–225.3, exactly the left half of run 3, and
Architectural on 224.2–241.7, exactly its right half. So **Rack 4 and Rack 5 are the two
faces of one run**, and MEPFS = runs 1–2, Safekeeping = runs 4–6. Bay pitch cross-checks:
Rack 1 is 449 units for 13 bays, the others 345 for 10 — 34.5 either way.

**`src/data/warehouseMap.js` (new).** Geometry and placement in one place, holding the RAW
drawing coordinates (slide inches for the site, CAD raster pixels for the warehouse) with
the conversion applied by `sr()` / `pl()`, so any shape can be checked against its source.
1 raster px ≈ 76 mm, derived from the drawing's own 3950 mm clear aisle measuring 52 px.

- **Site** — property boundary (the slide's own freeform path), the shed as three rects
  (main shed plus two wings either side of the loading recess — one box would swallow the
  recess), Deformed Rebar, Tiles Area, MRF (the one area drawn at an angle), stock yard,
  parking, canopies, gate, guard posts, vehicle routes.
- **Warehouse** — building envelope, 11 racks, the cantilever run along the east wall, the
  open floor area, LS600 shelving in the high-value room, eight rooms, and the two open
  flat areas with the drawing's stated 628.63 / 262.84 / 90.45 m².
- **Racking** — Interlock 600 selective, beam elevations 1095 / 2295 / 3545 / 4795, frame
  5000, Type A 2300 CE / 1200 kg and Type B 3300 CE / 1500 kg; cantilever 3000 upright,
  900 bay centre, 1000 arm, 300 kg; LS600 4 levels at 167 / 717 / 1267 / 1817.

**Placement — the honest part.** The stock sheet records no physical location, so the map
places every line by the rule the plan itself implies: item group first where the plan
puts that group outdoors (rebar → Deformed Rebar, tiles → Tiles Area), then value (the
existing `isHighValue` top-36 → the locked room), then trade (the four areas inside the
shed ARE trade areas). Steps 1–3 are a real reading of the plan. Step 4 — which bay a line
sits in — is a MODEL: lines are ordered by issue frequency and laid in from ground level
up, so fast movers sit at pick height. Every screen showing a bay says so, and the
capacity read-out distinguishes the two ("capacity is counted off the racking drawing;
which line sits in which bay is modelled").

Audited in the browser against a temporary anonymised fixture: 779 lines = 730 inside +
49 outdoors, zero unplaced, zero double-placed. Note 36 lines are flagged high value but
32 reach the cage — four are tiles, and the outdoor assignment deliberately wins over
value, because a tile pallet is outside whatever it is worth.

**Colour.** The deck legends its areas in teal / magenta / amber / yellow / purple, none of
which are in this design system. Each maps to the nearest sanctioned hue, fixed once at
the top of the floor-plan CSS block. Safekeeping keeps yellow — the deck's own colour, and
the warehouse's largest area — which is the one use of yellow outside its warning role;
no low-stock warning is ever drawn as an area fill, so the two cannot be confused.

**Other files.** `MaterialProfile` now reads `locationOf(item)` and shows Building → Area →
Rack → Bay → Level instead of the dead Zone/Rack/Shelf/Bin columns. The guided tour's
floor step was rewritten for the three levels; its anchor moved to `.fp-topbar`.
`Movement.jsx` still defaults to `Zone A / R01` — left alone, flagged below.

**Bugs found and fixed while verifying** (browser pane hidden again, so measured through
the DOM rather than screenshots):
- `getBBox()` reports coordinates in the element's LOCAL space, so every label inside a
  rotated or translated group read as out-of-bounds. All checks were redone through
  `getBoundingClientRect()` mapped back to viewBox units.
- "DELIVERY TRUCK PARKING" ran 11 units past the drawing's right edge, and the Open Stock
  Yard label sat on top of the Tiles Area name. Added `planText.jsx`, which wraps a label
  to its box; the yard's own label is pinned to the top of its box because the rebar and
  tiles areas sit inside it.
- The rack number was centred on the run, which put it exactly under the area label for
  Structural and Architectural — the two areas that are one rack deep. Numbers moved to
  the run's head.
- **Page scrolled sideways by 207–307 px at 375 px.** A grid item defaults to
  `min-width: auto`, so `.fp-layout`'s column grew to the plan's `min-width` instead of
  letting `.fp-stage` scroll. Fixed with `minmax(0, 1fr)` plus `min-width: 0` on the items.
- The level switcher overran a phone by 7 px; its icons are hidden below 560 px.
- The cantilever run and two rooms floated a few pixels outside the shed wall — raster
  measurement drift, snapped back to the wall line. The loading bay still projects past
  it, correctly: it does that in the plan, under the canopy.

**Verified**: site / warehouse / rack / cantilever / shelving / floor views at 1440×900 and
375×812, light and dark — zero labels clipped, zero label overlaps, zero page-level
horizontal scroll, no console errors on a clean dev server. Drill-down, breadcrumbs, the
back button and bay selection all exercised. Geometry audit: all racks, rooms, hulls and
open areas inside the envelope; back-to-back pairs touch exactly; run pitch 86 px on all
four gaps between double runs. `npm run build` passes.

**Known, deliberately not fixed here:** the shared topbar overflows 375 px on every page
(3 px on /dashboard, 9 px on /inventory, 18 px here) — the page title pushes the avatar
past the edge. It is in `Layout.jsx`, pre-dates this work, and is spun off separately.
`Movement.jsx`'s location fields still use the old vocabulary; it is a read-only Phase 3
form. Real recorded locations remain the eventual fix — add a `location` column and
`placement()` becomes a lookup instead of a rule.

### 2026-08-17 — Session: topbar icons, tour button, notification-dot bug, greeting removed

Five small UI requests, all in `Layout.jsx`, `Dashboard.jsx` and `index.css`.

**1. Every page title in the topbar now carries an icon.** `Layout.jsx` gained
`ROUTE_ICONS`/`DASH_ICONS` maps (same keys as the existing `ROUTE_TITLES`/`DASH_TITLES`)
and a `pageIcon()` alongside `pageTitle()`. Each icon name matches the one the sidebar
already uses for that destination — the topbar title and the nav item that led there
carry the same glyph. `.topbar-title-wrap` lays the icon beside the `<h1>`.

**2. "Take a Tour" moved into the topbar, next to Notifications, as a question-mark
icon button.** It used to be a labelled button on the Dashboard page itself
(`.page-actions`, removed — see #4), which meant the tour trigger only existed on one
page even though `<Tour />` runs globally from `Layout.jsx`. `useTour()` is now called
in `Layout.jsx`, and the icon button sits between the theme toggle and the bell,
`data-tour="tour-btn"` moved with it. `Icon` gained a `help` glyph (circle with a
question mark) since none of the existing 40-odd icons fit.

**3. Fixed the notification unread dot — it was never actually on the bell.** `.icon-btn`
had no `position: relative`, so the dot's `position: absolute` (set inline in
`Layout.jsx`) resolved against the nearest positioned ancestor up the tree instead of
the button — it rendered as a stray red dot elsewhere in the topbar rather than on the
bell icon. This is what "the notification colors are wrong" was pointing at: not a
wrong hue, a wrong position that then reads as a color problem because the dot shows up
somewhere it isn't supposed to be. One line (`position: relative` on `.icon-btn`) fixes
every icon-button badge, not just this one.

**4. The dashboard greeting ("Good day, {name} · {role}") is gone entirely** —
`.page-head` / `.page-greeting` / `.page-actions` / `.greeting-role` deleted from both
`Dashboard.jsx` and the stylesheet. Nothing replaced it; the topbar title already says
what page this is, and the account menu already carries the name and role.

**5. New Transaction now shares a row with the Inventory/Safekeeping/Excess tabs**,
pinned to the row's right-most end, sitting on top of the tab strip's own border
instead of in a separate toolbar row above it. New `.dash-tabs-row` wraps `.dash-tabs`
(now `flex: 1 1 auto`) and `NewTransactionMenu`'s `.txn-wrap`; below 760px the row wraps
and the button (icon-only at that width) stays pinned to the right edge above the tabs
via `order: -1` plus `justify-content: flex-end` on the wrapped row.

**Verified** against the other session's already-running dev server (this machine has a
live Supabase session cached from an earlier login, so the dashboard rendered against
real auth without a temporary fixture): topbar heading shows a 17×17 icon beside
"Inventory Insights"; Take a Tour sits between the theme toggle and the bell; the
notification dot's bounding box (1184–1192, 17.5–25.5) now sits inside the bell
button's box (1162–1200, 10.5–48.5), confirming the fix; no "Good day" text anywhere in
the rendered page; at 1280px the New Transaction control's right edge (1242) matches the
tab row's right edge exactly, vertically centered against it; at 375px the button sits
top-right (327–363, matching the row width) with the tabs wrapped beneath it and zero
horizontal page overflow. No console errors. `npm run build` passes.

### 2026-08-17 — Session: Floor plan levels 1 and 2 — decluttered, portrait, gradients

Seventeen changes to the stockyard view and six to the warehouse view, all cosmetic or
compositional; the placement model and the racking level are untouched.

**Level 1 — the site is now only what holds material.** Removed the 9.0 m unloading
area, car park, delivery-truck parking, queue parking, the loading/unloading block, the
canopy and gate slivers, the guard-post markers, the ingress/egress arrows and the north
arrow. All of it was vehicle logistics, and on a card-sized drawing it crowded out the
four areas the level exists to show. `SITE_FACILITIES`, `SITE_MARKERS` and `SITE_ROUTES`
are gone; the single surviving piece of context is `SITE_YARD`, widened west from
x 4.32 to x 3.90 so the deformed-bar bay sits inside it as it does on the drawing.
The card is titled **Stockyard**, "Deformed Rebar" is now **Deformed Bar Area**.

**Merged outlines.** The shed was three overlapping rectangles and the tiles bay two,
which left seams where the boxes met. Both are now single rectilinear outlines
(`SITE_BUILDING`, `SITE_TILES`) that keep the real shape — the shed still has its
loading recess notched out of the bottom, the tiles bay is still wide at the top and
narrower below. Same for Safekeeping and the open floor on level 2.

**Gradients.** `planDefs.jsx` (new) emits one diagonal gradient per area role, stops
reading the same `--fp-*` tokens the flat colours use, so a gradient tracks the theme
without a second palette. Opacity lives in the stops, which leaves `fill-opacity` free
to carry hover and selection on top. The shed shell and the open floor get neutral
gradients of their own so they read as surfaces, not as a sixth material area.

**Level 2 is portrait now, and that is what makes it line up with level 1.** The deck
presents the warehouse rotated 90° clockwise; the underlying CAD is portrait. Portrait is
the orientation that matches the site plan — on both drawings the rack runs stand
vertical, the entrance canopy is on the west wall about three-quarters of the way down,
and the loading recess is bottom-centre. Rotating the landscape view clockwise (as
literally asked) would have put it 180° from the shed you just clicked; rotating it the
other way is what "in line with the level 1 map" actually means, so `pl()` is now an
identity map and every measurement stays in the coordinates it was taken in. A portrait
drawing cannot be sized by width without running past the fold, so `.fp-stage-portrait`
leads with height (`max-height: 78vh`, width follows the intrinsic ratio) and centres it.

Also on level 2: the stated square-metre figures are off the map, the rack-run bay
divisions now run horizontally to suit the rotation, and both legends and both card
footnotes are gone from levels 1 and 2 (level 3 keeps its cell legend, which decodes
colour rather than repeating the drawing).

**Label sizing.** `PlanText` now drives every label on both plans. The area-label
rotation threshold went from `h > w * 1.4` to `h > w * 2.2`, because the high-value room
is 119 × 175 — barely oblong — and turning text in a near-square block looks wrong. A
hull one rack deep (~21 units across) drops to 12 px so its name fits on one line inside
the run; a hull that stays horizontal drops to 13 px because it wraps to several lines.
The MRF label is wrapped and sized to its own angled box, where at heading size
"MATERIAL RECOVERY" alone was wider than the bay it names. Rack numbers went 11 → 13 px:
the portrait plan renders about 0.76 viewBox units to the pixel.

**The contrast complaint was a real bug, not a taste issue.** This stylesheet's
`button { font-family: inherit; cursor: pointer; }` does not set `color`, so the site
tiles and the area rows — both `<button>` — were painting the user agent's own
`buttontext` black. On the dark theme's near-black card that is invisible. Both now set
`color: var(--text)` explicitly, carry their area's colour as a left border and on the
figure, and the two 10–11 px captions moved from `--text-faint` to `--text-muted`.
Measured after: every text/background pair on those cards is now **5.8:1 or better in
both themes** (worst was 3.82:1 before, and the tile name was effectively 1:1 in dark).

**Bug found while verifying:** dropping `rects: []` from the MRF entry meant the
deformed-bar area had no label box either, and `centreOf(undefined)` crashed the whole
site level. `SITE_AREAS.forEach` now falls back to the outline's bounds, then to the
area's single rectangle.

**Verified** at 1440×900 and 375×812, light and dark, on all three levels: zero labels
clipped, zero label overlaps, zero page-level horizontal scroll from anything in `main`,
no console errors on a clean dev server. Every level-2 area label measured inside its own
hull. Click-through exercised end to end — tiles → panel, shed → warehouse, safekeeping
hull → panel, Rack 10 → 50-cell elevation, breadcrumb back up.

**Still outstanding, unchanged:** the shared topbar overflows a 375 px viewport on every
page (38 px on /dashboard, 44 px on /inventory, 50 px here — it grows with the page
title). Confirmed again this session that nothing inside `main` contributes to it; it is
`Layout.jsx` and is being fixed separately.

### 2026-08-17 — Session: floor plan polish — icons, textures, rotation, depth hierarchy

**Level 1.** "Deformed Bar Area" → **Deformed Rebar Area**. The MRF label is now sized
and wrapped to its own angled box at 9.5 px with the icon above it (it kept reading as
too big because it was sized like the rectangular areas, which are three times wider).
Entrance/exit signage is back, at the two places the deck marks it: the roll-up gate on
the shed's west wall (slide 4's yellow strip, label set vertically beside it) and the
site gate on the south access road where the EXIT/ENTRY arrows meet the property line —
`SITE_GATES`. Each clickable area carries an icon drawn into the plan and a fine
diagonal hatch over its fill, so a block reads as a stocked surface rather than a
flat swatch.

**Level 2 — rotation.** `WarehousePlan` takes `orient`, held in the URL as `?rot=l`.
Geometry is still stored portrait; `mr()` and `mp()` map rects and outlines into
whichever orientation is showing, so the rotation lives in exactly one place. Labels
recompute their own wrap width, size and rotation from the MAPPED box, and the rack bay
divisions pick their axis from whichever side of the run is longer — so both
orientations lay out correctly rather than one being a rotated screenshot of the other.
Portrait stays the default because it matches the shed on level 1; landscape is the
deck's own presentation.

**Level 2 — depth.** Three tiers now, and the difference is deliberate:
- *Context* (rooms, circulation floor) — flat tint, **no outline at all**, muted text.
- *Section areas* (MEPFS, Structural, …) — a soft gradient wash, dashed edge, and a
  **Sections toggle** (`?sections=0`) that hides them entirely. With them off, the racks
  and floor bays keep their own colours and the plan reads as pure racking.
- *Clickable* (racks, cantilever, open flat area) — the strong gradient, textured,
  outlined. `planDefs.jsx` now emits both a soft and a solid gradient per role.

**Level 2 — geometry fixes against the reference.**
- **The cantilever does not run wall to wall.** Scanning the raster for its arm ticks
  puts the comb at iy 32–550, not 32–838: it stops at the green line about two-thirds
  down. 518 px at ~76 mm/px is 39.4 m, which at the drawing's 900 mm bay centres is
  **42 bays**, not the 22 previously assumed (126 arm positions, not 66).
- **Floor Area → Open Flat Area**, and moved. The drawing's own
  "OPEN FLAT AREA A = 262.84 m²" label sits at the bottom-right of the yellow
  Safekeeping highlight, so the clickable block is now there (ix 410–604, iy 565–838)
  rather than the strip beside run 6 where it had been placed.
- The Safekeeping outline was re-measured off slide 13's highlight and the loading bay's
  bottom edge is pinned to the building's own wall line.
- Every unclickable region now clears every other region: audited context/context,
  context/clickable and clickable/clickable — **zero overlaps**, where the EE cabinet and
  security check had been clipping 1 px into the high-value room.

**Two real bugs, both about colour inheritance.**
- The plan icons rendered in the page's text colour, not their area's. The icon set
  strokes with `currentColor`, but the role classes only set `fill` (which is what SVG
  `<text>` needs). Both `fill` and `color` are now set, and `--c` cascades from the area
  group so any icon inside picks it up.
- **`.fp-mrf` was two different things**: the Material Recovery Facility's area-role
  class on the map, and the explanatory note block in the site overview card. The note's
  rule sits later in the stylesheet, so its `color: var(--text-muted)` silently won for
  the MRF icon on the plan. The note block is now `.fp-mrf-note`.

**High-value contrast fixed.** `--fp-highvalue` was near-black (#2b2c2b) in light mode,
which gave the area no presence on white paper and made its own label barely readable.
Now #4d4b4b light / #c4c3c3 dark — same neutral hue, real contrast: **8.3:1 in light and
9.6:1 in dark** against the drawing surface. The padlock and diagonal hatch still carry
"secure".

**The 42-bay cantilever elevation needed a minimum width.** Scaled to fit the card it
landed at 0.33 and its bay numbers were three pixels wide. It now sets a floor of ~26 px
per bay and scrolls inside the stage instead: 1,202 px wide, 25.6 px cells, readable.

**Verified**: 22 desktop view/theme combinations (site, site+MRF, warehouse in both
orientations × sections on/off, high-value selected, and all four racking views, in light
and dark) plus 5 at 375 px — zero labels clipped, zero label overlaps, nothing in `main`
outside a scroll container. Rotate and Sections exercised by click; rack drill-down works
in landscape with sections off. `npm run build` passes.

### 2026-08-17 — Session: label sizing bug, stepper, rebar icon, HV racking

**The label-size bug behind several complaints.** `PlanText` computed its wrap from the
`size` prop but never applied it — the rendered size came from the CSS class. So a label
asked to wrap at 9.5 px was drawn at 15 px and ran outside its own block. That is why the
MRF text kept overflowing however small the number passed in got, and why "make the
labels smaller" had no effect. `size` is now authoritative for both, `fitSize()` steps it
down until the longest single word fits, and the estimate accounts for the 0.6 px
letter-spacing the plan labels carry. The `.fp-*-t` classes must no longer set
`font-size`; a comment in `floorplan.css` says so.

**The MRF check was wrong too.** It compared screen-space bounding boxes, and a rotated
rectangle's axis-aligned box is bigger than the rectangle — so a label could sit inside
the box and still hang off the shape. It is now verified in the block's own rotated
frame, where the icon and both text lines measure inside 160 × 90.

**Labels and icons now scale with the block they sit in.** `iconFor`/`fontFor` take the
block's shorter side, because that is what has to contain them; the icon carries the
identification and the wordmark stays quiet beneath it. Site labels land at 8.1 / 11.1 /
12.0 / 13 px with icons at 21.7 / 29.6 / 32 / 42; warehouse areas at 10.1–12.5 px, and a
run only one rack deep gets no icon at all. Entrance/exit signage removed; a purpose-drawn
`rebar` icon (three ribbed bars on the diagonal) replaces the generic layers glyph.

**Level switcher is a stepper.** Numbered nodes joined by a rail, filled as you descend,
with a tick on the levels behind you — the three levels are a drill-down, and three equal
pills said nothing about that. Rack numerals moved to Barlow Condensed, already loaded
for headings and the right face for a plan numeral.

**Level 2.** The high-value room now carries **8 rack lines × 4 levels** (128 shelf
positions, was 4 × 4 × 4 = 64) and the plan draws eight. The shelf-positions caption and
the Platform area are gone. Context regions are inset 1 unit so two that touch show a
hairline of floor between them rather than merging — they have no outlines any more.

**A landscape-only collision, found by the sweep.** With the plan rotated, the rack
number sat at the run's head at a fixed 15 px: back-to-back pairs are 17 units apart, so
2/3, 4/5, 6/7, 8/9 and 10/11 overlapped, and Rack 10's number ran into the Safekeeping
title. The number now sits at the far end in landscape (where the horizontal area titles
do not reach) and its size is capped to the run's depth — 10.5 px in a 17-unit band.

**Measurement caveat, worth remembering.** With the browser pane hidden, style
recalculation is throttled: after a client-side navigation `getComputedStyle` returns
values from *before* the class change, while `classList` and `getBoundingClientRect` are
current. That produced a convincing phantom — the stepper appeared to colour its nodes by
position rather than state, and every rule checked out on inspection. A hard reload
showed it correct. Geometry checks are trustworthy after a soft navigation; colour checks
need a real page load.

**Concurrent session.** A second session is editing this same working tree (Layout,
ui.jsx, charts, InventoryTab, index.css, plus a `__fixture.js` and `MaterialList.jsx`).
To avoid committing its unfinished work, this session's CSS went into a new
`src/styles/floorplan.css`, imported from `StorageMap.jsx` so it ships with the floor
plan's lazy chunk. Only floor-plan files were staged; `index.css` was left alone. New
floor-plan CSS belongs in the new file, and the old `.fp-*` block in `index.css` should
migrate over.

**Verified** on fresh page loads at 1440×900, light and dark: site, warehouse in both
orientations with sections on and off, and all four racking views — zero labels clipped,
zero overlaps, nothing outside a scroll container. `npm run build` passes.

### 2026-08-17 — Session: Overview split cards, sliding toggles, topbar/account consolidation

Thirteen requests across mobile, desktop and general chrome. Two clarified before
building: the Megawide mark goes on **topbar page titles only** (card icons stay
meaningful), and the toggles are **sliding switches with both labels visible**.

**1. The Overview is two full-width cards, each split chart | list.** They used to sit
side by side (~480px and ~600px). Now they stack, and each card carries the material
list down its own right-hand side. That list is the one that used to fly in as a
full-screen drawer over the entire dashboard — `KpiListModal` is **deleted**, its rows
extracted to `src/components/MaterialList.jsx`, which also exports the `CardListPanel`
the cards use. Clicking a composition tile fills the composition card's panel; clicking
a donut slice fills the distribution card's. The clicked tile takes a selected state and
the unselected donut slices drop to 0.32 opacity, so the panel always has a visible
source. Clicking the same target again clears it.

`Others` is the rollup bucket, not a category, so it resolves to every line NOT in one
of the eight named slices — matching on the literal name would have listed nothing.
Changing the Trade/Item Group scope clears the selection, because a Trade name is not
an Item Group name and the panel heading would otherwise survive its own ring.

**2. Card sizes are fixed.** `.card-split` is a fixed height (420px, 440 above 1500px)
and the list scrolls inside its panel. The idle panel is always rendered rather than
appearing on click — a panel that appeared would change the chart's width as you clicked
it. Measured: the composition card is 508px tall and its chart area 843×420 both before
and after a selection, at desktop and at 375px. On mobile the panel stacks under the
chart at a fixed 320px for the same reason: sized to content it grew the card ~290px the
moment a tile was clicked.

**3. The battery is now as large as the donut** — 124×300 against the donut's 150px
ring (300px across), measured. Getting there meant giving the gauge its own full-height
column with the headline beneath it and the six tiles beside it; stacked above the tiles
(the old half-width layout) the tube is capped at whatever height is left, ~260px.
The Available/Reserved percentage chips are gone: the gauge draws that split and prints
the available share on its own fill, so the chips were the third statement of one number.

**4. Donut labels wrap instead of ellipsising, and the ring grew at every tier.**
`maxName` (a one-line character budget) became `wrapChars`/`maxLines`, with a greedy word
wrap to two or three lines. Wrapping spends vertical space, which the column has, rather
than horizontal space, which it does not — which is what paid for the bigger rings
(150 from 126 at desktop, 72 from 62 on a phone).

`wrapChars` is set by the **longest single word** in the taxonomy, not the average
label: a word wider than the line is the one case wrapping cannot rescue.
"Architectural" (13) and "Requirements" (12) are the binding pair, so no tier drops
below 13 — that is what caps the phone ring at 72 rather than larger. Found by
measurement, not estimate: labels render at ~5.3px per character, not the ~4.6 assumed,
and "Plumbing Works" overflowed by exactly 5px at a 14-character budget.

`spreadColumn` now separates neighbours by half of each label's OWN height plus padding,
because a wrapped label is one, two or three lines tall; the old constant gap either
overlapped the tall ones or stranded the short ones. Label line-height went from a flat
`+2` to `1.35×` the font size, and the figure sits 4px below the last name line — at a
flat +2 the glyph boxes grazed, which at 22px reads as the two lines touching.

**5. The donut's centre total no longer overlaps the ring on a phone.** It was a fixed
20px; the small tier's hole is ~105px across and "₱482.4M" at 20px is wider than that.
It is now sized off the inner radius (`clamp(12, rInner × 0.32, 24)`), giving 24px at
desktop and 15px on a phone, and the block is capped at `rInner × 1.72`.

**6. Quantity/Value and Trade/Item Group are sliding toggles** — new `Toggle` in
`ui.jsx`, one pill track with a thumb that slides behind the active label. The two
options are **equal grid tracks, not text-sized**, so the thumb is exactly half the
track and stays that width as it slides; sized to their labels the thumb would resize
mid-slide, which reads as the control growing rather than switching. `Segmented` stays
for the three-option period picker, where a sliding thumb stops being readable.

**7. The toggles hold the card's top-right corner and never wrap.** `.card-head` is
`flex-wrap: nowrap` at every width now and the title truncates instead. Three leftover
rules from the old "controls take their own full-width line" design were still forcing
`width: 100%` and `flex-wrap: wrap`, one of them a duplicate `.chart-controls`
definition later in the file that silently overrode the new one — that is why the
controls were still spanning the full head. Below 620px the distribution card's two
toggles stack vertically in that corner rather than side by side: at 375px the pair plus
a title do not fit one row, and the title was being compressed to **literally zero
width**, so the card lost its name entirely. Both titles now render in full (171px and
168px at 375px).

**8. Topbar titles come from the sidebar.** `/dashboard` reads "Dashboard" on all three
tabs instead of renaming itself per tab, and `/storage` is "Floor Plan", matching its nav
label rather than "Warehouse Floor Plan". `ROUTE_ICONS`/`DASH_ICONS` and `pageIcon()`
were deleted; the Megawide mark replaces them.

**9. Notifications and the tour moved inside the account dropdown**, and the topbar is
down to the theme toggle plus the avatar. Notifications expand in place as a section of
that menu rather than opening a second popover off an adjacent control. The unread dot
moved onto the avatar, which is now the single control that says something is waiting.

**10. The rule under the account name is gone.** It was `.acct-head`'s `border-bottom` —
a purely decorative divider between the identity block and the options, and with the
options now carrying their own icons the grouping reads without it.

**Verified against a temporary local fixture** (240 inventory lines + 700 ledger rows;
the fixture and its `main.jsx` hook were deleted afterwards and `dist/` confirmed free of
it — this machine signs in through the DEV demo fallback, which has no Supabase session,
so every table hydrates empty and the charts would otherwise render nothing).

At 1440×900, light and dark: both Overview cards 1374×508 and identical; tube 124×300 vs
ring 300; 20 donut labels with **zero overlaps, zero clipped, zero ellipsised**; card
heads a uniform 59px with controls 16px off the right edge; idle-panel text at 6.79:1
contrast in dark. At 375×812: donut labels clean in **both** Trade and Item Group scopes
(27 and 24 text nodes, zero overlaps, zero clipped, zero ellipsised); card heights
identical before and after selection on both cards; no horizontal scroll on any view.
Insights, Activity, Safekeeping, Analytics, Reports, Floor Plan, Low Stock and Inventory
Masterlist all audited for zero-width titles and overflowing controls — none found.
Click-through exercised end to end on both cards, including the Others bucket. No console
errors. `npm run build` passes.

**Measurement caveat:** the browser pane does not composite while hidden, so
`ResizeObserver` and recharts' `ResponsiveContainer` do not re-measure on a viewport
resize — the donut kept a 780px viewBox scaled down to 324px and reported the desktop
tier. Every mobile figure above was taken after a **full page reload** at that width, not
after a resize. Screenshots remain unavailable for the same reason.

### 2026-08-17 — Fix: donut total pushed outside the ring

Regression from the session above, introduced by the fix for the phone-sized centre
readout. Scaling the font off `rInner` was correct; the `maxWidth: rInner * 1.72` added
alongside it was not.

`.donut-center` is `position: absolute; inset: 0` and centres its text with flexbox —
it is deliberately the full size of the chart box. A `max-width` on it does not centre
anything: the box shrinks away from `right: 0` and stays pinned to `left: 0`, so the
readout was dragged out of the ring and towards the left edge of the chart. At desktop
that meant a 179px box inside a 780px chart, i.e. the total sitting roughly 300px left
of the hole it belongs in.

Removed the cap outright rather than moving it onto the child. The font size is already
derived from the inner radius, so the readout fits the hole by construction and the cap
was never load-bearing — measured at 67px wide inside a 208px hole at desktop, and 69px
inside a 92px hole on a phone in Value mode (`₱517.1M`, the widest string the card
produces). A comment on the element now says why it must never carry a width cap.

**Verified** against the temporary fixture (deleted again afterwards; `dist/` confirmed
clean): the value's centre is horizontally **exactly** on the ring's centre — offset 0px
— at 1440×900 and at 375×812, in both Quantity and Value mode, and on the Analytics
donut. The Safekeeping donut is unreachable with this fixture (no safekeeping sheets in
it), but it runs in legend mode where `rInner` is the fixed 62px prop, giving a 20px
centre identical to the previous hard-coded value, and it never carried the max-width.
`npm run build` passes.

### 2026-08-17 — Session: toolbar reorder, footer toggles, single-column tiles, headline reformat

Seven requests, all in `Dashboard.jsx`, `InventoryTab.jsx`, `SafekeepingTab.jsx`,
`InventoryComposition.jsx`, `ui.jsx` and `index.css`.

**1. Mobile card icons were missing — a regression from the toggle-relocation session.**
A rule added then, `.card-head .card-icon { display: none }` below 560px, was meant to
buy room for the toggles that used to crowd the head at that width. The toggles moved
out of the head entirely this session (see #3), so the rule was deleted outright rather
than carried forward unused.

**2. The six composition tiles are one column, not a 3-across grid**, on every
width from tablet up (mobile already stacked its own way). Each tile is now a
full-width row — icon and label on the left, the figure on the right — instead of a
square block, so the label is never the part fighting for space. Verified: 6 tiles,
each exactly 834px wide at 900px viewport, 658px at 1440px, all sharing one x-position
(no leftover grid columns).

**3. Quantity/Value, Trade/Item Group and the period pickers all moved to a new
`card-foot` row, under the card's content.** `Card` in `ui.jsx` gained a `foot` prop
(rendered below `card-pad`, right-aligned, with its own top border) alongside the
existing `right` — `right` stays for things that identify the card (a count chip, "current
filter"), `foot` is for controls that change what the card is showing. Applied to both
Overview cards, High Stock Items, Aging Analysis (its "current filter" chip stayed in the
head, only the toggle moved down), Movement History, Net Inventory Change, Top Incoming
Items, and both Safekeeping cards (scope switch, sheet switch) — every card that carried
a display toggle. Mobile keeps the same "two toggles don't fit one row" stacking rule
this footer now owns instead of the head.

**4. New Transaction now sits beside the search bar, and that whole row moved above the
tabs.** `Dashboard.jsx`'s first row is `.dash-toolbar-row` (search bar + button); the tab
strip is its own row underneath. "Where do I look" and "where do I act" are both answered
before the tabs even say which module you're in. `.dash-tabs-row` (search bar was never
in it before) is gone; `.dash-toolbar-row` replaces it.

**5. The composition and distribution cards' list panels are wider.** `--clp-w` went
320→420px (360→480px above 1500px), and `--split-h` 420→460px (440→480px above 1500px)
to match. The chart side gives up the room — its own 780px cap was never the binding
constraint, so nothing else in the layout had to change.

**6. Headline reformatted to Total / Available, both figures the same size.** Order
flipped ("of" read right-to-left against how the ratio is usually said), the separator
is now "/", and `.ch-avail`/`.ch-total` share one 26px/800-weight rule instead of a
30px-vs-17px split that put visual weight on Available specifically — the gauge and
caption already carry that emphasis, so the figures read as a plain ratio now. Caption
text changed to "{unit} available of SOH" (CSS `text-transform: uppercase` renders it
"UNITS AVAILABLE OF SOH" to match the composition tiles' own caption style). A stale
mobile-only `.ch-avail { font-size: 26px }` override — dead weight now that both figures
already render at 26px — was removed.

**Verified** against a temporary local fixture (240 inventory lines, 700 ledger rows, 90
safekeeping lines; deleted afterwards, `dist/` confirmed clean of it) at 1440×900, 900×900
and 375×812:
- Mobile: both card heads show their icon again (2/2); search bar + button sit above
  the tab strip; no horizontal scroll; both Overview card titles render in full (171px,
  172px) with their two footer toggles stacked and nothing overflowing.
- 900px (tablet) and 1440px (desktop): composition tiles are a single column at every
  width tested, list panel measures 420px, donut still centres on the ring with zero
  label overlaps or clipping after the panel widened.
- Headline renders "113,988/92,162" (Total/Available) at a uniform 26px in both spans;
  caption reads "units available of SOH".
No console errors on a clean tab. `npm run build` passes.

### 2026-08-17 — Session: Warehouse rename, facility capacity gauge, Safekeeping overhaul, Scrap tab

Nine requests, touching `Dashboard.jsx`, `InventoryTab.jsx`, `SafekeepingTab.jsx`,
`InventoryComposition.jsx`, `warehouseMap.js`, `insights.js`, `safekeepingInsights.js`,
`ui.jsx`, `MaterialList.jsx`, `icons.jsx` and `index.css`.

**1. The Inventory tab is now labelled Warehouse.** Only the label changed — the key
stays `inventory` (it's the default tab and never appears in the URL) so every
pool/filter variable downstream needed no renaming. Card titles inside the tab
("Inventory Composition", "Inventory Distribution") are untouched; the rename is the
tab itself, matching what it actually covers now that Safekeeping and Scrap exist
alongside it.

**2. Sub-tabs (Overview/Insights/Activity) now align with the main tabs above them.**
`.dash-tabs` carried a `padding: 0 2px` inset that `.sub-tabs` never matched, so the
sub-tab icons sat about 3px left of the main-tab icons — enough to read as two
misaligned rows. `.sub-tabs` now carries the same inset.

**3. The battery became a facility capacity gauge.** It used to show the
Available/Reserved split of stock ON HAND (a quantity). It now shows real floor-space
occupancy — Warehouse-owned racks (MEPFS, Structural, Architectural, High Value),
Safekeeping's own area, and whatever pallet/shelf positions neither has filled — via
a new `facilityCapacity()` in `warehouseMap.js` that reduces over the exact same
`areaCapacity()` numbers the floor plan itself reports, so the two can never disagree.
Three gradient-and-hatch segments (`.cap-seg`, using `color-mix` for the facets) stack
in the tube, with a mini legend + percentage under each segment. This is a SPACE
measurement, not a stock one — it does not and should not agree with the
Available/Reserved headline that still sits beneath it, and a code comment says so.
Warehouse/Safekeeping/Available reuse the `total`/`reserved`/`available` series
colours respectively, so red still means "warehouse-side", gray "safekeeping-side",
green "free" everywhere else in the app.

**4. Safekeeping gained the same three sub-tabs** — Overview (KPI row + Distribution),
Insights (the three source sheets, filterable — the closest thing Safekeeping has to
Warehouse's ranked lists, since there's no unit price or movement history to compute
aging/ABC from), Activity (the Delivery Tracker, which literally is movement in and
out of the yard).

**5. The Safekeeping Distribution card now matches the Warehouse Distribution card's
UI exactly** — a leader-labelled donut on the left, a ranked list panel on the right,
same `card-split`/`CardListPanel` markup. Getting there needed two things: `Toggle`
generalised from a fixed 2-option control to any count (`--count` set from
`options.length`, thumb width `calc((100% - 6px) / var(--count))` — translateX by one
thumb-width per index still lands exactly on each column regardless of N), and
`MaterialList`/`CardListPanel` gained an optional `renderRow` prop. The second part
matters: Safekeeping's SOH lines carry no unit price, brand or stock-health status,
and there's no material profile page to link to — reusing the inventory row renderer
would have printed a false "₱0.00" purchase price and a dead click. The new
`SkRenderRow` reuses the same `.wpc` visual language with fields that actually exist
(Class as a plain badge, SOH/In/Out, Project › Trade), and the row carries a new
`.wpc.static` modifier (no pointer cursor, no hover border) since there's nothing to
open. Class is gone from the scope options — it's a condition grade, not a grouping
dimension like the other three, so cutting the donut by it was answering a different
question than Project/Trade/Item Group ask.

**6. Safekeeping's KPI row is four cards, not five: Projects, Total SOH, Incoming,
Outgoing.** "Total Line Items" counted SOH rows, a figure none of the other four
depend on — dropping it left one coherent sentence about what's actually held.

**7. Scrap joins Excess as a second locked main tab**, both reading "coming in a later
phase" rather than the excess-specific "Phase 2" wording, and rotated the tour's
"Three Dashboards" step into "Four Dashboards" to match. New purpose-drawn `scrap`
icon (a bin with a crack down the lid) — tells apart from `excess`'s stacked-bars
glyph at a glance.

**8. The Warehouse tab's Composition and Distribution cards got a wider list panel**
than the shared default — 460px against the base 420px (540px above 1500px against
480px) — scoped to a new `.wh-overview` wrapper class rather than raising the shared
default, so Safekeeping's Distribution card (same `card-split`/`card-list-panel`
markup, shorter rows) keeps the narrower width its content actually needs.

**9. The Warehouse Distribution card's scope toggle gained a third option: Class.**
New `byClass()` in `insights.js` (same `groupBy()` helper the Trade/Item Group options
already use, keyed on `conditionClass`), wired through the existing scope→field map
so the panel's click-through and "Others" bucket logic needed no special-casing.

**Housekeeping.** Removed the Available/Reserved-tube CSS the capacity gauge replaced,
plus a large block of dead CSS this session's rewrite orphaned outright:
`.sk-dist*`/`.skd-*` (the old compact scope list), `.dash-top`/`.dash-kpis`/`.sk-top`/
`.sk-dist-card` (the old two-column KPI-beside-distribution layout), and
`.battery-wrap`/`.battery-col`/`.flow-*`/`.battery-legend`/`.bl-*`/`.battery-stat*`
(a "Stock Battery" design that predates the current Composition card and had zero
remaining JSX references even before this session). `NoData` moved from a private
function inside `InventoryTab.jsx` to a shared export in `ui.jsx`, since Safekeeping's
Overview needed the same "source data is genuinely absent" treatment.

**Verified against a temporary local fixture** (240 inventory lines, 700 ledger rows,
90 safekeeping lines — deleted afterwards, `dist/` confirmed clean of it) at 1440×900
and 375×812, light and dark:
- Warehouse tab reads "Warehouse" in the tab strip; Scrap sits locked beside Excess;
  sub-tab icons measure within 1px of the main-tab icons' x-position.
- Capacity gauge renders 3 gradient/hatch segments with correct percentages (20% /
  8% / 72% in the fixture) and a 3-row legend; tube+legend+headline fit the fixed
  460px card-split height with zero overflow (a real 8px overflow was caught and
  fixed by tightening `.comp-gauge`'s internal gap).
- Class added to the Warehouse Distribution scope toggle (3 options); the sliding
  thumb was measured on a **fresh page load** (not a click, per the standing
  measurement caveat below) and lands exactly on the active button at every index.
- Safekeeping Overview: 4 KPI cards in the specified order; Distribution card in
  card-split layout with a working slice-click → `SkRenderRow` list, `.wpc.static`
  confirmed non-interactive; scope toggle shows exactly Project/Trade/Item Group.
  Insights shows the Source Tables card; Activity shows the Delivery Tracker.
- Warehouse panel measured 460px, Safekeeping panel 420px, on the same build —
  confirming the `.wh-overview` scoping works.
- No horizontal scroll and no console errors on any view tested. `npm run build`
  passes.

**Measurement caveat, reconfirmed.** Clicking the new 3-option toggle mid-session and
reading `getBoundingClientRect()`/`getComputedStyle()` immediately after showed the
thumb NOT moving — even a manual `element.style.transform = 'translateX(300px)'` set
directly from the console read back as `matrix(1,0,0,1,0,0)`. This is the browser
pane's known non-compositing-while-hidden limitation (documented in earlier sessions
for colour/style reads) extending to transform geometry, not a real bug: setting the
same scope as the INITIAL state and reloading the page showed the thumb correctly
positioned on the very first paint. Every geometry claim above involving a click was
re-verified after a full page load rather than trusted from the click alone.

### 2026-08-17 — Session: capacity gauge cleanup, outlined tiles, default selections

Five small requests, all in `InventoryComposition.jsx`, `InventoryTab.jsx` and
`index.css`.

**1. The Total/Available stock headline under the capacity tube is gone.** It was a
STOCK figure (Available/Reserved) sitting directly under a SPACE gauge (Warehouse/
Safekeeping/Available) — two different questions stacked so close together they read
as one. Removing it also fixed the tube's own alignment: with the headline's 220px
max-width no longer in the box, the legend (200px) now centres directly under the
124px tube instead of the wider text block pulling the visual centre sideways.

**2. The six quantity tiles are a 2×3 grid of tiles again**, not the single-column
row list from two sessions ago. `.overview-stack .comp-stats` goes back to
`repeat(2, minmax(0, 1fr))` (1 column only below 560px, where a tile can't fit a
peso figure and its label side by side). The tiles are outlined now, not filled —
`.comp-stat`'s flat `--surface-2` background read as one grey slab repeated six
times; it's `background: transparent` at rest, with a soft `color-mix` tint only on
hover and on the selected tile, so the accent colour is what tells tiles apart
rather than a shared grey fill.

**3. The mini legend's colour swatches are gone.** Each segment's icon already
carries the segment's colour (`.cap-item svg { color: var(--seg) }`), so the square
dot beside it repeated the same information for no reason.

**4 & 5. Both Overview cards default to showing their full list, not an idle
placeholder.** `compSel` now starts as `{ key: 'total', field: 'totalQty', label:
'Total on Hand' }` — the Composition card's first tile, so it opens already selected
and highlighted. `donutSel` starts as `{ name: 'All Items', all: true }`, a new
"show everything" state `donutRows` recognises before falling through to its normal
per-slice filtering; `selectedName` is passed as `undefined` in this state so no
slice on the ring dims, since "All Items" isn't a real slice. Changing the
Trade/Item Group/Class scope resets back to this same "All Items" default rather
than clearing to idle, for the same reason a scope change already cleared a real
selection — a Trade name isn't an Item Group name, but "All Items" is valid in
every scope. The explicit clear (✕) button on either panel still returns to a true
idle state; only the two cards' *initial* state changed.

**Housekeeping.** Deleted the now-dead `.comp-headline`/`.ch-figure`/`.ch-total`/
`.ch-avail`/`.ch-of`/`.ch-caption` rules (including two already-orphaned copies in
old pre-`.overview-stack` media queries from an earlier session) and the `.cap-item i`
swatch rule.

**Verified against a temporary local fixture** (240 inventory lines; deleted
afterwards, `dist/` confirmed clean of it) at 1440×900 and 375×812:
- No `.comp-headline` in the DOM; zero `.cap-item i` swatch elements.
- 6 tiles at 2 distinct x-positions / 3 distinct y-positions at desktop (true 2×3
  grid), 1 column at 375px.
- Resting tile background reads `rgba(0, 0, 0, 0)` (genuinely transparent) on every
  tile except the one matching the default selection, which correctly carries the
  selected-state tint — confirming the outline treatment applies everywhere it
  should and the selected feedback still works.
- On load, the Composition panel already reads "Total on Hand" / 240 materials and
  the Distribution panel already reads "All Items" / 240 materials — no idle
  "click a figure" state on first paint.
- Clicking a real donut slice still dims the other eight slices and swaps the panel
  to that slice's materials, confirming the new default didn't break the existing
  click-through.
- No horizontal scroll, no console errors on a clean tab (a `fmtBig is not defined`
  error surfaced once from a stale Vite dev-server module cache in an already-open
  tab; a fresh tab against the same running server showed no error, confirming it
  was a dev-only HMR artifact, not a real bug — `npm run build` had already passed
  cleanly before this was investigated). `npm run build` passes.

### 2026-08-17 — Session: Total Inventory rename, KpiCard tiles, capacity gauge moves to Floor Plan, Safekeeping delivery insight

Seven requests. Two clarified before building: Value mode on the relocated capacity
gauge shows the peso value of stock actually sitting in each area (not a relabelled
copy of the same percentages), and only the Composition card changes shape this
round — Distribution keeps its current donut + side-panel layout untouched.

**1 & 2. "Total on Hand" is now "Total Inventory", and its formula changed to
Available + Reserved + Incoming.** This could NOT be done by widening the existing
`KPIS().total`/`totalValue` fields — Analytics' `resRatio`/`dmgRatio` and the Movement
History back-cast both divide by that exact field, and silently widening its
definition would have shifted ratios and a stock curve tuned against the narrower
one. Added `totalInventory`/`totalInventoryValue` as new fields instead, leaving
`total`/`totalValue` exactly as they were for every other consumer.

**3 & 7. The six tiles moved to the top of the card and now look like Safekeeping's
own KPI cards** (`KpiCard`, not the bespoke `.comp-stat` tile), and clicking one
expands the material list beneath the WHOLE row rather than opening a side panel —
`KpiCard` gained an `active` prop (highlighted border, the expand glyph swaps ⤢→× so
it's clear a click will now close it, not open something else). Closed by default:
no tile is pre-selected on mount, reversing what an earlier session in this same
project had asked for — this request explicitly said "closed by default" and takes
precedence as the later instruction. The list, tile and expand state are now all
local to `InventoryComposition` itself; it no longer needs `InventoryTab` to lift
`compSel`/`compRows` up to feed a side panel, since there is no side panel to feed.

**4. The battery/capacity gauge moved from the Composition card to the Floor Plan
module.** It was always a SPACE reading (pallet/shelf positions occupied), not a
stock reading, and sitting inside a stock card never quite made sense. New
`FacilityCapacityGauge.jsx`, shown on the Floor Plan's site level (only when nothing
is selected, same as the Site Overview tiles below it it doesn't compete with). Its
mini legend now carries both a quantity/value toggle and, per segment, the actual
figure plus its percentage — where before it was percentage only. `facilityCapacity()`
in `warehouseMap.js` gained `warehouseValue`/`safekeepingValue`: the peso value of
inventory whose `warehouseAreaFor()` bucket lands in each group, summed straight from
the item list the floor plan itself buckets — not a second measurement, so it cannot
drift from the occupancy figures beside it. Available shows an em dash in Value mode
rather than a false ₱0 — empty floor space has no value.

**5. The expanded list's rows are compressed and carry different information.** The
old `.wpc` card (four stacked sections: code+badge, description, trade path, a
four-figure footer with Brand/Condition/Purchase Price) is NOT reused here — Warehouse's
list is now full width with no side panel to be narrow for, so a new `CompRow`
renderer lays out two lines per material instead of four: code + description, then a
single wrapping strip of exactly the five figures asked for — quantity, condition,
purchase price, trade, item group.

**6. Safekeeping's Overview gained a compressed Delivery Insight strip.** New
`DeliveryInsight` in `SafekeepingTab.jsx`, reusing `deliveryRows`/`DELIVERY_STATUSES`/
`deliveryStatusCounts` from the SAME data module the full Delivery Tracker reads (and
the same tone→colour mapping it uses), so the two can never disagree. Five compact
stat chips in one row — Total Scheduled plus the four urgency buckets — with a "View
full tracker" button that jumps straight to the Activity sub-view where the real
tracker (with its own filters) lives.

**Housekeeping.** Deleted the CSS this rewrite fully orphaned: the old `.comp-wrap`/
`.comp-gauge`/`.comp-gauge-info`/`.comp-stats`/`.comp-stat`/`.cs-*`/`.comp-tip` rules
(base and every `.overview-stack`-scoped override of them, across three separate media
query blocks) — the tiles are plain `.kpi-grid`/`.kpi` now, which already carries its
own responsive rules used by every other KPI row in the app.

**Verified against a temporary local fixture** (240 inventory lines, 700 ledger rows,
90 safekeeping lines; deleted afterwards, `dist/` confirmed clean of it) at 1440×900
and 375×812, light and dark:
- Composition tiles read Total Inventory/Available/Reserved/Incoming/Outgoing/Damaged;
  measured 92,162 + 21,826 + 14,197 = 128,185 — Available+Reserved+Incoming matching
  the displayed Total Inventory figure exactly.
- List closed on load (`.comp-expand` absent); clicking a tile opens it with the
  correct title, row count and active-tile highlight; clicking the same tile again
  closes it. Two tile columns at 375px, no horizontal scroll.
- Floor Plan's capacity widget renders with quantity ("164 pos. · 20%" etc.) and,
  after the toggle, value ("₱422.4M · 20%", "₱94.7M · 8%", "— · 72%" for Available).
  Stacks to a single column at 375px with no overflow.
- Safekeeping Overview shows the "Delivery Insight" card with five chips (all reading
  0 against this fixture, since it doesn't seed `deliveryTracker.js` — a fixture gap,
  not a widget bug); "View full tracker" correctly switches the sub-tab to Activity.
- No console errors on a clean tab; both themes render the composition list and the
  capacity widget without incident. `npm run build` passes.

### 2026-08-17 — Session: Delivery Tracker project column, Composition list as a masterlist table

**1. The Delivery Tracker has a Project column, and project is out of the Item cell's
subtitle.** Project is a field worth sorting and scanning down a column; buried in a
subtitle beside trade and batch it could not be either. Trade and batch stay on the
Item cell's second line — neither has a column, and both read as qualifiers of the
item rather than as facts in their own right. All nine column widths were rebalanced
to keep the percentage set summing to exactly 100 (26 + 10 + 10.5 + 6.5 + 5.5 + 11 +
10 + 4 + 16.5), which is what guarantees every column stays visible at any container
width — a pixel total only fits until the pane is narrower than it.

**2. The Warehouse Overview composition list is now the Inventory Master List's own
"Full" table.** The two-line `.comp-row` card from last session is gone; the expanded
list is a real `<table class="data inv-table">` with a header row, reusing
`.inv-item.full` / `.inv-desc` / `.inv-desc-sub` / `.inv-desc-path` wholesale so a row
here lines up column-for-column with a row on the masterlist page. Columns: Item Code,
Material Description (with the detailed description and the trade · item-group path
stacked beneath it), Qty, UOM, Purchase Price, Condition.

The quantity column's header is not fixed — it takes the clicked tile's own label, so
the same table reads "Reserved" or "Incoming" depending on which figure opened it,
and the number under it is that tile's column rather than a generic total.

Three deliberate deviations from the shared `.inv-table` rules, all commented in the
stylesheet: `min-width` is reset to 0 (the shared 948px floor exists to fit the
masterlist's ten columns and would force a horizontal scrollbar on this six-column
table); the header gets its own background, since the shared sticky-header rule leans
on a `table.data` background the masterlist page overrides for itself; and there is no
`.zero` dimming, because the peso column here is a plain figure rather than a value
ramp. The header is otherwise non-interactive — no sort carets, no drag grips — since
this list has one fixed order.

**Verified against a temporary local fixture** (240 inventory lines with detailed
descriptions, 700 ledger rows, 90 safekeeping lines, 60 delivery rows — the fixture
was extended this session to cover `detailedDescription` and `deliveryTracker.js`,
both of which earlier fixtures left empty; deleted afterwards, `dist/` confirmed clean
of it) at 1440×900 and 375×812, light and dark:
- Delivery Tracker header reads Item · Project · Target Delivery · Qty · UOM · Status ·
  Location / Tower · DP · Remarks; the Project column populates per row; the Item
  subtitle reads "Structural Works · Batch 2" with no project in it.
- Composition table header reads Item Code · Material Description · **Reserved** ·
  UOM · Purchase Price · Condition after clicking the Reserved tile, confirming the
  dynamic quantity header. First row rendered all three description lines (name,
  detailed description, trade path) and the right figures in each column.
- Sticky header holds position while the list scrolls; no horizontal overflow at
  desktop (table 1331px in a 1331px container). At 375px the table scrolls inside its
  own container (446px in a 314px box) exactly as the masterlist does, and the PAGE
  does not scroll horizontally.
- Dark mode contrast measured on all four text roles in the new table: header 5.84,
  body 6.79, detailed description 5.68, trade path 5.45 — all clear of 4.5:1.
- No console errors on a clean tab. `npm run build` passes.

**Measurement note.** Mid-session several checks reported "no table" after a click.
The cause was my own repeated toggling — each verification call clicked the same tile
again, and the tile is a toggle, so alternate calls were closing it. Confirmed by
reading `classList.contains('active')` before and after a single dispatched click
(false → true, table present). Not a defect.

### 2026-08-17 — Session: site card consolidation, purple high value, eight HV lines

**Level 1 — three blocks became two columns.** The site level was a capacity widget
above the map, the map, and a Site Overview beside it — three grid children, which left
the map sized by the shorter of the two columns. Now: **Site** (renamed from Stockyard)
on the left at full row height, and one card on the right titled **Warehouse Capacity**
(renamed from Facility Capacity) holding the gauge, its legend, and the site areas under
a "Site Areas" divider. `FacilityCapacityGauge` gained a `bare` prop that drops its own
frame and heading, because two headings stacked read as two separate widgets.
`.fp-layout` stretches its children and the map's stage flexes to fill; measured 832×712
and 536×712 at 1440×900 — equal height, which is what "full vertical" needed.

**Icon and label spacing is computed once now.** Both plans placed the icon and the text
independently, each guessing an offset from the block's centre, so the pair sat high or
low depending on how many lines the label wrapped to. New `PlanStack` in `planText.jsx`
measures icon + gap + wrapped text as ONE stack and centres that.

**The rebar icon was the other half of that problem.** Its artwork spanned x 3.2–17 of a
24-unit box, so the glyph's ink sat 2.6 units left of centre and its gap to the label
read 3.4 units tighter than its neighbours'. Redrawn to fill x 3–21 and y 3.4–20.9:
centre offset 2.62 → 0.28, gap 6.36 → 8.21 against 9.76 and 9.65 for the other two.

**Level 2 — high value is purple.** The reference deck legends the area #7030A0 and
nothing else on the plan is purple, so it is the colour that reads as "the locked room"
instantly. Like the yellow used for Safekeeping this is a documented exception to the
restricted palette, and the values are picked for contrast rather than copied raw:
#6b3fa0 light (7:1 on the drawing surface), #b9a0e0 dark (7.9:1).

**The high-value room has its real racking: eight lines, each clickable.** A single line
against each end wall and three back-to-back pairs between them — five physical runs,
laid out the way the rest of the shed is. Verified: gaps between consecutive lines run
9.75, 0, 9.75, 0, 9.75, 0, 9.75, so the pairs touch and the singles stand alone, all
eight inside the room with zero overlaps, 128 shelf positions.

The eight lines are now entries in `RACKS` rather than a decorative overlay plus a
separate `hvPositions()`. That deleted the whole `highvalue` special case from
`placement()`, from `areaCapacity()` and from the panel's jump buttons — a shelving line
is a rack, so every helper treats it as one, and `RackElevation` dispatches on
`rack.kind` to draw it on the LS600 shelf elevations instead of the pallet beams.

**Rack numbers are suppressed on runs too shallow to hold one.** The shelving lines are
8 units deep against a rack run's 17, so eight numerals landed on top of each other.
Below 12 units the number is dropped; those lines are identified by hover, by the H1–H8
jump buttons and by the elevation they open.

**Also:** the clickable Open Flat Area drops to 0.34 fill opacity (0.6 on hover) — still
clearly clickable, but it is a big block and at rack strength it pulled the eye off the
racks themselves.

**Verified** at 1440×900 and 375×812 across twelve views — site, site with an area
selected, warehouse in both orientations with sections on and off, high value selected,
and the pallet / shelving / cantilever / floor elevations — zero labels clipped, zero
overlaps, nothing outside a scroll container. HV Line 3 opens a 16-cell elevation with
the LS600 spec. `npm run build` passes.

**Concurrent session, resolved.** The second session has landed its work; only floor-plan
files were staged from here. `--fp-highvalue` is now declared in both `index.css` (grey)
and `floorplan.css` (purple) — the later file wins, which is the override pattern that
split was made for.

### 2026-08-17 — Session: Safekeeping tab restructure + delivery/masterlist formatting + floor-plan declutter

Two clarifications settled first: the Delivery Tracker's five project short-codes map to
their proper project names (AVESTA → Avesta Residences, JABS → 4PH Jab Greenwoods
Dasmariñas, JENARA → 4PH Jenara Orchard Dasmarinas, STREVI → 4PH Strevi Bacoor,
Southscape → Southscapes Trece Martires), and the Safekeeping masterlist keeps its
Stock-on-Hand / Incoming / Outgoing sheet switcher.

**Safekeeping tab (`SafekeepingTab.jsx`, `safekeepingInsights.js`, `index.css`).**
- The sub-views went from three (Overview / Insights / Activity) to two
  (**Overview / Masterlist**). Old `?view=insights|activity` URLs fall through to
  Overview since they are no longer in `VIEWS`.
- The compressed **Delivery Insight** card is gone (component + its `.dins-*` CSS
  deleted). The **full Delivery Tracker now lives at the foot of the Overview**, below
  the KPI row and the Distribution card — it used to be the separate Activity view.
- **Insights → Masterlist**, and the card inside renamed *Safekeeping Source Tables* →
  **Safekeeping Masterlist**.
- The Stock-on-Hand sheet's columns are relabelled to the requested spec: **In →
  Incoming**, **Out → Outgoing**, Description → *Material Description*. Its secondary
  (2nd-line) description now folds in **trade · item group** via a new per-sheet
  `descKeys` (defaulting to the sheet's Section grouping) — project was dropped from
  that line because it already heads each Section band and reads as a holding location,
  not a description. Incoming/Outgoing sheets are unchanged.

**Delivery Tracker (`DeliveryTracker.jsx`, `deliveryTracker.js`, `lib/format.js`).**
- Table rebuilt in the Inventory Master List's **Full format**, PIXEL column widths so
  the table has a real intrinsic width and scrolls sideways: **Material Description
  (trade · batch on line 2) · Project · Target Delivery · Qty · UOM · Location/Tower ·
  DP · Remarks**. On a desktop everything up to DP is visible and **Remarks sits just
  past the right edge**, reached by horizontal scroll.
- **Projects** now render their proper names (mapping above), applied in
  `rebuildDeliveryRows()` so the column, the filter dropdown and the search all use them.
- **Target Delivery** week estimates changed from "2026 Aug 1st Week" to the requested
  **"2026 Aug W1"** (`WEEK_ORDINAL` → W1–W5 in `fmtTargetText`). The other forms
  (`2026 Jun 01`, `2026 Jun`, `2026 Mid Sep`) were already correct.
- **Location / Tower** standardised through a new `fmtTower()`: "Tower 1 & 2" → "T1, T2",
  "Tower A & B" → "TA, TB", "T2, T5 & T10" → "T2, T5, T10", "Tower I, J, H & A" → "TI, TJ,
  TH, TA".
- **Data-gap note (honest limitation):** the source "Warehouse Schedule" sheet has **no
  item code, no detailed (2nd) description and no item group**, so those three requested
  sub-fields have no data behind them and are not shown — trade and batch are the
  qualifiers that exist. The **Status** column was also dropped to match the requested
  column list; status still drives the KPI filter row above the table. (Both are easy to
  restore/populate later if the source gains those fields.)

**Warehouse floor plan.**
- *General* — the coloured **material blocks now show only their icon**, no wordmark
  (`SitePlan.jsx`, `WarehousePlan.jsx`); a **legend** under the plan (`FpLegend` in
  `StorageMap.jsx`) decodes each area's colour swatch + icon → name, on both the Site and
  Warehouse levels. Rooms, the open-floor label, rack numbers and the Open Stock Yard
  label stay (context / identifiers, not the coloured area blocks). The one-rack-deep
  runs (Structural, Architectural) get no icon — too shallow — and are read from the
  legend and hover.
- *Level 1 — Warehouse Capacity gauge* (`FacilityCapacityGauge.jsx`): the qty/value
  toggle is gone; it now speaks only in **percentage of floor space**, printed both on
  each band of the battery and in the legend. Segments still fill from the base up
  (Warehouse → Safekeeping → Available). Dropped the orphaned `.cap-figure` CSS; added
  `.cap-seg-pct` for the in-tube labels.
- *Level 3 — Racking* (`RackElevation.jsx`, `StorageMap.jsx`, `index.css`): recoloured to
  **red = occupied, green = available** (the finer low/out shading dropped); legend is now
  just those two. **Measurements removed** — the mm beam-elevation axis labels, the "mm"
  cap, the "900 mm CENTRES" caption and the whole `RackSpec` dimension strip are gone.
  **Hint descriptions removed** — the "bay counts are modelled" card-note and the panel's
  placement note.

**Tooling.** `vite.config.js` now honours a `PORT` env var (falls back to 5173) and
`.claude/launch.json` gained `"autoPort": true`, so the preview server can bind the port
the harness assigns instead of colliding on 5173.

**Verified** with `npm run build` (passes) and in the browser preview (demo login, so
tables hydrate empty — real rows need a Supabase session): the Safekeeping Overview shows
only Overview/Masterlist, KPIs → Distribution → Delivery Tracker with the exact new column
header set; the Masterlist card is titled *Safekeeping Masterlist* with Item Code /
Material Description / UOM / BOH / Incoming / Outgoing / SOH / Class and the SOH/In/Out
switcher; the Site level renders the area legend with block wordmarks gone and the capacity
gauge showing percentages and no toggle; the Racking level shows the Available/Occupied
legend with no spec strip, mm labels or hint notes. No JS console errors (the lone 400 is
the expected Supabase hydration call under the session-less demo login).

### 2026-08-18 — Session: trade rename, double-donut, dashboard mobile pass

Eleven changes across the dashboard (mobile fixes + general behaviour).

**Trades renamed app-wide.** New `renameTrade()` in `src/data/trades.js` is the single
canonical transform — "General Requirements" → "General Hardware", and every "… Works"
trade drops the "Works" suffix (Structural Works → Structural, Electrical and Auxiliary
Works → Electrical and Auxiliary, etc.; Allied Services unchanged). The `TRADES` keys and
`SHORT_L1` are already the new names, and `renameTrade` is applied where trade values enter
the app as data so every consumer shows the new label: `rebuildItems` (insights.js),
`rebuildDeliveryRows` (deliveryTracker.js — the `TRADE_BY_CATEGORY` values), and
`rebuildSafekeeping` (safekeeping.js). The floor-plan area matching (`WH_AREAS.trades` in
warehouseMap.js) was updated to the new names too, since `warehouseAreaFor` compares the
now-renamed `item.tradeL1` against those literals.

**Inventory Distribution — double-donut mode.** New icon-only toggle
(`donutSingle`/`donutDouble` glyphs) beside the Quantity/Value toggle. In double mode the
donut draws two concentric rings — **quantity inner, value outer** — sharing categories and
colours; the Quantity/Value toggle is hidden there (both are shown). `makeLeaderLabel` gained
a `double` path: the leader labels sit on the outer (value) ring and each prints the category
name, the value (with its value-share) and, beneath it, the quantity (with its quantity-share).
The centre readout shows both totals. `DistributionDonut` renders two `<Pie>`s in this mode.

**Clicking the donut centre lists all items.** New `onCenterClick` on `DistributionDonut`,
wired to a `.donut-center-hit` element sized to the hole — the surrounding `.donut-center`
stays `pointer-events:none` so ring slices remain clickable; only the hole re-enables clicks.

**Composition "Available" tile → "Stock on Hand".**

**Inventory Masterlist Reset button** now resets the WHOLE table to default — filters, sort,
Section/Full grouping, collapsed bands and dragged column widths — and is enabled whenever any
of those differ from the default view (was: filters only, and disabled unless a filter was set).

**Mobile.**
- **Composition list Material Description column** no longer collapses: `.comp-table` gets a
  560px `min-width`, so on a phone the list scrolls sideways (inside `.comp-rows`) instead of
  squeezing the description to nothing.
- **Toggles are icons-only** — the `.toggle-lbl` text is hidden and the glyph shown (the old
  rule did the reverse). Every Toggle option carries an icon; Segmented (period picker) keeps
  its text.
- **Distribution scope/metric/double toggles** align on one wrapping row in the card footer
  rather than stacking into a column.
- **Distribution list collapsed by default on a phone** (`defaultDonutSel()` returns null under
  900px), expanding when the donut, a slice or the centre is pressed; the mobile panel sizes to
  content instead of holding a fixed 320px.

**Sub-tabs (Overview/Insights/Activity, Overview/Masterlist) are centred horizontally.**

**Search bar vs New Transaction button:** verified the button already stretches to match the
expanding filter bar (`.dash-toolbar-row` is `align-items:stretch`, `.txn-trigger` is
`height:100%`) — measured 40px→117px in step with the search bar when a filter token is added,
so the two stay equal-height. No change needed; if a compact top-pinned button is preferred
instead, that is a one-line flip.

### 2026-08-18 — Session: tap highlight, head toggles, composition/distribution revamp

Nine changes across the dashboard.

**Mobile tap highlight killed.** `* { -webkit-tap-highlight-color: transparent }` — the blue
box mobile browsers flash on press/hold of any clickable element is gone.

**Toggles back in the card head (desktop).** Every chart toggle that had moved to a `card-foot`
row is now passed as `right` on the `Card`, so it sits top-right beside the title and — because
`.card-head` is `flex-wrap:nowrap` — never wraps to a new line on resize. Applied to the
Inventory Distribution, High Stock, Aging, Movement History, Net Change and Top Incoming cards,
and the Safekeeping Distribution + Masterlist cards.

**Single/double-ring toggle is icon-only everywhere.** New `.toggle.toggle-icons` class (labels
hidden, glyph shown at every width); the distribution mode switch uses it on both mobile and
desktop.

**Composition card unwrapped.** The `<Card title="Inventory Composition">` wrapper is gone — the
six KPI tiles now stand on their own like the Safekeeping tab's KPI row, under a bare header
row (`.section-bar`: label left, Quantity/Value toggle right). The KPI hover tooltip is
suppressed while a tile is `active` (`.kpi.active .kpi-tip { display:none }`) and the active
tile no longer lifts on hover — that stacked feedback was the "weird overlapping".

**Distribution lists → compressed masterlist table.** New shared `CompactTable` + `DescCell` in
`MaterialList.jsx`; `CardListPanel` renders it when given `columns`. The Inventory Distribution
list is now Item Code · Material Description (detailed description + trade path as muted secondary
lines) · Qty · Price; Safekeeping's is Item Code · Material Description (trade · item group) ·
SOH · Class. The list panel is wider (`--clp-w` 560 / 660 on `.wh-overview`).

**Safekeeping distribution defaults to the full list**, and pressing the donut centre re-selects
it — matching the Warehouse tab (`defaultSkSel()`, `all` selection, `onCenterClick`).

**Delivery Tracker list.** Added an **Item Code** first column, resolved from the item master at
runtime by keyword (no codes committed to the repo — see `codeByKey`/`useItemMaster`). The item
strings are split by a curated `MATERIAL_MAP` into a proper **material name** with **brand** and
optional **detail** riding the Material Description cell's secondary lines (masterlist style),
with trade · batch beneath. Remarks are rendered subtly (`.dtk-remarks`, muted/lighter). Item
name/brand mapping confirmed with the user (Lonon → London, Splice Sleeve as the brand, etc.).

**Verified** with `npm run build` (passes) and in the browser against a temporary fixture
(deleted afterwards; `dist/` clean): composition has no card wrapper (6 tiles + bare header),
distribution toggles sit in the head with `flex-wrap:nowrap` and the single/double toggle is
icon-only, the distribution list is the compact table (Item Code · Material Description · Qty ·
Price, 32 rows, "All Items" default), the active tile's tooltip is hidden, the panel is 560px,
tap-highlight computes to transparent, Safekeeping defaults to "All lines", and the Delivery
Tracker header leads with Item Code. Delivery item codes resolve only against a live item master
(session-less demo shows "—").

**Verified** with `npm run build` (passes) and in the browser against a temporary fixture
(deleted afterwards; `dist/` confirmed clean): trade leader labels read the new names; double
mode renders 2 rings with name+value+quantity labels, zero clipped and zero overlaps; centre
click lists all 32 items; at 375px the toggles are icon-only, sub-tabs centred, the distribution
list collapsed (113px) with no page h-scroll, and the composition Material Description column
present (114px) with the table scrolling sideways.

### 2026-08-17 — Session: remove icons from the level-1 site plan

The clickable area blocks on the site plan (Central Warehouse, Deformed Rebar Area,
Tiles Area, Material Recovery Facility) no longer draw an icon into the shape. The
`FpLegend` a concurrent session added beneath the plan already decodes colour + icon +
name, so the on-plan icon was saying the same thing twice; each block now reads by its
colour and position alone, with the legend as the key. `iconFor`/`centreOf` and the
`Icon` import are gone from `SitePlan.jsx` — nothing else in that file depended on them.
The Open Stock Yard's own text label is untouched.

Verified: 0 icons drawn inside `.fp-svg` at level 1, the four-item legend still lists
every area by name, zero label overlaps, zero page scroll. `npm run build` passes.

### 2026-08-25 — Session: SAP integration briefing document

No app code changed. Added `docs/sap-integration-brief.md` — the preparation
material for the working session with the SAP specialists: the system-of-record vs
system-of-engagement framing, the responsibility split to propose, the ten
discovery questions their landscape hangs on (ECC vs S/4, on-prem vs RISE, which
modules, whether BTP/CPI exists), a table mapping every one of our Postgres tables
to its SAP object (`inventory`→`MARD`/`MB52`, `ledger`→`MKPF`/`MSEG`,
`movements`→`BAPI_GOODSMVT_CREATE`, `purchase_requests`→`EBAN`, and so on), the
five integration mechanisms ranked (OData/Gateway, BAPI/RFC, IDoc, BTP Integration
Suite as middleware, file exchange as the stopgap) plus the three to refuse, the
outbox/idempotency/reconciliation architecture, the movement-type cheat sheet, the
Digital Access licensing exposure, a four-phase rollout with gates, and the
shopping list to hand over at the end of the meeting.

Two app-side facts recorded there because they will surface in that meeting: a
public GitHub Pages site will not survive an SAP security review once it touches
production data, and RFC/most SAP auth flows need a server-side component the app
does not currently have.

### 2026-08-25 — Session: SAP brief rewritten for Business One

The first draft of `docs/sap-integration-brief.md` aimed at ECC/S4HANA. Megawide
actually runs **SAP Business One 10**, reached at
`https://sapcloudv10-02.megawide.com.ph:8200/dispatcher/` — the `/dispatcher/` path
on a high port is B1 **Browser Access** (documented default 8100), and `sapcloudv10`
names the version. Different product, different database, different vocabulary, so
the document was rewritten rather than amended.

Discarded as wrong-product: BAPI, RFC, IDoc, SAP Gateway, ABAP transports, the
Cloud Connector, movement types (101/221/311), `MARA`/`MARD`/`MSEG`/`EBAN`, and the
Digital Access licensing model.

The replacement answer is the **Service Layer** — B1 ships a REST/OData v4 API on
port 50000 at `/b1s/v2/` that already does read AND write on every object we need,
so nothing has to be built on the SAP side. That collapses the timeline and makes
the read-write connection (now the stated requirement) available from day one
rather than after a read-only phase.

Rewritten around B1 objects: `Items`/`OITM`, `ItemWarehouseInfoCollection` for
stock, `InventoryGenEntries` (goods receipt), `InventoryGenExits` (goods issue),
`StockTransfers`, `PurchaseDeliveryNotes`, `PurchaseRequests`, `Warehouses`,
`BinLocations`. Three new decisions the meeting has to settle: whether bin location
management is enabled (it determines whether our floor plan mirrors B1 or stands
alone), what `damaged_qty` maps to (B1 has no blocked-stock status), and whether
`reserved_qty` becomes an `InventoryTransferRequest` or stays an app-only hold.

Duplicate-posting prevention is now easy: B1 lets an admin add a **user-defined
field** with no programming, so we write our own reference onto every document and
check it before posting. Five minutes of their time, and it is also what makes
per-document reconciliation possible.

Audience corrected too — the meeting is with Megawide IT’s in-house SAP team, not
an external reseller, so the partner-billing framing was dropped.

### 2026-08-17 — Session: cylinder capacity chart, identity plates, plan declutter

**Warehouse Capacity is a cylinder now** (`FacilityCapacityGauge.jsx`, rewritten). Drawn
as a vessel seen slightly from above and filled from the base up, after the HyperOS
storage meter: red for warehouse-owned racking, yellow above it for Safekeeping, clear
glass for what neither has filled. Every band's height is exactly its share of the total
positions, so it is a stacked bar that happens to be round — the 3D is decoration, not
data. Hovering a band (or its legend row) draws a leader line out to the name, the
percentage and the position count; the other bands drop back.

Each slab is a straight wall closed by the FRONT half of the ellipse at both ends, with
its own full ellipse capping the top, drawn base-upward so each cap covers the wall
below it. Curvature is one shared black-to-clear-to-black gradient over the flat fill,
so it works for any band colour without a second palette.

**A layout trap worth recording.** With the svg in flow at `width: 100%`, its viewBox
aspect ratio (470/320) demanded 733 px of height from a 499 px column and dragged the
whole grid row to 1,026 px — well past the fold. The svg is now `position: absolute;
inset: 0` inside a `flex: 1` stage, so it contributes no intrinsic height and
`preserveAspectRatio` centres the cylinder in whatever box the stage gets. Both cards
measured 655 px and the page stopped scrolling.

**Identity plates replace both legends.** New `planIdCard.jsx` draws an area's plate
INSIDE the plan svg — colour bar, icon, name, floor area, occupancy — which is what makes
the leader line free: both ends are already in the same coordinate space, so joining a
block to its plate is one polyline. Level 1 stacks all four in the drawing's top-right
corner like a title block; level 2 shows one on hover with a leader line back to the
section, and nothing at all otherwise.

Floor areas are derived, not invented: the site drawing states the shed at 2,520 m², and
that single figure fixes m² per viewBox unit for every other site area (`siteAreaM2`).
Inside the shed the scale is the raster's own ~76 mm per pixel (`whAreaM2`). Occupancy is
positions in use over positions the racking drawing provides — so the outdoor yards,
which have no recorded capacity, print "no capacity data" rather than a made-up number.

**Also on the plans:** level 1 lost the Site Areas tile list (the right column is the
cylinder alone) and level 2 lost its area icons and the Open Flat Area wordmark. Both
bottom legends are gone.

**Two fixes found while verifying.**
- `wrapLabel`, not `fitSize`, is what a plate name needs. `fitSize` only shrinks until
  the longest WORD fits, so MATERIAL RECOVERY FACILITY still overran the plate by 29
  units; shrinking it far enough to fit one line would have put it at ~6 px on screen.
  It wraps to two lines instead and the plate is 50 units tall to suit.
- The level-2 plate was showing for a SELECTED area as well as a hovered one, which
  parked it permanently on the heads of racks 10 and 11. Hover only now — a selected
  area already has the full panel beside the map.

**Verified** against a temporary anonymised fixture (deleted afterwards; `main.jsx`
restored and `dist/` confirmed clean) at 1440×900 and 375×812, light and dark, across
sixteen view/theme combinations: zero labels clipped, zero overlaps, nothing outside a
scroll container, no vertical page scroll on the site level. With data the cylinder read
32% / 16% / 52% summing to 100, and the Central Warehouse plate's 48% matched the two
filled bands. Hover exercised on both the cylinder bands and the level-2 hulls — note
React derives `onMouseEnter` from delegated `mouseover`, so a dispatched `mouseenter`
does nothing; the checks use `mouseover`/`mouseout`.

**Console caveat, again.** The browser pane keeps its console buffer across dev-server
restarts and hard navigations, so `fitSize is not defined` kept reappearing after the
import had been changed. `curl`-ing the served module and grepping it (0 hits) is what
settled it. Judge a stale-looking error by the module the server is actually serving.

### 2026-08-25 — Session: new module — Process Flow (system map, generated + authored)

New module at `/process-flow`, in the sidebar for every role (deliberately not locked:
its stated audience is management, procurement, warehouse, developers and future
administrators). Eight views held in `?view=` so each is a shareable link and Back works
between them: Journey, Processes, Architecture, Database, Data Flow, Access, Security,
Dependencies.

**The one rule the module is built around: nothing may describe a workflow without
saying whether that workflow actually runs.** Every node, table claim, permission and
finding carries one of four statuses — `live` / `partial` / `planned` / `recommended` —
and the legend defining them sits at the top of the module rather than at the foot of a
card, because every diagram mixes what exists with what does not.

**Half the module is GENERATED, and that is the point.** A hand-maintained table
catalogue drifts the first time someone adds a column, and documentation that lies is
worse than none. `npm run model` runs two new scripts:

- `scripts/generate-db-model.mjs` parses `supabase/schema.sql` → `src/data/generated/dbSchema.js`.
  17 tables, 200 columns, 12 relationships, 40 policies, 2 triggers, 3 functions, 1 enum.
  Cardinality is INFERRED, not declared: a foreign key that is also the child's own
  primary key can only match one parent row, so it is one-to-one. Column counts were
  validated against a hand count of all 17 tables — zero mismatches.
- `scripts/generate-code-model.mjs` walks `src/` → `src/data/generated/codeMap.js`.
  77 files, ~18,100 lines, the real import graph, the Supabase call sites, the routes
  parsed out of `App.jsx`, and the dependency audit.

Neither generated file contains a single row of warehouse data — verified by grepping for
item-code patterns, project names and peso figures. They hold column names, file paths
and policy expressions, all of which are already in the public repository.

**Three parser bugs found and fixed while validating the output**, each of which had
produced a confident falsehood:
- Inline `-- comments` swallowed the column declared on the NEXT line, costing
  `delivery_tracker.uom` and `safekeeping_requests.created_by` (and with it one
  relationship). Comments are now stripped per line, quote-aware.
- `commentAbove()` skipped blank lines while hunting for a comment, so `movements` was
  documented as `"===== TRANSACTIONAL TABLES — created EMPTY…"` — a heading for eight
  tables presented as the description of one. Adjacency is now required.
- The dependency audit scanned only `src/`, so `vite` and `@vitejs/plugin-react` reported
  as UNUSED. It now also reads `vite.config.js` and the scripts. Exactly the kind of
  assertion this module must not print.

**`src/data/processFlow.js`** is the authored half — the part needing judgement. The
end-to-end journey (17 stages, 24 nodes), six process domains (57 steps), the
architecture layers, six eight-step data-flow traces, the role matrix, the security
sections, nine ranked vulnerabilities and the dependency commentary. `TABLE_NOTES` gives
all 17 tables a plain-English description, because the schema's own comments cover only
nine of them; the detail panel shows the schema comment underneath where the two differ,
so the provenance of each sentence stays visible.

**Counts on the page are counted, never asserted.** `SUMMARY.tally` walks every structure
at import. An earlier draft of the journey's break-points card said "four points do not
reach the database" and there were six — now derived.

**Diagrams are drawn by hand; no diagram library was added.** React Flow or Mermaid would
have roughly doubled the app's download for one documentation page, against five runtime
packages today. `FlowDiagram.jsx` renders nodes as real `<button>` elements positioned
absolutely with a single SVG edge layer behind them — SVG has no text wrapping, so every
label would otherwise need a hand-rolled line breaker and still not ellipsise, focus or
read to a screen reader. Panning is native scrolling on an `overflow:auto` viewport, with
drag-to-pan added for the mouse. `ErdDiagram.jsx` lays tables out by dependency rather
than by hand: no foreign keys either way, holds foreign keys, referenced by others. That
grouping is what makes one absence visible — `audit_log` is transactional and still lands
in the first column with nothing leaving it, because it records an email as text instead
of referencing an account. The column heading names the RULE rather than describing the
tables, because "Reference sheets" (the first draft) mislabelled the audit log as a sheet.

**Layout decisions that were bugs first:**
- The vertical layout rotated the node box to 78×208 — about four characters a line.
  Rewritten around named `main`/`cross` axes so both orientations are one piece of
  arithmetic; the box is always 208×78.
- Reading ACROSS, the 17-stage journey is 4,900 px wide and fit-to-width lands at 40%,
  which renders a 12 px label at five pixels. Down is now the default for every flow, and
  `MIN_FIT` (0.85, shared with the ERD) stops fitting from ever shrinking below readable —
  the viewport scrolls instead, the same trade the masterlist already makes on a phone.
- Filtering by status DIMS rather than removes. Dropping boxes would leave arrows pointing
  at nothing and imply the process is shorter than it is.
- An edge into an unbuilt step is dashed. Solid would claim a working connection.
- The orientation button is labelled with what pressing it gives you, not the state you
  are already in.

**Live database check** (`LiveProbe.jsx`) asks the running Supabase project for a row
COUNT on each table — `head: true`, so no data crosses the network — on the signed-in
user's own token. It therefore reports what *that account* may see, which is the honest
demonstration of the coarse-RLS finding. Two things it now says that it did not at first:
if EVERY reference table counts zero that is a permissions result and not an empty
database (a session-less demo login produces exactly that, and reading seventeen zeroes as
data loss would be a reasonable mistake), and the reassuring "an empty transactional table
is expected" footnote is scoped to transactional tables only.

**The Access view describes each role twice, side by side, because the interface and the
database disagree** — and that gap is the most useful thing on the page. The database
recognises exactly two kinds of user, administrator and everyone-else-signed-in, so all
four operational roles hold identical rights: a project-site user shown "available stock"
can read every unit price and the whole valuation, and `hydrate()` already downloads all
of it into their browser. Also recorded there: `ROLES[*].menu` — a full per-role menu
definition for each of the five roles — is read by nothing at all, because the sidebar was
changed to one shared list with padlocks and the old menus were left behind.

**Nine vulnerabilities, ranked, each with its location and its fix.** The one to act on
first: `handle_new_user()` assigns a role from the text before the `@` and never looks at
the domain, so if email signup is enabled on the Supabase project — the default for a new
project — anyone registering as `admin@` any domain becomes an administrator of this
application. That setting cannot be read from the code and must be checked in the
dashboard. Also flagged: nothing writes to the audit log AND `audit_log.user_email` has no
default from the token, unlike every other table, so an entry could be attributed to
anyone; and the profiles `status` column plus the Users screen's Enable/Disable control
have no effect on access at all, which is worse than having no control.

**A notice on the page about the page.** The repository is public and this module ships in
the published bundle, so the vulnerability section is world-readable. The underlying facts
already were — `schema.sql` is committed — but this page collects them into one list, and
it now says so where a reader will see it, with the one-line change that would restrict
the view.

**Module-scoped contrast fix.** This module prints a lot of 10–11 px type on the palette's
matching weak tint, and in light mode four of the six pairs fall short of 4.5:1 — the
warning yellow on its own tint is 3.4:1, brand red 3.5:1. Text now uses a darker `--ink-*`
of the same hue while borders, dots and fills keep the palette colour; and `--text-faint`
is darkened inside `.pf` only. The shared palette is untouched — the rest of the app uses
these pairs at larger sizes, and re-toning it is not this module's job.

**Also:** a purpose-drawn `flow` icon (two inputs joining one output — `layers` reads as
stacked data and `reorganize` as moving stock); a Process Flow step added to the guided
tour, anchored on the view tabs; `npm run model` added to package.json.

**Verified** on a clean dev server at 1280×720, 1440×900 and 375×812, light and dark,
across all eight views. Journey: 24 nodes, 26 edges (13 dashed), 17 stage labels, 100%
zoom on desktop, zero clipped labels, zero overlaps, zero nodes outside the canvas. ERD:
18 boxes including `auth.users`, 12 edges, 24 cardinality marks, zero overlaps, no clipped
names. Status filter dims 9 of 24 and still renders all 24. Search returns 8 matches for
"audit" across journey, processes, tables, proposed roles and findings, and highlights the
matching nodes. Expand-all/collapse-all, node click → detail with evidence, ERD box click →
column list with policies and triggers, and the live probe all exercised. Admin's card
correctly shows no padlocked menu items where the other four do. No page-level horizontal
scroll and nothing outside a scroll container on any view at any width; the diagrams
scroll inside themselves on a phone at 85% (10.2 px effective labels). Contrast audited
element-by-element in both themes: every text/background pair in this module's own CSS
clears AA. Three failures remain and all three are shared app chrome that pre-dates this
work and appears on every dashboard screen — `.sub-tab.active`, `.btn-primary` and
`.badge-ok`, all white-or-tone on brand red at 4.12–4.38:1. No console errors on a fresh
tab. `npm run build` passes; the whole model lands in the page's own lazy chunk (193 KB
JS, 43 KB gzipped, plus 27 KB CSS) and the main bundle is unchanged.

**Measurement notes for the next session.** Two traps, both self-inflicted and both
already recorded in earlier entries — worth reading before trusting a reading here. React
18 batches state updates, so a `.click()` and a DOM read in the SAME injected script
always return the pre-click DOM; and because the node is a TOGGLE, clicking it in each of
several verification calls silently alternated select and deselect, which looked exactly
like a broken handler. One click, then read in a separate call, and count the parity.
Setting a controlled input's `.value` directly does nothing either — React's value tracker
sees no change, so the native `HTMLInputElement.prototype.value` setter has to be used
before dispatching `input`. The console buffer also survives hard navigations, so the
`height is not defined` errors from an intermediate edit kept reappearing; a fresh tab is
what settles it. Screenshots remain unavailable while the browser pane is hidden, so every
figure above is a DOM measurement.

**Not done, deliberately:** the module documents the write-path gap rather than closing any
of it, which is Phase 3 and a much larger change. The guided tour's Insights step still
describes the ABC analysis chart that an earlier session deleted — spun off separately
rather than fixed here.

### 2026-08-25 — Session: Process Flow made executive-ready — arrows, density, alignment

Feedback on the module as first built: too many words, too much happening at once, not
executive-level, alignments off, arrows confusing. All four were fair. The arrows were
two separate bugs and both were mine.

**Arrow bug 1 — proposals were drawn inside the chain.** The journey put my
recommendations (single sign-on, a second factor, a narrower data load) as parallel
boxes beside the real steps, and the "look something up" branch skipped three stages to
reach Reporting. Result: 24 boxes, 26 arrows, branches converging and one long arrow
crossing three rows. The journey is now **strictly sequential** — 18 stages, one box
each, 17 arrows, no forks and no skips. Colour alone carries where it breaks, which is
what a reader actually scans for. The four proposals moved to `JOURNEY_RECOMMENDATIONS`
and are LISTED beside the diagram rather than drawn in it: a dotted box next to a real
step reads as though the step already has an alternative.

**Arrow bug 2 — and the more interesting one. Arrows were joining BOXES when they
should have joined STAGES.** Connecting every box to every box in the next stage looked
reasonable and produced a mess: two boxes followed by two more gives four arrows in an
X, and Warehouse operations reached **18 arrows for 11 boxes**. The real error was
semantic, not visual — the boxes inside one stage are not steps that follow one another,
they are the aspects of that stage (Receiving holds the warehouse receipt AND the
safekeeping receipt). Arrows between them asserted an order that does not exist. Edges
are now stage-to-stage, one per transition, measured from the group's own bounding
faces. Warehouse went 18 arrows → 5. Every diagram is now exactly (stages − 1) arrows,
and every single one measured **straight, zero curved, zero crossings possible**.

`edgePath` also draws a straight line whenever the two faces align rather than always
curving: a bezier between two boxes sitting directly under one another bulges for no
reason and reads as though it is going somewhere.

**Alignment bug — stage titles sat in the arrow gap.** Reading down, each title was
placed in the gap ABOVE its row, which is precisely where the connector runs: every
arrow was drawn through a line of text. Titles moved into a left-hand **gutter**
(104 units), right-aligned against the box column. Measured after: all 18 boxes share
ONE left edge, all 18 titles share ONE right edge, zero titles intrude into the box
column, zero arrows cross text. The vertical layout now reads as a timeline, and the
content narrowed from 462 to 344 units so it fits a desktop column at 100%.

**Alignment bug — the severity chips.** `min-width: 62px` is not a fixed width, and
"medium" needed 66.9px, so its three rows pushed their titles 5px right of the other
six — nine findings with two title columns. Now a fixed 72px. Measured: one mark
column, one title column, one caret column.

**Density — three long views became scan-first.** New `ExpandRow`: one card, N rows,
each a status mark, a title, a one-line summary, and the argument behind a click. Nine
bordered vulnerability cards each holding two more coloured blocks made Security 4,400
pixels of stacked frames — accurate, and not something anybody would read.
- Security **4,422 → 2,229 px**, 12 cards → 4
- Data Flow **2,881 → 1,078 px**, 6 cards → 1 (first trace open, rest closed)
- Access **3,576 → 1,515 px**, 6 cards → 2
Each carries its own Expand all / Collapse all.

**Words — cut roughly in half.** House style is now recorded at the top of
`processFlow.js`: one sentence per `detail`, under about 140 characters, written for an
executive reader; if a point needs a paragraph it belongs in the changelog, not on the
page. The opening lede went from four lines explaining the four statuses — which the
legend directly below already does — to one sentence. Legend descriptions are one short
line each. The provenance footer, the ERD note, the access intro, the vulnerability
intro and the public-repo notice were all trimmed. The journey view now renders 470
visible words against roughly 1,100 before, and the module's lazy chunk fell
**193 KB → 164 KB** (43 → 34 KB gzipped) on prose alone.

The header strip leads with the five figures that matter — tables, routes, policies,
1 of 7 transactional tables ever written to, 3 high-severity findings — instead of file
and line counts.

**Two lists replaced two cards.** "Where it breaks" and "Proposed additions" sit side by
side under the journey as plain rows (`.pf-mini`), not bordered mini-cards: six boxes
inside a card inside a page was three frames deep. Both counts are derived.

**Mobile fix found while verifying:** `.pf-two` kept two columns at 375px, giving two
~160px columns narrower than the sentences in them. Now stacks under 900px. The expand
rows drop their status chip and tighten their padding on a phone so the title keeps the
width.

**Verified** at 1280×720 and 375×812, light and dark, across all eight views. Journey:
18 boxes, 17 arrows, 17 straight, 0 curved, 8 dashed, 100% zoom on desktop and 91% on a
phone, one box column, one title column, zero clipped labels, zero overlaps. All six
process diagrams: edges exactly stages−1, all straight. Card head heights uniform at
59px on every view. Zero overflowing elements and zero page horizontal scroll on any
view at either width. Security rows measured uniform after the chip fix; expanding a row
swaps the one-line summary for detail, verify, fix and evidence. Contrast unchanged —
this module's own CSS still clears AA in both themes; the only failures remain shared app
chrome (white on brand red, 4.12:1) that appears on every dashboard screen. No console
errors on a fresh tab. `npm run build` passes.

**Measurement note.** The stale-console trap bit again: `edgesFor is not defined` and
`nodeById is not defined` kept reappearing from the intermediate edit states long after
the build was clean, because the console buffer survives hard navigation. A fresh tab is
what settles it — that is now three sessions in a row.

### 2026-09-02 — Session: September stock snapshot imported; storage locations become real

New source: `sample/MCC. PRC. WM. CW Taytay Inventory. 2026 09 02.xlsx`. It is not a
refill of the July workbook — it is shaped differently, drops four columns and adds a
hidden sheet that changes what the floor plan is able to claim.

**The reading rules are now a committed script, not a one-off.** `npm run import -- "<xlsx>"`
(`scripts/import-snapshot.mjs`) regenerates `/private-data/{inventory,ledger,safekeepingSheets}.js`;
`npm run seed` then turns those into the SQL. The July generator was ad-hoc and was not
kept, so this file had to be decoded from scratch — that cost is paid once now. Reading
the workbook needs no npm package: `scripts/lib/xlsx.mjs` walks the ZIP with node's own
`zlib` (ZIP64-aware) and parses the sheet XML, per the standing note that this machine
has no Python and the app carries only five runtime dependencies.

**What the workbook changed.**

| | July | September |
|---|---|---|
| Warehouse SOH | sheet "CW SOH", 779 lines | sheet "SOH", **827** |
| Safekeeping SOH | its own sheet, 132 | same sheet, **178**, split by Project Origin |
| Movement | CW + Safekeeping sheets apart | one "Incoming" (373) + one "Outgoing" (478) |
| Item Group / Trades | columns on the sheet | **gone** — taken from `item_master` instead |
| Unit Price / Total Value | columns on the sheet | **gone** — see PRICE below |
| Storage location | nothing, anywhere | **"Item per location bin", 1,083 real bin codes** |

**One rule partitions everything: Project Origin.** Rows reading "Central Warehouse
Taytay" are the warehouse's own material; anything else is a project's material held for
safekeeping. Applied identically to all three sheets, so a line's stock and its movement
can never land on opposite sides of the split. Result: inventory 827, safekeeping_soh
178, safekeeping_incoming 372, safekeeping_outgoing 262, ledger 214.

**Taxonomy now comes from the item master, and that is an upgrade.** The sheet's own
"Trades" column was a charge code (GEN REQ / MEPF / STRUCT / ARCHI) that cuts across item
types; the master resolved **all 1,005** codes in the sheet. Two of its values sit outside
the app's own vocabulary and are mapped explicitly — `Asset` to `Reusable`, and the item
group `Drywalls` to `Ceiling` — both being the conventions the July snapshot already used,
so an item does not change category between one month and the next. Caught by a taxonomy
check, not by eye.

**PRICE — the one place this workbook cannot be trusted.** The SOH sheet has no price
column at all. The location sheet has one, and it is broken: it prints ₱324,821 for both a
fluorescent tube and a coil of THHN wire, and ₱120,535 for a ¾-inch roll of teflon tape
that July priced at ₱6.25. Valuing the warehouse off it gives **₱973M against ₱100M in
July**, with 86% of the overstatement in twelve lines — the signature of a lookup that has
slipped its rows. So prices are **carried forward** from the previous snapshot on item code
plus specific description, then on item code alone: **₱105,212,151**, a believable +5%, with
**50 lines unpriced** (holding 1,569 units, most of them zero-stock rows) left at zero,
which the app already reports as "no price recorded". Condition class is carried the same
way (7 lines end with none). **Worth raising with the warehouse team: where does the
authoritative price list live now that the SOH sheet no longer carries one?**

**STORAGE LOCATION IS NO LONGER MODELLED.** The hidden sheet addresses lines as
`AREA-Rn-LL-BBB` — and the areas and counts are the ones this map was already drawn from.
MEPF has racks R1–R3 and its bay numbers stop at **13**, which is exactly the long single
run against the west wall; STRUC and ARCHI have one rack each; levels run 1–5. That is not
a coincidence to be argued about, it is the same building. So `placement()` is now a
lookup where a record exists and the old rule only where one does not, which is precisely
the fix this file has been carrying as "the eventual fix" since the floor plan was built.

- `location` and `bin_count` are new columns on `public.inventory`
  (`supabase/migrations/2026-09-02_inventory_location.sql` — **run this before the seeds**).
- `recordedPlacement()` decodes an address; the sheet numbers racks *within* an area
  (`STRUC-R1`) while the map numbers them across the shed (that run is `R4`), hence the
  per-area rack tables. A bay outside what the racking drawing provides is treated as a
  typing error — the area is kept, the impossible bay dropped.
- A recorded address **beats** the derived rule, including `isHighValue`: the warehouse is
  right about its own building. Recorded lines claim their bays first; modelled lines then
  fill only what is left, so a guess is never stacked on a record. Measured: 0 collisions.
- **754 of 827 lines placed from the record**, 678 of them to a specific bay. `locationOf()`
  reports `recorded` / `recordedArea` per line, so the Material Profile says "Recorded bin",
  "Recorded area" or "Inferred" and the floor-plan panel now reads "389 of 407 lines are at
  their recorded bin; the rest are modelled" instead of disclaiming the whole map.

**Bug found in `locationOf()` while verifying, and it predates this work.** It built
`{ area: area.name, …, ...loc }` with the spread LAST, so `loc.area` — an internal id —
overwrote the area name that had just been put there, and the Material Profile printed
`mepfs` at the reader. Spread first now, display fields after; `areaId` keeps the raw value.

**Consequences of the new data, all real rather than defects:**
- The **Incoming** tile reads 0 and Activity reports 1 receipt. The Incoming sheet is
  almost entirely project material arriving for safekeeping — only **1** of 373 rows is
  warehouse-owned — so the warehouse's own receipts are not in this workbook at all.
- The floor plan's **Safekeeping area now holds 16 lines, not hundreds**. It was only ever
  populated by trade fall-through; those lines have gone to their recorded homes. The
  project-owned stock that area actually represents lives in `safekeeping_soh`, which the
  floor plan does not yet plot — a worthwhile next step.
- Stock turnover and non-moving value shift because the ledger window went 125 → 166 days
  and covers 96 item codes.

**Also:** the seed now emits `delete from <table> where id > <max>` before each id-keyed
insert. Upserting alone would have left the tail of a longer previous snapshot behind —
stock that no longer exists, still on the dashboard — the month a table shrinks. Nothing
is dropped this run; every table grew. `TODAY` in `src/lib/format.js` moved 2026-07-24 to
**2026-09-02**, which is the ledger's own base and must track `SNAPSHOT_DATE`.

**Verified.** A generated-data check (invariants, keys, taxonomy, ledger, locations) and a
placement check bundled with esbuild and run under Node both pass: `totalQty ===
available + reserved` and `=== beginning + in - out` hold on all 827 lines (the source
sheet's own arithmetic was already consistent on all 1,005), every recorded line sits at
its recorded bay, no line is both recorded and inferred, and area capacity never exceeds
positions. In the browser against a temporary fixture (deleted afterwards; `dist/`
confirmed free of any item code, description, location or figure): dashboard reads
498,728 units with 485,934 + 12,794 matching it exactly, Reports ₱105,212,151 over 827
SKUs, Safekeeping 9 projects / 264,959 SOH / 159,298 in / 69,896 out, Rack 1 draws its 13
bays over 5 levels with per-cell counts, all four placement kinds show the right
provenance label, and no page-level horizontal scroll at 375px. `npm run build` passes and
the only console error is the expected Supabase 400 under the session-less demo login.

**To put this live** (Supabase SQL Editor, in order): run
`supabase/migrations/2026-09-02_inventory_location.sql`, then paste
`supabase/seed/01..04_seed.sql` in order. Four parts now rather than three — the dataset
grew past the editor's ~1 MB submission cap by one more file.

**Not done, deliberately:** the previous snapshot's master modules are kept at
`private-data/snapshots/2026-07-21/` (gitignored) in case a figure needs to be traced back.

### 2026-09-02 — Session: admin provisioning runbook (`supabase/promote-to-admin.sql`)

Asked to add a real member of staff as an administrator. Creating the login and
handling its password are dashboard actions for the account owner, not something this
tooling does, so what landed here is the half that is code: the role.

**The trap worth recording, because it is silent.** `handle_new_user()` maps a new
signup to a role from the text BEFORE the `@` — `admin`, `warehouse`, `procurement`,
`site`, `management` — and **everything else falls through to `warehouse`**. That
mapping was written for the seeded demo logins (`admin@megawide.com.ph` and friends).
A real staff address like `jdelacruz@megawide.com.ph` therefore produces a *warehouse* account,
and it does so without any error: the person is created, can sign in, and simply does
not have the rights anyone expected. Creating the account is only half of making an
administrator; the profile has to be promoted afterwards.

**`supabase/promote-to-admin.sql`** is that second half — set an email at the top, run
it in the SQL Editor, read the one-row result. It is idempotent and works whether or not
the person has ever signed in.

Two things it gets right that a first draft did not:

- It is **one upsert, not an INSERT then an UPDATE**. The signup trigger normally makes
  the profile row, but where it did not, a bare `UPDATE` matches nothing and reports
  success — and putting the `INSERT` in a sibling CTE does not fix it, because
  data-modifying CTEs all run against the same snapshot and cannot see one another's
  rows, so the `UPDATE` would still miss the row just inserted beside it. Caught while
  reviewing rather than in the database, which is the cheap place to catch it.
- It writes **only `role` and `access_level`** on an existing profile, so a name and
  department someone has already filled in are not flattened back to a placeholder.

The script also carries the reason `guard_role_change()` does not block it: that trigger
exempts callers whose `auth.uid()` is null, which is exactly what the SQL Editor is —
the same exemption that made the first admin bootstrappable back in August. From a
browser the same statement is still refused, which is the asymmetry the guard exists for.

**Adjacent, and still open.** This is finding #1 in the Process Flow module from the
other direction: the same prefix mapping means that if email signup is enabled on the
Supabase project, anyone who registers as `admin@` *any domain* is granted admin on this
application. Adding staff by hand through the dashboard is the safe path precisely
because it does not depend on that setting; the setting itself still needs checking in
the Supabase dashboard, and it cannot be read from the code.

No password, and no user's credentials, are recorded in this repository.

### 2026-09-02 — Session: KPI tile accent bar, active-on-hover outline, login tagline

**1. The composition tiles' left colour bar broke whenever the card stopped clipping,
which is what "weird overlapping when clicked and hovered" was.** `.kpi::before` was a
4px-wide, square-cornered bar at `left/top/bottom: 0`, and its *shape* came entirely from
the parent's `overflow: hidden` rounding it off against the 12px corner. But
`.kpi.has-tip:hover` sets `overflow: visible` so the tooltip can escape the card — so the
instant you hovered, the clipping stopped and the bar's square corners jutted out across
the rounded border at top-left and bottom-left. On an ACTIVE tile that is loud, because
`.kpi.active` colours the border the same hue as the bar: the escaped square slab and the
rounded coloured border then read as two mismatched colour lines piled on one edge.
Confirmed by measurement before touching anything (hovered active tile reported
`overflow: visible`, card `border-radius: 12px`, `::before` `border-radius: 0`) and then
by rendering the two states side by side at 4x.

The accent now owns its own shape and no longer depends on the parent: a full-size
overlay, `inset: 0`, `border-radius: calc(var(--radius) - 1px)` — the padding box's
radius, since an absolutely positioned child is laid out against the padding box — with a
`linear-gradient` painting only the leftmost 4px. It renders identically whether the card
clips or not.

Worth recording why the obvious one-liner does not work: giving the 4px bar
`border-radius: 11px 0 0 11px` fails, because CSS scales corner radii down to fit the box
and an 11px radius on a 4px-wide box collapses to 4px, which cuts the corner in the wrong
place — at x=0 the card's own curve starts 11px down while a 4px radius starts 4px down,
so the bar still overhangs by 7px. Only a box the full width of the card can carry the
card's curve. The overlay therefore sits over the tile's content and needs
`pointer-events: none`, or it would swallow the click that opens the list.

**2. Hovering an active tile visibly thinned its outline.** `.kpi.clickable:hover` sets
`box-shadow` and out-specifies `.kpi.active` (two classes plus a pseudo-class against two
classes), so the active state's `inset 0 0 0 1px var(--kpi-color)` ring was being dropped
on hover and the 2px-reading outline snapped back to 1px under the pointer. The ring is
now restated on `.kpi.active.clickable:hover`, which beats both. Measured after: the
computed `box-shadow` is byte-identical active vs active-and-hovered.

Both fixes verified at 4x magnification in light and dark, on the real September data,
and the tile's click-to-expand, the tooltip on a non-active tile, and the active tile's
tooltip suppression all still behave.

**Measurement note, the same trap as previous sessions.** Mid-check `getComputedStyle`
reported the hovered tile's tooltip as `visibility: hidden` while the rule
`.kpi.has-tip:hover .kpi-tip` demonstrably matched it — the browser pane's stale
style-recalculation again, on a descendant even though the hovered element's own
`overflow` had already updated. A screenshot showed the tooltip rendering perfectly. Judge
hover-dependent styling by what is painted, not by what `getComputedStyle` reports.

**3. Login tagline** — "Building a First-World Philippines" is now **"Engineering a
First-World Philippines"**, matching the corporate line. One occurrence, in `Login.jsx`.

### 2026-08-17 — Session: plates per section, area cylinder, hover-only sections

**Level 1 — a plate on every section, not a corner block.** Each area's identity plate is
now pinned to that area's own top-left corner, so it is read against the shape it
describes. Plates are translucent (`fill-opacity: 0.82`) because on this level a plate
sits on top of the block it names and has to read as glass over the drawing rather than
a hole in it. Occupancy is a bar plus a figure now instead of a sentence; where nothing
records a capacity the track is drawn empty and the figure is a dash — an outdoor yard
with no capacity basis must not read as 0% full.

The plate **grows for a wrapped name**. At a fixed height the second line of MATERIAL
RECOVERY FACILITY ran into the floor-area row beneath it; the height is now computed
from the content (42.4 units for one line, 53.3 for two) and the icon centres on the
name block rather than on the whole plate.

**Level 2 — the plate moved off the drawing.** A permanent 190-unit gutter is added to
the right of the plan, so the hover plate has somewhere to go that is not on top of the
racks. It is part of the viewBox at all times rather than appearing with the plate:
growing the viewBox on hover would resize the whole drawing under the pointer.

**The Sections toggle is gone; the blocks show on hover.** The hulls stay in the DOM so
they remain hoverable and clickable, but paint nothing at rest — the plan reads as pure
racking until you point at an area. They need `pointer-events: all` precisely BECAUSE
the fill is transparent, and they sit before the racks in the DOM so a rack on top of a
hull still receives the pointer.

**Level 2's Material Areas list is a cylinder.** `CapacityCylinder.jsx` (new) is the
level-1 chart generalised to take a `segments` array, base-first, with the last segment
drawn as clear glass. Level 1 stacks warehouse / safekeeping / free; level 2 stacks the
five material areas in their own colours plus free space, and clicking a legend row
selects that area on the plan. Verified both sum to 100: level 1 read 32 / 21 / 47, level
2 read 20 / 2 / 6 / 21 / 4 / 47.

**Level 3 — the figures moved under the elevation.** That card had a lot of dead space
below the drawing; `LocationStats` is now exported from `LocationPanel` and rendered
there, which leaves the whole right-hand column to the list. The list itself switched to
the dashboard's own `CompactTable` — Item Code, a stacked Material Description (detail
plus the trade path), Available and UOM — so a row here lines up with a row on the
Inventory Overview. Measured 750 px for both columns at 1440×900.

**Verified** against a temporary anonymised fixture (removed afterwards; `main.jsx`
restored and `dist/` confirmed clean) across eighteen view/theme combinations at
1440×900 plus three at 375×812: zero labels clipped, zero overlaps, nothing outside a
scroll container. Hover exercised on the cylinder bands, the level-2 hulls and the legend
rows.

**Two measurement notes.** Supabase auth hangs in this sandbox, so the demo login never
completes; seeding `localStorage['wms-demo-session']` is what gets past the login wall
for verification. And the hidden pane's stale-style problem bit again — a hovered hull
reported `fill-opacity: 0` while its class list already had `is-hover`. Read the class
list, or re-read after a real load; do not trust a computed colour taken right after a
class change.

### 2026-09-07 — Session: "can't open the GitHub page" — site verified healthy end to end

No fault found on our side. Recording the checks so the next report of this can be
answered in one pass instead of re-derived, and adding the one tool that was missing.

**What was checked, and what it returned.**

| Check | Result |
|---|---|
| `https://prcdepartment.github.io/prc-wh/` | **200**, correct `index.html` |
| Main JS / CSS / favicon | **200** — 935,666 B, 86,130 B, 1,287 B |
| Actions runs (public API, last 4) | **all `success`**, newest on `5df0ca3` = current `HEAD` |
| Supabase `/auth/v1/health` | **200**, GoTrue v2.196.0 — the project is NOT paused |
| Supabase `/rest/v1/inventory` | **200** |
| Supabase URL + publishable key inlined in the deployed bundle | **both present** (`isConfigured` true) |
| Production bundle rendered | login page, **zero console errors** |

The deployed main bundle is `index-BBw1Noll.js`, and rebuilding from `HEAD` locally
produced **the same hash** — so what is live is exactly this commit, not a stale deploy.
That build was then served through `vite preview` under its real `/prc-wh/` base and
loaded: it routes to `/prc-wh/login`, renders the sign-in card and the hero, shows the
new "Engineering a First-World Philippines" line, correctly omits the demo quick-sign-in
panel, and logs nothing to the console. The hero's three figures are absent, which is
correct — they hide when there are no items, and there is no session in a preview.

**The likely causes are all client-side, and one is much more likely than the rest.**

The old address **`ljrondina.github.io/Warehouse-Management/` does not resolve at all** —
`HTTP 000`, a connection failure rather than a 404. GitHub redirects a renamed or
transferred *repository*, but it does **not** redirect the Pages *site*, so every
bookmark, chat link and browser autocomplete entry from before the 2026-08-16 move is
dead in a way that looks exactly like "the site is down". This is the first thing to ask
about.

Second: `prcdepartment.github.io/` on its own is a 404 — the repo path is required.
`prcdepartment.github.io/prc-wh` (no trailing slash) is fine; it 301s to the slash.

Third, worth knowing about but not diagnosed here: a deep link like `/prc-wh/login`
returns an HTTP **404 status** whose *body* is the SPA shim that bounces to
`index.html`. A browser runs the shim and lands correctly, but a corporate proxy or
security appliance that substitutes its own page on a 404 response would break deep
links while leaving the root working. Combined with enterprise filtering of `*.github.io`
generally, that is the other plausible failure mode on a Megawide-managed network — and
neither can be seen from here.

**Added: a `wms-preview` launch configuration** (`.claude/launch.json`) running
`vite preview` on port 4173. `npm run dev` serves from source at the root path and
therefore cannot answer "is the *deployed* build broken"; this one serves `dist/` under
the real `/prc-wh/` base, which is what made the render check above possible. Worth
reaching for whenever production behaves differently from dev.

**Standing note for this class of report:** GitHub Pages returning 200 with correct
assets, a green workflow on the current SHA, and a live Supabase health check together
rule out everything we control. Past that point the useful questions are which URL was
used and from which network.

### 2026-09-07 — Correction to the entry above: the repo advertises a dead URL

The stale-bookmark theory in the previous entry was **wrong**, and the user said so:
the site opened fine for them after the 16 August move, which means they were already
on the new address. Recording the correction and the real finding.

**`prcdepartment/prc-wh` has its `homepage` field set to
`https://prc-department.github.io/prc-wh/` — with a hyphen.** The organisation is
`prcdepartment`, unhyphenated, so that host is a different account that does not exist.
GitHub renders `homepage` as the website link in the repository's **About** sidebar,
which is the most obvious thing on the page to click.

```
https://prc-department.github.io/prc-wh/   ->  404  "Site not found · GitHub Pages"
https://prcdepartment.github.io/prc-wh/    ->  200  the app
```

Every `*.github.io` name resolves to GitHub's own servers (185.199.108–111.153), so the
hyphenated address does not fail to connect — it returns GitHub's **"There isn't a
GitHub Pages site here"** page. That is indistinguishable, to anyone who is not reading
the address bar closely, from the site having been taken down. It also explains a
failure that arrives without anything having been deployed, because repository metadata
is not part of any build.

**Fix, and it is not something this tooling should do unasked:** repository → About →
the gear icon → Website. Either correct the spelling to `prcdepartment` or tick "Use
your GitHub Pages website", which fills it from the live Pages deployment and cannot
then drift. It is repo metadata, so no commit, no deploy, nothing in this codebase
changes.

**Everything checked in the entry above still stands** — Pages 200, assets 200, four
green runs on the current SHA, Supabase healthy, the deployed bundle byte-identical to
a local rebuild of `HEAD` and rendering with zero console errors. GitHub itself also
reports all systems operational and the `*.github.io` certificate is valid to
31 October 2026. So the infrastructure was never the problem; the signpost was.

**Method note worth keeping.** The first pass checked whether the *site* was healthy and
concluded it was, then reached for a guess about the user's browser. The finding came
from reading the repository's own metadata (`/repos/{owner}/{repo}` in the API), which
is a surface neither the deployment nor the codebase covers. When a working system is
reported broken, check what *points at* it, not only what serves it — the About link,
the Pages settings URL, and anything else that hands somebody an address.
