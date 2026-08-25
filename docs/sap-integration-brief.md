# SAP Integration Brief — PRC-WH App (Megawide Central Warehouse)

Prepared for the working session with the SAP specialists. Written so you can run
the meeting without an SAP background, and so the specialists can answer in their
own vocabulary without having to guess what this app is.

---

## 1. The one-sentence framing (say this first)

> **SAP stays the system of record. This app is the system of engagement.**
> Every stock quantity, valuation and financial posting continues to live in SAP.
> The app is the front end the warehouse team actually touches, and every action a
> user takes here must end up as a real SAP document — not as a number that only
> exists in our database.

Why that sentence matters: the first thing an SAP team fears is a shadow inventory
system. Saying this up front changes the conversation from "should we allow this?"
to "which interface do we use?". It also commits you to something real — the app
must never be the place where a stock figure is *invented*.

### The division of responsibility to propose

| Concern | Owner |
|---|---|
| Material master, UoM, valuation class, prices | **SAP** (app reads only) |
| Plant / storage location / batch definitions | **SAP** |
| Stock quantities, goods movements, financial postings | **SAP** (app *requests*, SAP *posts*) |
| Purchase requisitions / orders | **SAP** (app may originate, SAP approves and numbers) |
| WBS / project structures | **SAP** (PS module) |
| Physical bin/rack/bay placement, floor plan | **App** (SAP likely has no WM/EWM detail for CW Taytay) |
| Photos, condition grading, safekeeping custody log | **App** |
| Delivery scheduling tracker, site coordination | **App** |
| Dashboards, analytics, ranked lists, guided workflows | **App** |
| Users, roles, approval *routing* | **App** (final posting authority still SAP) |

The middle rows are the negotiation. The bottom rows are your value proposition —
the things SAP genuinely does not do well, and that nobody will fight you on.

---

## 2. What you must find out about *their* SAP

Nothing downstream can be finalised until these are answered. Ask in this order:

1. **Which product and release?** `SAP ECC 6.0` (which EhP?) or `S/4HANA` (which
   release — 1809 / 1909 / 2020 / 2021 / 2022 / 2023)?
   *Why:* S/4HANA ships hundreds of ready-made OData APIs. ECC does not — there
   you are mostly in BAPI/RFC/IDoc territory and someone has to build the service
   layer.
2. **On-premise, RISE with SAP (private cloud), or Public Cloud?**
   *Why:* On-prem needs an **SAP Cloud Connector** or VPN before anything on the
   internet can reach it. Public Cloud forbids custom ABAP entirely — only
   released APIs and extensions on BTP.
3. **Which modules are live?** Specifically `MM-IM` (Inventory Management),
   `MM-PUR` (Purchasing), `WM` (legacy Warehouse Management) or `EWM` (Extended
   WM), `PS` (Project System), `FI/CO`, `PM`.
   *Why:* If EWM/WM is live, bins already exist in SAP and our floor plan should
   eventually *mirror* SAP bins rather than invent them. If it is not live, the
   floor plan is genuinely new information and SAP has nothing to conflict with —
   a much easier story.
4. **Do you own SAP BTP / Integration Suite (formerly CPI)?** Or other middleware
   — SAP PI/PO, MuleSoft, Boomi, Azure Logic Apps?
   *Why:* If middleware exists, use it. Building a second integration path around
   an existing ESB is the fastest way to get vetoed.
5. **Is SAP Gateway activated?** (`/IWFND/MAINT_SERVICE`, `/IWFND/GW_CLIENT`.)
   Is `SICF` open for OData?
6. **What is the plant / storage location structure for CW Taytay?** Plant code,
   storage location code(s), and whether safekeeping is a separate storage
   location, a special stock type, or not represented at all.
7. **Are our item codes the SAP material numbers?** Our `item_master` has 7,378
   rows — someone must confirm whether that *is* `MARA`, or whether a mapping
   table is required permanently.
8. **Digital Access / indirect access licensing** — see §8. Ask directly.
9. **Who owns the SAP change window and transport path**, and what is the lead
   time for a transport to production?
10. **Is there a non-production system** (DEV/QAS/sandbox) we can be given a
    technical user on this quarter?

