# SAP Business One Integration Brief — PRC-WH App (Megawide Central Warehouse)

Prepared for the working session with the SAP specialists in Megawide IT.

**Target: a read-write connection.** The app must be able to read live stock and
post real inventory documents into Business One.

> **Supersedes the earlier ECC/S4HANA version of this document.** That draft was
> written before we established that Megawide runs **SAP Business One**, and it
> aimed at the wrong product. Anything you remember about BAPIs, RFC, IDocs, SAP
> Gateway, ABAP transports, movement types (`101`, `221`, `311`), or the `MARA` /
> `MARD` / `MSEG` tables does not apply here. Business One is a different product
> with a different database, a different vocabulary, and — helpfully — a much
> simpler integration story.

---

## 1. What we know about the landscape, and what to confirm

The starting evidence is the URL the team uses day to day:

```
https://sapcloudv10-02.megawide.com.ph:8200/dispatcher/
```

What that tells us, and what still needs confirming in the room:

| Signal | Reading | Confirm |
|---|---|---|
| `/dispatcher/` on a high port | **Browser Access** — the service that streams the Windows B1 client into a browser. Documented default is port 8100; ours is on 8200. | — |
| `sapcloudv10` | **SAP Business One version 10** (the current major release, and the one with the modern API). | Exact version and feature pack |
| `megawide.com.ph` | Self-hosted or partner-hosted on a Megawide domain — **not** inside an unreachable private network. | Who administers the server |
| Reachable from the public internet | A network path to the server likely already exists. | Whether other ports can be opened the same way |

Still unknown and material: whether the underlying database is **SAP HANA or
Microsoft SQL Server**, how many **company databases** exist on that server,
whether a **test company** exists, and — most importantly — whether the
**Service Layer** is switched on.

---

## 2. The framing (say this first)

> **Business One stays the system of record. This app is the system of
> engagement.** Every stock quantity, value and posting that matters to Finance
> continues to live in B1. Our app is the front end the warehouse team actually
> touches, and every action taken here ends its life as a real Business One
> document.

The instinctive fear of any SAP team meeting a new system is that it is a shadow
inventory database being smuggled in. This sentence turns their question from
"should we permit this" into "which interface should you use", which is a
question they enjoy answering. It also binds us to something real, and we should
be willing to be bound: **the app must never be the place where a stock figure is
invented.**

### The division of responsibility to propose

| Concern | Owner |
|---|---|
| Item master, units of measure, item groups, prices | **B1** (app reads only) |
| Warehouse definitions, bin locations (if enabled) | **B1** |
| Stock quantities, inventory documents, journal postings | **B1** (app *requests*, B1 *posts*) |
| Purchase requests / purchase orders | **B1** (app may originate, B1 numbers and approves) |
| Business partners (suppliers) | **B1** |
| Projects / cost centres | **B1** |
| Floor plan, rack and bay placement, physical layout | **App** (unless bin locations are enabled — see §6) |
| Photographs, condition grading, safekeeping custody log | **App** |
| Delivery scheduling and site coordination | **App** |
| Dashboards, analytics, ranked lists, guided workflows | **App** |
| App users, roles, approval *routing* | **App** (final posting authority still B1) |

The middle rows are the negotiation. The bottom rows are our value proposition —
things B1 does not do well and nobody will fight us on.

---

## 3. The answer: the Service Layer

Business One ships with a modern REST/OData web API called the **Service Layer**.
It is not something anyone has to build for us. It is either already running or
it is a configuration change.

- **Address:** same server, port **50000** by default, so most likely
  `https://sapcloudv10-02.megawide.com.ph:50000/b1s/v2/`. **Confirm — do not
  assume.**
- **Protocol paths:** `/b1s/v2/` is OData v4 and is the current standard;
  `/b1s/v1/` is the older OData v3 and has been deprecated by SAP. Build against
  **v2** unless their installation cannot serve it.
- **Capability:** full read *and* write on essentially every business object we
  care about — items, stock, goods receipts, goods issues, transfers, purchase
  requests, purchase orders, inventory counts.
- **Format:** ordinary HTTPS with JSON. Nothing proprietary, no special SDK, no
  Windows-only components.

### How authentication works

Worth knowing precisely, because it shapes what I build:

1. `POST /b1s/v2/Login` with a JSON body naming the **company database**, a
   **username** and a **password**.