Questions 1, 2 and 4 alone determine which of the five options in §4 is even
possible.

---

## 3. What the app holds today (bring this table — they will ask)

Our Postgres (Supabase) schema, and the SAP object each maps to:

| App table | Rows today | SAP counterpart | SAP object / table |
|---|---|---|---|
| `item_master` | 7,378 | Material master | `MARA` / `MAKT` / `MARC` |
| `inventory` | 779 | Stock on hand per material/plant/sloc | `MARD`, `MCHB` (batch), report `MB52` |
| `ledger` | 184 | Material documents (goods movements) | `MKPF` / `MSEG` |
| `movements` | empty | Goods movement to be posted | `BAPI_GOODSMVT_CREATE` → `MKPF`/`MSEG` |
| `reservations` | empty | Reservation | `RESB` / `RKPF` |
| `material_requests` | empty | Reservation **or** PR — business decision | `RESB` or `EBAN` |
| `purchase_requests` | empty | Purchase requisition | `EBAN` |
| `delivery_tracker` | 27 | Inbound delivery / PO schedule line | `LIKP` / `LIPS`, `EKET` |
| `safekeeping_*` | 563 | Special stock or separate sloc — **to decide** | `MSKA`/`MSLB`, or own sloc |
| `projects` | — | WBS element / project | `PRPS` / `PROJ` |
| `trades` | 7 | Material group | `MARA-MATKL` / `T023` |
| `approvals` | empty | App-side routing only | — (SAP release strategy is separate) |
| `audit_log` | empty | App-side | — |

Two gaps to flag yourself, before they find them:

- **No batch or serial number handling.** If SAP manages this material in batches,
  every goods movement we post must carry a batch, and we currently cannot supply
  one.
- **Floor-plan bin placement is modelled, not recorded.** Real bin data has to
  come from somewhere — either EWM/WM, or we start capturing it and it becomes the
  app's own authoritative dataset.

---

## 4. The integration options, ranked

Present these as a menu and let the specialists pick.

### Option A — OData / SAP Gateway ★ preferred on S/4HANA

SAP exposes REST-style JSON services. On S/4HANA many already exist as standard
(published on `api.sap.com`):

- `API_MATERIAL_STOCK_SRV` — read stock on hand
- `API_MATERIAL_DOCUMENT_SRV` — read **and post** goods movements
- `API_PRODUCT_SRV` — material master
- `API_PURCHASEREQ_PROCESS_SRV` — purchase requisitions
- `API_INBOUND_DELIVERY_SRV` — inbound deliveries
- `API_RESERVATION_DOCUMENT_SRV` — reservations
- `API_PHYSICAL_INVENTORY_DOC_SRV` — cycle counts

**Ask for:** service activation, a technical/communication user, the endpoint URL,
and whether `$batch` and delta tokens are enabled.
**Best for:** everything, if available. This is the modern answer.

### Option B — BAPI / RFC

Function modules called over SAP's RFC protocol. Works on ECC *and* S/4.

| BAPI | Use |
|---|---|
| `BAPI_GOODSMVT_CREATE` | post goods receipt / issue / transfer |
| `BAPI_MATERIAL_GETLIST` / `..._GET_DETAIL` | material master read |
| `BAPI_MATERIAL_AVAILABILITY` | ATP / available stock |
| `BAPI_RESERVATION_CREATE1` | create reservation |
| `BAPI_REQUISITION_CREATE` | create purchase requisition |
| `BAPI_PO_GETDETAIL` | purchase order read |
| `BAPI_TRANSACTION_COMMIT` | **mandatory** after any create BAPI |

**Ask for:** an RFC-enabled technical user, and whether they would rather wrap
these in a custom OData service themselves (usually they would — it keeps the RFC
layer inside their perimeter).
**Watch out:** `node-rfc` needs the SAP NetWeaver RFC SDK binaries on a server.
This cannot run from a browser or from GitHub Pages.

### Option C — IDoc (asynchronous messaging)

SAP's classic EDI-style document format, dropped on a queue. Relevant message
types: `MBGMCR` (goods movement create), `WMMBID01` (WM movements), `DELVRY03`
(deliveries), `MATMAS` (material master broadcast), `PREQCR` (PR create).

**Best for:** high volume, fire-and-forget, and for SAP *pushing* master data to us
on change. Weak where a user is waiting for an answer on screen — it is
asynchronous by design.

### Option D — SAP BTP Integration Suite / CPI as middleware ★ the realistic shape

Rather than our app talking to SAP directly, both talk to an integration layer that
handles retries, mapping, monitoring and credentials.

```
PRC-WH App ──HTTPS/JSON──▶ Integration Suite (CPI) ──OData/RFC/IDoc──▶ SAP
           ◀── webhook / scheduled pull ──                          ◀──
                        (Cloud Connector if SAP is on-prem)
```

**Why this usually wins the argument:** the SAP team keeps control of the SAP side,
gets monitoring and error handling they already know, and our app never holds SAP
credentials or touches SAP directly. Push for this if they have BTP — it removes
most of their objections in one move.

### Option E — Excel / file exchange (the stopgap you proposed)

Legitimate as **phase 0**, and worth building anyway as a permanent fallback for
when the interface is down. Specified in §7.

### Never propose these

- **Direct database reads from SAP's HANA/Oracle tables.** Bypasses application
  logic, breaks on upgrade, and is an indirect-access licensing exposure. If they
  offer it, decline — it will be used against you later.
- **Screen scraping / GUI scripting / BDC recordings** for ongoing interfaces. Fine
  for one-off migration, never for a live integration.
- **Writing to SAP tables** with anything but a BAPI or API. Not negotiable.

---

## 5. The architecture to propose

```
  ┌──────────────────────┐
  │  PRC-WH App (React)  │  user acts: issue, receive, reserve, request
  └──────────┬───────────┘
             │ Supabase client (RLS)
  ┌──────────▼───────────┐
  │ Supabase Postgres    │  operational store + outbox table
  │  + server worker     │  ← integration worker lives here
  └──────────┬───────────┘
             │ HTTPS, mTLS or OAuth2 client credentials
  ┌──────────▼───────────┐
  │ SAP Integration Suite│  mapping, retry, alerting, monitoring
  └──────────┬───────────┘
             │ (Cloud Connector, if on-prem)
  ┌──────────▼───────────┐
  │        SAP           │  posts the document, returns the document number
  └──────────────────────┘
```

### Five design rules to state as commitments

1. **Outbox pattern.** A user action writes a row to our DB *and* an `sap_outbox`
   row in the same transaction. A worker drains the outbox. Nothing is ever posted
   to SAP from a browser request path — the network will fail eventually, and the
   user must not be the retry mechanism.
2. **Idempotency.** Every outbound message carries a UUID we generate. SAP-side or
   CPI-side logic must reject a duplicate rather than post twice. Ask them
   explicitly how they want this enforced — double goods issues are the classic
   integration disaster.
3. **Write the SAP document number back.** Once SAP posts, we store `mblnr` /
   `mjahr` (material document), `banfn` (PR) and so on against our row. A row with
   no SAP number is *not done* — it is pending, and the UI must show that.
4. **SAP wins on reconciliation.** A nightly job pulls stock on hand from SAP and
   compares it against our `inventory`. A variance is reported as a variance —
   never silently overwritten, never silently ignored. This one job is what makes
   the "system of engagement" claim credible.
5. **The read model is a cache, and says so.** We keep serving SAP-derived stock
   from our own tables (that is what makes the app fast), but every screen carries
   the as-of timestamp. Users must never be surprised about staleness.

### Sync direction per object (proposed — bring this for them to redline)

| Object | Direction | Mechanism | Frequency |
|---|---|---|---|
| Material master | SAP → App | delta pull or `MATMAS` IDoc | daily / on change |
| Stock on hand | SAP → App | OData pull | 15 min, plus after each post |
| Goods movement | App → SAP | `BAPI_GOODSMVT_CREATE` / OData | real-time (queued) |
| Reservation | App → SAP | BAPI / OData | real-time (queued) |
| Purchase requisition | App → SAP | BAPI / OData | real-time (queued) |
| Purchase order status | SAP → App | pull | hourly |
| Inbound deliveries | SAP → App | pull or `DELVRY03` | hourly |
| Projects / WBS | SAP → App | pull | daily |
| Bin / floor placement | App-owned | — | — |
| Safekeeping custody | App-owned (until decided) | — | — |