2. B1 returns a **session ID** and sets a session cookie.
3. Every subsequent request carries that session.
4. The session **expires after roughly 30 minutes of inactivity** (configurable),
   so our worker must handle re-login transparently rather than failing.
5. `POST /Logout` releases it — and releasing sessions matters, because
   concurrent sessions may be limited by licence.

### Useful properties we will lean on

- **OData query options** (`$filter`, `$select`, `$orderby`, `$top`, `$skip`,
  `$expand`, `$count`) mean we can ask for exactly the rows and columns we need
  rather than pulling everything and filtering locally.
- **Paging** is on by default at a small page size and controlled by a request
  header — our loader must follow the next-page links or it will silently read
  only the first page. This is a classic first-week bug and I will guard for it.
- **Batch requests** (`POST /$batch`) group several operations, and a *changeset*
  inside a batch is atomic — all succeed or all roll back. This is how we post a
  multi-document operation safely.
- **Every document carries two numbers**: `DocEntry`, the internal key we store
  as our proof, and `DocNum`, the human-visible number the warehouse team will
  recognise. We store both.

---

## 4. The alternatives, and what to decline

| Route | What it is | Verdict |
|---|---|---|
| **Service Layer** | REST/OData, read-write, built in | ★ **This is what we want** |
| **DI API** | Older Windows-only programming interface | Works, but cannot be called from a web application. Push back toward the Service Layer if suggested. |
| **DI Server** | A SOAP web-service wrapper around the DI API | Acceptable fallback if the Service Layer genuinely cannot be enabled. Clunkier. |
| **B1if (Integration Framework)** | B1's bundled middleware, included at no extra cost | Reasonable if IT already uses it and wants the connection to run through their own layer. Optional for us. |
| **Direct SQL against the company database** | Reading the HANA/SQL tables directly | **Read-only, and only if IT insists.** Never write this way — it bypasses all of B1's business logic and will corrupt data. Even for reads, it breaks on upgrade. |
| **Screen automation of the B1 client** | Driving the Windows UI programmatically | **No.** Not for a live interface, ever. |

**The one line to hold:** we never write to Business One except through the
Service Layer (or DI Server). No direct table writes, under any circumstances,
for any reason, however urgent.

---

## 5. Mapping our data to Business One

Our Postgres schema and the B1 object each corresponds to:

| App table | Rows today | B1 Service Layer object | B1 table |
|---|---|---|---|
| `item_master` | 7,378 | `Items` | `OITM` |
| `inventory` | 779 | `Items(...)/ItemWarehouseInfoCollection` — `InStock`, `Committed`, `Ordered` per warehouse | `OITW` |
| `ledger` | 184 | inventory document history | `OINM` (inventory transactions) |
| `movements` (Incoming) | empty | `InventoryGenEntries` (goods receipt) or `PurchaseDeliveryNotes` (receipt against a PO) | `OIGN` / `OPDN` |
| `movements` (Outgoing) | empty | `InventoryGenExits` (goods issue) | `OIGE` |
| `movements` (Transfer) | empty | `StockTransfers` | `OWTR` |
| `reservations` | empty | **No direct equivalent** — see §7 | — |
| `material_requests` | empty | `InventoryTransferRequests` or `PurchaseRequests` — decision needed | `OWTQ` / `OPRQ` |
| `purchase_requests` | empty | `PurchaseRequests` | `OPRQ` |
| `delivery_tracker` | 27 | `PurchaseOrders` open lines / expected deliveries | `OPOR` / `POR1` |
| `safekeeping_*` | 563 | Separate warehouse, or a customer-owned-stock arrangement — decision needed | `OWHS` |
| `projects` | — | `Projects` or `ProfitCenters` / `Dimensions` — confirm which they use | `OPRJ` / `OPRC` |
| `trades` | 7 | `ItemGroups` or a user-defined field | `OITB` |
| `approvals` | empty | App-side routing (B1 has its own approval procedures — keep separate) | — |
| `audit_log` | empty | App-side | — |

Two gaps to raise ourselves before they are found:

- **We have no batch or serial number handling.** If any of our items are
  batch- or serial-managed in B1, every posting must name a batch or serial, and
  our app has no such field in the data, on the screens, or in the physical
  process on the floor. This is one of the larger possible pieces of work in the
  project and I want the answer in week one.
- **Our floor-plan bay placement is modelled, not recorded.** If B1's bin
  locations are enabled, real placement data already exists and our floor plan
  should mirror it. If not, our floor plan is genuinely new information.