---

## 6. Movement types you will be asked about

When you say "the app records an outgoing", SAP hears "which movement type?".
Have an answer for every app action.

| Mvt | Meaning | Our action |
|---|---|---|
| `101` / `102` | Goods receipt against PO / reversal | Incoming from a delivery |
| `201` / `202` | Issue to cost centre / reversal | Consumable issue |
| `221` / `222` | Issue to project (WBS) / reversal | **Issue to a site — most of our outgoing** |
| `261` / `262` | Issue to production or maintenance order | If PP/PM orders are used |
| `301` | Plant-to-plant transfer | Site transfer |
| `311` | Storage location transfer within a plant | Move between CW areas |
| `309` | Material-to-material transfer | Re-grading |
| `551` | Scrapping | **The Scrap tab** |
| `344` / `343` | Unrestricted → blocked / released | **Damaged quantity flagged / released** |
| `561` | Initial stock upload | One-time cutover only |
| `701` / `702` | Physical inventory difference | Cycle count |

**Two decisions to force in the room.** Does our `damaged_qty` correspond to SAP
*blocked stock* (`344`), to quality inspection stock, or is it an app-side note
only? And is `reserved_qty` an SAP reservation (`RESB`), a project commitment, or
an app-only soft hold? These two columns are the most likely to be found "wrong"
later, because they look like SAP concepts and currently are not.

---

## 7. The Excel stopgap — spec it so it does not become permanent by accident

Build it, but with an expiry date and a design the API phase reuses.

**Outbound (App → SAP).** One file per document type, in the exact column order of
the upload the specialists nominate. Ask which they want:

- A file the **SAP Migration Cockpit** (`LTMC` / `LTMOM` on S/4) can consume — it
  has published XLSX templates. Best answer.
- A file for a **custom BDC/LSMW-style recording** they already maintain.
- A flat file dropped on **SFTP** and picked up by a scheduled SAP job. Cleanest
  stopgap, because the *transport* is already automatic — only the parsing is
  manual — and it upgrades to an API with no change to the warehouse team's
  routine.

**Inbound (SAP → App).** Ask for a scheduled SAP job that writes `MB52` (stock),
`MB51` (movements) and open PO data to SFTP as CSV nightly. Our importer reads it.
This is easy for them to say yes to, and gets us real data in weeks.

**Rules so the stopgap stays a stopgap:**

- Files are generated by code, never hand-edited. A hand-edited file is a data
  quality incident waiting to happen.
- Every file carries a schema version and generation timestamp in its header.
- Every exported document carries our UUID in a reference field, so the API phase
  can reconcile what was already posted.
- The exporter writes to the **same `sap_outbox` table** the API worker will later
  drain. Then switching from file to API is a change of worker, not a change of
  app.

---

## 8. Commercial and licensing — do not skip this

This is where integration projects die quietly, six months in.

- **SAP Digital Access / indirect access.** Under the Digital Access model,
  documents *created in SAP by a non-SAP system* are licensed by document count.
  Whether material documents and goods movements are chargeable depends on the
  contract vintage. **Ask directly, and get it in writing:** *"If the warehouse app
  creates N material documents and M purchase requisitions per month via API, does
  that consume Digital Access document budget, and what is our headroom?"*
- **Named user licences.** Warehouse staff who only ever use our app may not need
  an SAP named-user licence. That is a real saving and your strongest commercial
  argument for the project — get their licensing person to confirm it.
- **BTP Integration Suite** is separately licensed if they do not already own it.
- **SAP Cloud Connector** is free, but needs a host and an owner.

---

## 9. Security and operations — what they will demand

- **Authentication:** OAuth 2.0 client credentials via a BTP destination is the
  modern answer; X.509 certificates or a technical user with basic auth is the
  common on-prem reality. Never a personal user's credentials.
- **Authorisation:** the technical user gets exactly the authorisation objects it
  needs (`M_MSEG_WMB`, `M_MSEG_BWA`, `M_BANF_BSA`, plus plant/sloc restriction),
  scoped to the CW Taytay plant and storage location only.