---

## 6. The bin location question — read this one carefully

Business One 10 supports **bin locations** (`OBIN`): real, addressable storage
positions inside a warehouse. This is the single question with the biggest effect
on our floor-plan module, and it has three possible answers.

- **Bin locations are enabled and populated for Taytay.** Then B1 already knows
  where material sits, our modelled placement is redundant, and the right long-term
  design is for the floor plan to *display* B1's bins rather than invent its own.
  More work in the medium term, but the result is a floor plan that is factually
  correct rather than illustrative — a genuine upgrade.
- **Bin locations are enabled but not populated.** Then there is a real opportunity:
  our app becomes the pleasant way to capture bin data that B1 wants anyway, and
  we write placement back into B1. This is arguably the strongest single argument
  for the app's existence.
- **Bin locations are switched off.** Then our floor plan stands alone as
  app-owned data, nothing in B1 conflicts with it, and we carry on as we are —
  while noting that turning bins on later would change the picture.

Ask explicitly: *"Is bin location management enabled for the Central Warehouse
Taytay warehouse, and if so, is it actually populated?"*

---

## 7. Document types — Business One's model, not ECC's

Business One does not use three-digit movement types. It uses **distinct document
objects**, which is simpler and easier to reason about. Map each app action to one:

| App action | B1 document | Notes |
|---|---|---|
| Receive against a purchase order | `PurchaseDeliveryNotes` (Goods Receipt PO) | Links to the PO, updates the open quantity |
| Receive without a PO | `InventoryGenEntries` (Goods Receipt) | Needs an account or cost assignment |
| Issue to a project or site | `InventoryGenExits` (Goods Issue) | Carries the project / cost centre on the line |
| Move between warehouses or bins | `StockTransfers` | Quantity-neutral overall |
| Scrap | `InventoryGenExits` to a scrap account | Same object, different account |
| Flag as damaged | **Decision needed** — a separate warehouse, a bin, or a user-defined field | See below |
| Cycle count | `InventoryCountings` then `InventoryPostings` | Two steps in B1 |
| Request a purchase | `PurchaseRequests` | First in our rollout order |

### Two rulings to force in the room

- **Our `damaged_qty` column.** Business One has no built-in "blocked stock"
  status equivalent to ECC's. The realistic options are a dedicated damaged
  warehouse, a dedicated bin, or an app-only flag with no B1 representation. Each
  is defensible; picking one silently is not.
- **Our `reserved_qty` column.** B1 tracks a `Committed` quantity that comes from
  open sales and transfer requests — it is not a free-form reservation anyone can
  create. So our "reserved" either maps onto `InventoryTransferRequests`, or it
  is an app-only soft hold that B1 never sees. **My recommendation is the transfer
  request**, because it makes the commitment visible to everyone in B1 rather than
  only to our users. But it is a business decision, not a technical one.

These two columns are the most likely to be found "wrong" later, precisely
because they look like B1 concepts and currently are not.

---

## 8. Preventing double-posting — and why this is easy here

The most dangerous failure in any write integration is posting the same goods
issue twice: our message goes out, the connection drops before the answer comes
back, and we genuinely do not know whether B1 posted or not. Retrying might issue
the material twice; not retrying might lose it entirely.

**Business One solves this more easily than ECC did.** B1 lets an administrator
add **user-defined fields (UDFs)** to standard objects with no programming at all.
The design:

1. IT adds one UDF — call it `U_PRCWH_REF` — to the inventory document objects.
2. Every document our app creates writes our own unique reference into it.
3. Before posting, our worker queries B1 for that reference. If a document
   already carries it, the posting already happened and we record its `DocEntry`
   instead of posting again.

This costs IT about five minutes and it is the single highest-value small thing
they can give us. It is also what makes reconciliation possible: every document in
B1 that came from our app is traceable back to the action that created it.

**Ask for it explicitly and get agreement that no other process will use that
field.**

---

## 9. The architecture

```
  ┌──────────────────────┐
  │  PRC-WH App (React)  │  user acts: receive, issue, transfer, request
  └──────────┬───────────┘
             │ Supabase client (row-level security)
  ┌──────────▼───────────┐
  │ Supabase Postgres    │  operational store + outbox queue
  └──────────┬───────────┘
             │
  ┌──────────▼───────────┐
  │  Integration worker  │  server-side; holds the B1 credentials,
  │  (Node, server-side) │  manages the session, retries, logs
  └──────────┬───────────┘
             │ HTTPS :50000  /b1s/v2/
  ┌──────────▼───────────┐
  │ B1 Service Layer     │
  └──────────┬───────────┘
  ┌──────────▼───────────┐
  │ SAP Business One     │  posts the document, returns DocEntry + DocNum
  └──────────────────────┘
```

### Five design rules, stated as commitments

1. **Outbox pattern.** A user action writes the record *and* a queue entry in one
   indivisible step. A background worker drains the queue. Nothing is ever posted
   to B1 from a browser request, because a user who presses save twice must never
   create two goods issues.
2. **Idempotency via the UDF.** Every message carries a unique reference; we check
   before posting and never post the same reference twice (§8).
3. **Write the document identifiers back.** We store `DocEntry` and `DocNum`
   against our record. A record with no B1 document number is **pending**, not
   done, and the interface shows it that way.
4. **B1 wins on reconciliation.** A nightly job pulls stock per item per warehouse
   from B1 and compares it against ours, reporting every variance. It never
   silently overwrites ours to match and never ignores a difference. This one job
   is what makes the "system of engagement" claim provable.
5. **The read model is a cache and says so.** We keep serving stock from our own
   tables because that is what makes the app fast, but every screen carries the
   as-of timestamp.

### Credentials never touch the browser

The B1 username and password live only on the server-side worker. The React app
talks to our own database and never to B1. This is non-negotiable and it is also
the answer to the first security question IT will ask.

---

## 10. Sync direction per object (bring this for them to redline)

| Object | Direction | Frequency |
|---|---|---|
| Item master | B1 → App | daily, or on change |
| Stock per item per warehouse | B1 → App | every 15 min, plus immediately after any post |
| Warehouses / bin locations | B1 → App | daily |
| Goods receipt / issue / transfer | **App → B1** | real-time, queued |
| Purchase request | **App → B1** | real-time, queued |
| Purchase order status | B1 → App | hourly |
| Expected deliveries | B1 → App | hourly |
| Projects / cost centres | B1 → App | daily |
| Floor plan placement | App-owned, unless bins are enabled (§6) | — |
| Photos, condition grading, custody log | App-owned | — |

---

## 11. What I need from IT — the requisition

### Tier one: nothing starts without these

- **Confirmation that the Service Layer is installed and running**, plus its exact
  base URL and port, and which protocol path (`/b1s/v2/` preferred).
- **Port 50000 opened to our server's outbound address.** Browser Access being
  open on 8200 does not mean 50000 is. This is a firewall rule, not a project.
  I will supply the fixed address.
- **The company database name** — required in every login call.
- **A dedicated B1 user for the integration**, with permission to create the
  document types we need, and confirmation of which licence it consumes.
- **A test company database** to work against, so we are never creating
  experimental goods issues in the live books. If none exists, ask what it takes
  to create one.
- **One named person** who owns this interface and will answer when a posting
  returns an error I do not recognise — which will happen in the first week and
  roughly weekly after that.

### Tier two: configuration facts I cannot guess

- **The warehouse code(s) for Central Warehouse Taytay**, and whether safekeeping
  is a separate warehouse.
- **Whether bin location management is enabled** for those warehouses, and whether
  it is populated (§6).
- **Whether batch or serial management is switched on** for our items.
- **An item master extract** — item code, description, item group, base UoM,
  inventory/purchase/sales flags, batch or serial setting — so I can compare
  against our 7,378 rows and find out whether we share a coding scheme.
- **How projects are tracked** — the `Projects` object, profit centres, or
  dimensions — and the codes for Avesta Residences, Southscapes, the three 4PH
  projects and any others.
- **The valid units of measure**, so I can normalise ours onto theirs.
- **Whether the database is HANA or SQL Server** (affects some query options).

### Tier three: what makes it reliable rather than merely working

- **One worked example of each document we will create**, exported from their
  system, so I can copy the exact shape rather than guess which fields their
  configuration requires. A goods receipt, a goods issue to a project, a stock
  transfer and a purchase request cover everything.
- **Permission to add one user-defined field** for our reference key (§8), and
  agreement that nothing else will use it.
- **The agreed reversal method** for each document type, so our "undo" behaves the
  way their accountants expect. B1 cancels rather than deletes, and I need to know
  which mechanism they want.