- **Network path:** if SAP is on-prem, our worker cannot live on GitHub Pages. It
  needs a host the Cloud Connector or VPN can reach. Raise this early — it is a
  real infrastructure ask.
- **Audit:** every SAP call logged with who triggered it, the payload, the response
  and a correlation ID. We already have an append-only `audit_log` with no update
  or delete policy at all — say so, it lands well.
- **Error handling:** who gets paged when a posting fails? Proposal — failures
  surface in the app as a queue an admin can see and retry, and alert the SAP basis
  team if the failure is systemic.
- **Data residency / PII:** the app holds no personal data beyond staff emails.
  Stating this shortens the security review.

---

## 10. The workflow to proceed

### Phase 0 — Discovery (this meeting + 2 weeks)
- Answer all ten questions in §2.
- Get read-only access to a **non-production** SAP for one developer.
- Obtain plant/sloc codes, a material master extract, the movement types in use,
  and one sample of each document type we intend to create.
- **Gate:** we can name the exact API or BAPI for each of our write actions.

### Phase 1 — Read-only integration (4–6 weeks)
- Pull material master, stock on hand, open POs, inbound deliveries.
- Dashboards render live SAP data. Nothing is written anywhere.
- **This is the phase that wins support** — zero risk to them, and the day the
  floor plan and dashboards show real SAP stock, the project becomes obviously
  worth funding.
- **Gate:** reconciliation shows zero variance against `MB52` for 10 consecutive
  days.

### Phase 2 — File-based writes (parallel with Phase 1, 2–3 weeks)
- Build the exporter and the `sap_outbox` table.
- Warehouse team works in the app; a scheduled job (or a person) feeds SAP.
- **Gate:** one full month of operations captured in the app first and SAP second,
  with no reconciliation drift.

### Phase 3 — API writes, one document type at a time (6–12 weeks)
Ordered by blast radius, lowest first:

1. **Purchase requisition** — an unapproved PR does no harm if it is wrong.
2. **Reservation** — soft commitment, reversible.
3. **Transfer posting (`311`)** — moves stock, does not change the total.
4. **Goods receipt (`101`)** — increases stock; needs the PO link right.
5. **Goods issue (`221`/`201`)** — decreases stock and hits project cost. Last.

Each with: build → test with the SAP team watching → a two-week parallel run where
both app and manual SAP entry happen and are compared → cutover.
**Gate per document type:** 100 consecutive postings with correct document numbers
returned and zero duplicates.

### Phase 4 — Retire the manual path, formalise operations
Runbook, monitoring, on-call, quarterly reconciliation review. Decide the long-term
home for bin/floor data (app-owned, or migrated into EWM).

### Deliberately not in scope
Say this out loud so nobody assumes otherwise: the app is not replacing SAP's
financial postings, procurement approval strategy, vendor management, or period
close. It is a warehouse front end.

---

## 11. What to ask them for, concretely (the shopping list)

Hand this over at the end of the meeting.

1. SAP release, deployment model, active module list.
2. A named SAP counterpart who owns this interface.
3. A **technical/communication user** on the DEV or QAS system.
4. The **plant code** and **storage location code(s)** for CW Taytay.
5. A material master extract for those storage locations, to reconcile against our
   7,378 `item_master` rows.
6. The list of **movement types** the warehouse is authorised to use.
7. Confirmation of whether **batch management** applies to our materials.
8. Whether **BTP Integration Suite / PI / another ESB** exists, and whether we
   route through it.
9. Their **standard for authentication** to SAP APIs.
10. Whether **Gateway / OData services** are activated, and how to request specific
    ones.
11. Their answer on **Digital Access licensing** for API-created documents.
12. The **transport lead time** and change-window policy.
13. Their preferred **file format and transport** for the Phase-2 stopgap.
14. The **existing warehouse process documentation** — what transactions do the
    warehouse staff actually run today (`MIGO`, `MB1A`, `MB1B`, `MB21`, `ME51N`,
    `MB52`)? Our app has to cover every one a user touches.

---

## 12. Questions they will ask you — have answers ready