- **Session and concurrency limits** — how many simultaneous Service Layer
  sessions we may hold, and any nightly backup or maintenance window to avoid.
- **What we must demonstrate to earn write access to the live company.** Ask for
  their gate criteria at the *start*, so we build against them rather than
  discovering them at the end.

### The five to get if the meeting runs short

Service Layer confirmed and reachable · port 50000 opened to our address ·
company database name · an integration user · a test company.

Those five take us from zero to real read-write calls. Everything else is detail
that can follow in a second conversation.

---

## 12. Licensing

Business One licenses differently from ECC, and mostly in our favour — but there
is still a question that needs a real answer.

- **Ask:** does a Service Layer connection consume a named-user licence, do we
  need a dedicated licence for the integration account, and what is the limit on
  concurrent sessions? Our worker will hold a session while it drains the queue.
- **The counter-argument, which is strong here:** warehouse staff who only ever
  use our app may not need Business One licences at all. On B1's per-named-user
  pricing that is a direct, calculable saving. **Ask IT to quantify it** — it may
  fund the whole project by itself, and it is the most persuasive number you can
  walk out of that room with.
- Confirm who holds the **SAP maintenance contract**, in case something needs
  escalating to SAP or to the implementing partner.

---

## 13. Security and operations — what IT will want to hear

- **Credentials live only server-side.** The browser never sees a B1 password and
  never talks to B1.
- **Least privilege.** The integration user gets permission for exactly the
  document types we create, in the Taytay warehouse, and nothing else.
- **Network.** Port 50000 restricted to our server's address, not open to the
  world. HTTPS with a valid certificate.
- **Audit.** Every call logged with who triggered it, the payload, the response
  and a correlation reference. Our `audit_log` table already has no update or
  delete policy at all — say so, it lands well.
- **Failure handling.** Failed postings surface in the app as a queue an
  administrator can see and retry, and IT gets alerted if failures are systemic
  rather than one-off.
- **No personal data** beyond staff email addresses. Stating this shortens the
  security review.

---

## 14. The workflow forward

### Phase 0 — Discovery (this meeting, plus about two weeks)
Answers to §11, an integration user on a test company, and the item master
extract. **Gate:** we can name the exact Service Layer object and the exact fields
for each thing our app needs to do.

### Phase 1 — Read-write against the test company (roughly 3–5 weeks)
Stand up the server-side worker, the outbox queue, the session handling, the
translation layer and the reconciliation job. Exercise all of it — real postings,
real document numbers, real errors — in a system where a mistake harms nothing.
In parallel the **read** side goes live for real: dashboards and floor plan start
showing current B1 stock instead of a loaded snapshot.
**Gate:** reconciliation reports zero variance for ten consecutive days, and a
hundred consecutive test postings return correct document numbers with no
duplicates.

### Phase 2 — File exchange as the fallback (2 weeks, parallel)
Build the export from the same queue the worker drains, so switching between file
and live connection changes nothing in the app and nothing in the warehouse team's
routine. Keep it permanently as the thing that runs when the connection is down.

### Phase 3 — Live company, one document type at a time (6–10 weeks)
Ordered by how much damage a mistake causes:

1. **Purchase request** — an unapproved request harms nothing.
2. **Stock transfer** — moves material, does not change the total.
3. **Goods receipt** — increases stock.
4. **Goods issue** — decreases stock and charges project cost. **Last.**

Each one: built, tested with IT watching, then a two-week parallel run where the
same transaction is entered both in the app and manually in B1 and compared line
by line. Only then does manual entry stop for that document type.

### Phase 4 — Operations
Runbook, monitoring, on-call, quarterly reconciliation review, and the decision on
the long-term home for floor-plan placement data (§6).

---

## 15. What has to change on our side regardless

- **The app needs a server.** Today it is a browser application talking to a
  database. Holding B1 credentials and draining a queue requires a server-side
  component. New infrastructure, with an owner and a cost.
- **The hosting has to move.** The app currently sits on a free public service.
  That was correct for a prototype showing a snapshot; it is not defensible once
  the app holds a live connection into the company's ERP. Better we move it than
  be told to.
- **Automated tests and a staging environment.** The app has no tests today, which
  was fine when the worst outcome was a chart drawn wrongly. Once it can move
  stock in the company's books, it is not. Budget line now, not a surprise later.
- **The write screens get built once, correctly.** "Save to our database" and
  "post a B1 document and record what comes back" are structurally different
  operations. Building the first and converting it later means reopening every
  screen; building it right costs the same and takes no longer — it just needs the
  answers first. **This is why the meeting has to happen before the build.**

---

## 16. Meeting agenda (60–90 minutes)

1. **5 min** — Framing: system of record vs system of engagement (§2).
2. **10 min** — Show the app. Floor plan, dashboards, delivery tracker. Let it
   sell itself; do not lead with architecture.
3. **10 min** — The responsibility split (§2), invite redlines.
4. **10 min** — Confirm the landscape: version, database, company databases,
   whether a test company exists (§1).
5. **10 min** — **Is the Service Layer enabled, and can port 50000 be opened?**
   The single most important question in the meeting (§3).
6. **15 min** — Configuration facts: warehouses, bins, batches, projects (§11).
7. **10 min** — The UDF for our reference key (§8) and the two rulings on damaged
   and reserved stock (§7).
8. **10 min** — Phasing (§14), licensing (§12), named owner and next date.

**Leave with three things or the meeting failed:** a named counterpart, a yes or
no on the Service Layer, and a date for credentials on a test company.

---

## 17. Glossary

- **SAP Business One (B1)** — SAP's product for small and mid-sized companies. A
  separate product from ECC and S/4HANA, with its own database and vocabulary.
- **Browser Access** — the service that streams the Windows B1 client into a
  browser. This is what the `:8200/dispatcher/` URL is.
- **Web Client** — B1 10's newer native web interface. Distinct from Browser
  Access; not relevant to our integration.
- **Service Layer** — B1's REST/OData web API. Read-write, built in, and the route
  we want.
- **DI API** — the older Windows-only programming interface. Cannot be used from a
  web application.
- **DI Server** — a SOAP wrapper around the DI API. Acceptable fallback.
- **B1if** — B1's bundled integration middleware, included at no extra cost.
- **OData** — the web-service standard the Service Layer speaks. Lets us request
  precisely the rows and columns we need.
- **Company database** — B1 can host several companies on one server, each in its
  own database. Every login names one explicitly.
- **SLD (System Landscape Directory)** — B1's registry of servers, databases and
  services. Where the Service Layer is configured.
- **Item** (`OITM`) — B1's item master record.
- **Warehouse** (`OWHS`) — a stock-holding location. B1's equivalent of ECC's
  plant and storage location combined, and simpler.
- **Bin location** (`OBIN`) — an addressable position inside a warehouse (§6).
- **Goods Receipt** (`InventoryGenEntries` / `OIGN`) — stock in without a PO.
- **Goods Issue** (`InventoryGenExits` / `OIGE`) — stock out.
- **Stock Transfer** (`OWTR`) — movement between warehouses or bins.
- **Goods Receipt PO** (`PurchaseDeliveryNotes` / `OPDN`) — receipt against a PO.
- **Purchase Request** (`OPRQ`) — internal request to buy, before it becomes a PO.
- **DocEntry / DocNum** — a document's internal key and its human-visible number.
  We store both as proof of every posting.
- **UDF (User-Defined Field)** — a custom field an administrator can add to a
  standard B1 object with no programming. How we solve duplicate prevention (§8).
- **Committed quantity** — B1's own figure for stock spoken for by open documents.
  Relevant to what our "reserved" column should mean (§7).
- **Idempotency** — the property that sending the same message twice has the same
  effect as sending it once. The most important safety property in the project.
- **Outbox pattern** — recording the intent to post in a queue, so the user is
  never made into the retry mechanism.
- **Reconciliation** — the nightly comparison of B1's stock against ours, which
  reports variances rather than hiding them.

---

## Appendix — References

- [SAP Business One Service Layer API Reference](https://help.sap.com/doc/056f69366b5345a386bb8149f1700c19/10.0/en-US/Service%20Layer%20API%20Reference.html)
- [Service Layer v1 vs v2 (OData v3 vs v4)](https://sap-b1-blog.com/en/glossary/service-layer-v1-vs-v2/)
- [SAP Business One API integration guide](https://www.apideck.com/blog/sap-business-one-api-integration-guide)
- [How to Deploy SAP Business One with Browser Access](https://help.sap.com/doc/37bc0ffc0cdf48d08923360b4b43881b/10.0/en-US/How_to_Deploy_SAP_Business_One_with_Browser_Access.pdf)