| Their question | Your answer |
|---|---|
| "Where does the data live?" | Supabase Postgres (managed, RLS on every table). SAP-derived data is a cache; SAP remains source of truth. |
| "Who can write to it?" | Row-level security per role, admin-only on reference tables, and `audit_log` is append-only with no update or delete policy at all. |
| "What happens if SAP is down?" | Users keep working; postings queue in the outbox and drain when SAP returns. Screens show the as-of timestamp. |
| "What if the app and SAP disagree?" | SAP wins. Nightly reconciliation reports the variance; we never silently overwrite. |
| "Will this create duplicate postings?" | Every message carries an idempotency UUID and we store the returned SAP document number. A row without one is not complete. |
| "Who supports it?" | Name someone. This question has no technical answer and always gets asked. |
| "Why not just use Fiori?" | Fiori covers the SAP transactions; it does not cover the floor plan, condition grading, safekeeping custody, delivery coordination, or the analytics the warehouse team asked for. And this is additive — it removes no Fiori app. |
| "Is this on the internet?" | Today it is a GitHub Pages site protected by Supabase auth and RLS. Expect them to require a move behind corporate SSO once it touches production data — see §13. |

---

## 13. Things to fix on our side, before or alongside integration

Be the one who raises these; it buys credibility.

- **Hosting.** A public GitHub Pages site will not survive an SAP security review
  once it touches production data. Plan a move to a host behind corporate SSO
  (Entra ID), which also enables principal propagation to SAP.
- **A backend.** RFC and most SAP auth flows cannot happen in a browser. We need a
  server-side component.
- **Writes are not implemented yet.** Add Material and movement entry are
  read-only UI today; only safekeeping requests persist. The app's Phase 3 and this
  integration's Phase 1 are the same work — sequence them together rather than
  building app-only writes that later need reworking.
- **No CI, no tests, no error boundary.** An interface to a system of record needs
  a test suite and a staging environment. Raise it as a cost line now.
- **Identity.** For SAP audit trails to mean anything, the posting should carry who
  did it — via principal propagation, or by writing the user into a reference field
  on the document. Ask which they prefer.
- **Item code alignment.** If our codes are not SAP material numbers, the mapping
  table is permanent infrastructure and needs an owner.

---

## 14. Meeting agenda (60–90 minutes)

1. **5 min** — Frame it: system of record vs system of engagement (§1).
2. **10 min** — Show the app. Floor plan, dashboards, delivery tracker. Let it sell
   itself; do not lead with architecture.
3. **10 min** — Present the responsibility split (§1) and invite redlines.
4. **20 min** — Their landscape: work through the ten questions in §2.
5. **15 min** — The options menu (§4). Let *them* choose the mechanism.
6. **10 min** — Phasing (§10) and the licensing question (§8).
7. **10 min** — Shopping list (§11), named owners, next meeting date.

**Leave with three things or the meeting failed:** a named SAP counterpart, a
decision on the integration mechanism, and a date for non-production access.

---

## 15. Glossary — so nothing said in the room goes past you

- **BAPI** — a documented, stable function you are allowed to call to make SAP do
  something. The supported way in.
- **RFC** — SAP's remote procedure call protocol; how BAPIs are reached.
- **IDoc** — a structured document format for asynchronous exchange.
- **OData** — the REST-style API standard SAP uses for modern services.
- **Gateway** — the SAP component that publishes OData services.
- **BTP** — SAP Business Technology Platform, their cloud PaaS.
- **Integration Suite / CPI** — SAP's integration middleware on BTP.
- **Cloud Connector** — secure tunnel from BTP to an on-premise SAP.
- **CDS view** — a modelled data view in S/4HANA; usually the basis for an OData
  service, and the cleanest way to expose a custom read.
- **S/4HANA vs ECC** — current vs previous generation of SAP ERP.
- **RISE** — SAP-managed hosting of S/4HANA.
- **Plant / Storage location** — the physical hierarchy stock sits in. Ours must be
  identified precisely.
- **Movement type** — the three-digit code classifying every stock movement (§6).
- **Fiori** — SAP's modern web UI layer.
- **Digital Access** — SAP's licensing model for documents created by non-SAP
  systems (§8).
- **Transport** — the mechanism for moving a change from DEV to PROD in SAP.
  Explains why SAP-side changes are never same-day.
