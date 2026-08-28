// The system model behind the Process Flow module.
//
// WHAT THIS FILE IS
// One authored description of how PRC-WH works, what is finished, what is half-built,
// what is only planned, and what I propose adding. Every screen in the module reads
// from here, so there is one place to update when the system changes.
//
// THE ONE RULE: every item carries a `status`. Nothing here describes a workflow
// without saying whether that workflow runs today.
//   live        — runs in the deployed app; `evidence` names the file
//   partial     — partly runs; `missing` says what does not
//   planned     — does not run; recorded in a plan or a schema
//   recommended — my proposal, kept strictly separate
//
// HOUSE STYLE FOR THIS FILE: written for an executive reader. One sentence per
// `detail`, under about 140 characters. If a point needs a paragraph it belongs in
// the changelog, not on the page — density was the first thing this module got wrong.
//
// The database and code-graph halves are GENERATED (src/data/generated/) so the table
// catalogue, routes, import graph and dependency audit cannot drift from the source.
import { DB } from './generated/dbSchema'
import { CODE } from './generated/codeMap'
import { ROLES, NAV, isLocked } from './roles'

// ---------------------------------------------------------------------------
// STATUS VOCABULARY
// ---------------------------------------------------------------------------
// Colour roles come from the existing tokens: green = good, yellow = warning,
// grey = inert, orange = attention. Brand red is NOT a status — it is reserved for
// the severity marks in Security, so red on this page always means "a problem".
export const STATUS = {
  live: { key: 'live', label: 'Implemented', short: 'Live', tone: 'ok', desc: 'Runs in the deployed app today.' },
  partial: { key: 'partial', label: 'In Development', short: 'Partial', tone: 'warn', desc: 'Screen exists; nothing is saved.' },
  planned: { key: 'planned', label: 'Planned', short: 'Planned', tone: 'neutral', desc: 'Not built. No workflow exists yet.' },
  recommended: { key: 'recommended', label: 'Recommendation', short: 'Suggested', tone: 'orange', desc: 'My proposal, not a plan.' },
}
export const STATUS_ORDER = ['live', 'partial', 'planned', 'recommended']
export const STATUS_LIST = STATUS_ORDER.map((k) => STATUS[k])

export const KIND = {
  entry: { label: 'Entry point', icon: 'doc' },
  ui: { label: 'Screen', icon: 'dashboard' },
  logic: { label: 'App logic', icon: 'settings' },
  api: { label: 'Network call', icon: 'transfer' },
  service: { label: 'Supabase service', icon: 'warehouse' },
  db: { label: 'Database table', icon: 'layers' },
  trigger: { label: 'Database rule', icon: 'audit' },
  policy: { label: 'Security policy', icon: 'lock' },
  external: { label: 'External system', icon: 'truck' },
  decision: { label: 'Decision point', icon: 'filter' },
  gap: { label: 'Break in the chain', icon: 'alert' },
}

// ---------------------------------------------------------------------------
// 1. THE USER JOURNEY — deliberately ONE straight line
// ---------------------------------------------------------------------------
// The first version of this branched: proposed additions (single sign-on, a second
// factor, a narrower data load) sat as parallel boxes inside the chain, and the
// "look something up" branch skipped three stages to reach Reporting. The result was
// arrows crossing arrows and no readable path through it.
//
// It is now strictly sequential — one box per stage, one arrow between neighbours,
// no forks, no skips. Colour alone carries where it breaks, which is what an
// executive reader is actually looking for. The proposals moved to
// JOURNEY_RECOMMENDATIONS below and are listed, not drawn.
export const JOURNEY = {
  id: 'journey',
  title: 'Login to logout',
  note: 'One step per box, top to bottom. Colour says whether it runs. A dashed arrow means the link carries nothing today.',
  stages: [
    {
      id: 's1', title: 'Arrival',
      nodes: [{
        id: 'open', label: 'Staff opens the site', kind: 'entry', status: 'live',
        detail: 'Static files served from GitHub Pages. There is no server of ours — the browser talks straight to Supabase.',
        evidence: [{ file: '.github/workflows/deploy.yml', note: 'builds on every push to main' }],
      }],
    },
    {
      id: 's2', title: 'Session check',
      nodes: [{
        id: 'session', label: 'Existing session?', kind: 'decision', status: 'live',
        detail: 'A stored session skips the login screen; the token refreshes itself in the background.',
        evidence: [{ file: 'src/context/AuthContext.jsx', note: 'auth.getSession() on mount' }],
      }],
    },
    {
      id: 's3', title: 'Sign in',
      nodes: [{
        id: 'login', label: 'Login screen', kind: 'ui', status: 'live',
        detail: 'Email and password. The published build carries no demo credentials.',
        evidence: [{ file: 'src/pages/Login.jsx', note: 'demo panel gated to dev builds' }],
      }],
    },
    {
      id: 's4', title: 'Authentication',
      nodes: [{
        id: 'verify', label: 'Credentials verified', kind: 'service', status: 'live',
        detail: 'Supabase Auth checks the password and issues a signed token. Our code never sees a stored password.',
        evidence: [{ file: 'src/context/AuthContext.jsx', note: 'signInWithPassword' }],
      }],
    },
    {
      id: 's5', title: 'Role',
      nodes: [{
        id: 'role', label: 'Role read from profile', kind: 'db', status: 'live',
        detail: 'Role, name and department come from the profiles table. A database rule blocks anyone promoting themselves.',
        evidence: [
          { file: 'src/context/AuthContext.jsx', note: 'select from profiles' },
          { file: 'supabase/schema.sql', note: 'guard_role_change() trigger' },
        ],
      }],
    },
    {
      id: 's6', title: 'Data',
      nodes: [{
        id: 'load', label: 'Dataset loaded', kind: 'api', status: 'live',
        detail: 'Thirteen tables fetched before the first screen draws, which is why no page has a loading spinner.',
        evidence: [{ file: 'src/lib/hydrate.js', note: 'thirteen parallel reads, paged' }],
      }],
    },
    {
      id: 's7', title: 'Route guard',
      nodes: [{
        id: 'guard', label: 'Protected route check', kind: 'logic', status: 'live',
        detail: 'Seventeen of nineteen routes require a session; the rest redirect to login.',
        evidence: [{ file: 'src/App.jsx', note: 'the Protected wrapper' }],
      }],
    },
    {
      id: 's8', title: 'Shell',
      nodes: [{
        id: 'shell', label: 'Navigation and account menu', kind: 'ui', status: 'live',
        detail: 'The persistent frame: sidebar, page title, theme switch, account menu.',
        evidence: [{ file: 'src/components/Layout.jsx', note: 'shell and navigation' }],
      }],
    },
    {
      id: 's9', title: 'Module',
      nodes: [{
        id: 'module', label: 'Open a module', kind: 'ui', status: 'live',
        detail: 'The same destinations for everyone, padlocked where a role may not go. Pages load on demand.',
        evidence: [{ file: 'src/data/roles.js', note: 'NAV and lockedFor' }],
      }],
    },
    {
      id: 's10', title: 'Look something up',
      nodes: [{
        id: 'read', label: 'Read anything', kind: 'ui', status: 'live',
        detail: 'Dashboards, masterlist, profiles, floor plan, alerts, reports, analytics — all computed from live data.',
        evidence: [{ file: 'src/data/insights.js', note: 'every KPI and chart series' }],
      }],
    },
    {
      id: 's11', title: 'Record something',
      nodes: [{
        id: 'write', label: 'Fill in a form', kind: 'ui', status: 'partial',
        detail: 'The forms exist and validate. Only the safekeeping request has a save behind it.',
        missing: 'A save call on every other form.',
        evidence: [
          { file: 'src/components/AddMaterialModal.jsx', note: 'shows success, saves nothing' },
          { file: 'src/pages/Movement.jsx', note: 'submits into page state only' },
        ],
      }],
    },
    {
      id: 's12', title: 'Save',
      nodes: [{
        id: 'save', label: 'Written to the database', kind: 'gap', status: 'partial',
        detail: 'One of seven transactional tables has ever received a row. The other six are live, empty and willing.',
        missing: 'Insert calls, plus a rule for what a save does to the stock figures.',
        evidence: [
          { file: 'src/context/SafekeepingContext.jsx', note: 'the one working write' },
          { file: 'CLAUDE.md', note: 'known blocker #6' },
        ],
      }],
    },
    {
      id: 's13', title: 'Notify',
      nodes: [{
        id: 'notify', label: 'Notification raised', kind: 'ui', status: 'partial',
        detail: 'Three of four counts are real. Nothing is delivered, nothing can be marked read.',
        missing: 'A notifications table and a read state per user.',
        evidence: [{ file: 'src/components/Layout.jsx', note: 'the notifications array' }],
      }],
    },
    {
      id: 's14', title: 'Approve',
      nodes: [{
        id: 'approve', label: 'Approve or reject', kind: 'ui', status: 'partial',
        detail: 'The buttons work on screen. The decision is gone on refresh, and nobody is recorded as deciding it.',
        missing: 'An update call, and a consequence for the decision.',
        evidence: [{ file: 'src/pages/Approvals.jsx', note: 'decision held in page state' }],
      }],
    },
    {
      id: 's15', title: 'Report',
      nodes: [{
        id: 'report', label: 'Dashboards and analytics', kind: 'ui', status: 'live',
        detail: 'Every figure is derived from the data. No invented numbers remain anywhere in the app.',
        evidence: [{ file: 'src/pages/Analytics.jsx', note: 'every tile derived' }],
      }],
    },
    {
      id: 's16', title: 'Export',
      nodes: [{
        id: 'export', label: 'Download a report', kind: 'logic', status: 'planned',
        detail: 'Two roles are granted an export permission. Nothing implements one; there is no download button.',
        evidence: [{ file: 'src/data/roles.js', note: "the 'export' permission" }],
      }],
    },
    {
      id: 's17', title: 'Audit',
      nodes: [{
        id: 'audit', label: 'Record who did what', kind: 'db', status: 'planned',
        detail: 'The audit table is append-only by design and empty. No action in the system leaves a trace.',
        evidence: [{ file: 'src/pages/AuditLogs.jsx', note: 'reads the table; renders empty' }],
      }],
    },
    {
      id: 's18', title: 'Exit',
      nodes: [{
        id: 'signout', label: 'Sign out', kind: 'service', status: 'live',
        detail: 'Ends the session, clears local storage, returns to login.',
        evidence: [{ file: 'src/context/AuthContext.jsx', note: 'signOut()' }],
      }],
    },
  ],
}

// Proposals that used to sit inside the chain above. Listed rather than drawn: a
// dotted parallel box beside a real step reads as though the step already has an
// alternative, and it was the main source of the crossing arrows.
export const JOURNEY_RECOMMENDATIONS = [
  {
    label: 'Company single sign-on',
    at: 'Sign in',
    detail: 'Staff hold a second password today. Microsoft 365 as the identity provider removes it and lets IT revoke access in one place.',
  },
  {
    label: 'Second factor',
    at: 'Authentication',
    detail: 'None exists. One leaked password reads the entire inventory valuation.',
  },
  {
    label: 'Load only what the role needs',
    at: 'Data',
    detail: 'Every user downloads every price and the full valuation. A site user has no business reason to hold it.',
  },
  {
    label: 'Audit entries written by the database',
    at: 'Audit',
    detail: 'A log the browser composes is a log the browser can shape. Triggers should write it.',
  },
]

// ---------------------------------------------------------------------------
// 2. FUNCTIONAL PROCESS MAPPING
// ---------------------------------------------------------------------------
// One flow per business domain. Kept to at most two boxes per stage so the arrows
// stay legible; where a stage genuinely has parallel options that is real, not noise.
export const PROCESSES = [
  {
    id: 'authentication',
    title: 'Authentication',
    icon: 'lock',
    summary: 'Complete. Sign-in, sessions and sign-out all work, and roles come from the database.',
    stages: [
      {
        id: 'a1', title: 'Sign in',
        nodes: [{
          id: 'a-form', label: 'Credential entry', kind: 'ui', status: 'live',
          detail: 'Email and password. Production builds carry no demo credentials.',
          evidence: [{ file: 'src/pages/Login.jsx', note: 'the sign-in form' }],
        }],
      },
      {
        id: 'a2', title: 'Session',
        nodes: [{
          id: 'a-jwt', label: 'Signed token issued and stored', kind: 'service', status: 'live',
          detail: 'A short-lived signed token proves identity on every request; it refreshes itself.',
          evidence: [{ file: 'src/lib/supabase.js', note: 'persistSession, autoRefreshToken' }],
        }],
      },
      {
        id: 'a3', title: 'Validation',
        nodes: [{
          id: 'a-valid', label: 'Checked on every startup', kind: 'logic', status: 'live',
          detail: 'Checked on mount, plus a subscription that reacts to sign-in and sign-out anywhere in the app.',
          evidence: [{ file: 'src/context/AuthContext.jsx', note: 'getSession + onAuthStateChange' }],
        }],
      },
      {
        id: 'a4', title: 'Role',
        nodes: [{
          id: 'a-role', label: 'Profile lookup', kind: 'db', status: 'live',
          detail: 'One row from profiles gives role, name, department and access level.',
          evidence: [{ file: 'src/context/AuthContext.jsx', note: 'loadProfile()' }],
        }, {
          id: 'a-provision', label: 'Role guessed from the email', kind: 'trigger', status: 'live',
          detail: 'A trigger assigns a role from the text before the @ and ignores the domain. See the Security view.',
          evidence: [{ file: 'supabase/schema.sql', note: 'handle_new_user()' }],
        }],
      },
      {
        id: 'a5', title: 'Route protection',
        nodes: [{
          id: 'a-guard', label: 'Session required', kind: 'logic', status: 'live',
          detail: 'Seventeen of nineteen routes redirect an unauthenticated visitor to login.',
          evidence: [{ file: 'src/App.jsx', note: 'the Protected component' }],
        }, {
          id: 'a-roleguard', label: 'Role required', kind: 'logic', status: 'partial',
          detail: 'A padlocked destination still renders if its address is typed in. The restriction is decoration.',
          missing: 'A role check in the route guard, and matching database policies.',
          evidence: [{ file: 'src/App.jsx', note: 'Protected checks for a user, never a role' }],
        }],
      },
      {
        id: 'a6', title: 'Logout',
        nodes: [{
          id: 'a-out', label: 'Session ended and cleared', kind: 'service', status: 'live',
          detail: 'Supabase sign-out, local storage cleared, redirect to login.',
          evidence: [{ file: 'src/context/AuthContext.jsx', note: 'signOut()' }],
        }],
      },
    ],
  },

  {
    id: 'inventory',
    title: 'Inventory management',
    icon: 'inventory',
    summary: 'Reading is complete and accurate. No form in the app alters a stock figure.',
    stages: [
      {
        id: 'i1', title: 'Create',
        nodes: [{
          id: 'i-add', label: 'Add Material form', kind: 'ui', status: 'partial',
          detail: 'Validates the item code against the 7,378-code catalogue, then ends on a confirmation and saves nothing.',
          missing: 'An insert into inventory, and an audit entry.',
          evidence: [{ file: 'src/components/AddMaterialModal.jsx', note: 'submit() sets a success flag' }],
        }],
      },
      {
        id: 'i2', title: 'Update',
        nodes: [{
          id: 'i-edit', label: 'Edit a material line', kind: 'ui', status: 'planned',
          detail: 'No edit screen. Corrections are made in the database directly.',
          evidence: [],
        }, {
          id: 'i-cond', label: 'Condition and location', kind: 'ui', status: 'planned',
          detail: 'Warehouse staff hold both permissions and no screen exercises either.',
          evidence: [{ file: 'src/data/roles.js', note: 'updateCondition, updateLocation' }],
        }],
      },
      {
        id: 'i3', title: 'Reserve',
        nodes: [{
          id: 'i-res', label: 'Reservations register', kind: 'ui', status: 'partial',
          detail: 'Reads the table, which is empty. Release changes the screen only.',
          missing: 'Create and release calls, plus the effect on available stock.',
          evidence: [{ file: 'src/pages/Reservations.jsx', note: 'release() maps over page state' }],
        }, {
          id: 'i-res-effect', label: 'Availability adjusts', kind: 'trigger', status: 'planned',
          detail: 'Nothing moves quantity from available to reserved. The two columns are independent figures.',
          evidence: [{ file: 'supabase/schema.sql', note: 'no trigger against inventory' }],
        }],
      },
      {
        id: 'i4', title: 'Issue, return, transfer',
        nodes: [{
          id: 'i-issue', label: 'Issuance, return, transfer', kind: 'ui', status: 'planned',
          detail: 'All three appear in the New Transaction menu and are deliberately disabled.',
          evidence: [{ file: 'src/components/NewTransactionMenu.jsx', note: 'entries with no form' }],
        }, {
          id: 'i-adjust', label: 'Adjustment', kind: 'db', status: 'planned',
          detail: 'The movements table already accepts an Adjustment type. No screen creates one.',
          evidence: [{ file: 'supabase/schema.sql', note: 'movements.type check' }],
        }],
      },
      {
        id: 'i5', title: 'History',
        nodes: [{
          id: 'i-hist', label: 'Movement history per material', kind: 'ui', status: 'live',
          detail: '184 rows of real recorded warehouse activity, shown on each material profile.',
          evidence: [{ file: 'src/pages/MaterialProfile.jsx', note: 'reads the ledger' }],
        }, {
          id: 'i-hist-new', label: 'History of in-app actions', kind: 'db', status: 'partial',
          detail: 'The ledger is imported history. Actions taken inside the app are recorded nowhere.',
          missing: 'The write path.',
          evidence: [{ file: 'src/data/transactions.js', note: 'movements[] is empty' }],
        }],
      },
    ],
  },

  {
    id: 'warehouse',
    title: 'Warehouse operations',
    icon: 'warehouse',
    summary: 'Safekeeping works end to end. Receiving, issuance and transfers are screens without a save.',
    stages: [
      {
        id: 'w1', title: 'Receiving',
        nodes: [{
          id: 'w-recv', label: 'Incoming material form', kind: 'ui', status: 'partial',
          detail: 'Quantity, project, document reference and a document drop area that accepts nothing. Saves nothing.',
          missing: 'An insert into movements, document storage, and the effect on stock.',
          evidence: [{ file: 'src/pages/Movement.jsx', note: 'the incoming form' }],
        }, {
          id: 'w-recv-sk', label: 'Safekeeping receipt', kind: 'ui', status: 'live',
          detail: 'Project-owned material received for storage. This one saves.',
          evidence: [{ file: 'src/components/AddSafekeepingRequestModal.jsx', note: 'the request form' }],
        }],
      },
      {
        id: 'w2', title: 'Issue and transfer',
        nodes: [{
          id: 'w-issue', label: 'Issue against a request', kind: 'ui', status: 'planned',
          detail: 'No screen. The intended chain is request, approval, reservation, issuance.',
          evidence: [],
        }, {
          id: 'w-move', label: 'Internal relocation', kind: 'ui', status: 'planned',
          detail: 'Disabled, and it has nowhere to write: the location columns on inventory are empty.',
          evidence: [{ file: 'supabase/schema.sql', note: 'inventory.zone / rack / shelf / bin' }],
        }],
      },
      {
        id: 'w3', title: 'Safekeeping',
        nodes: [{
          id: 'w-sk-save', label: 'Request saved', kind: 'db', status: 'live',
          detail: 'The one complete write in the app. Packing lists stored as a structured document.',
          evidence: [{ file: 'src/context/SafekeepingContext.jsx', note: 'insert with rollback' }],
        }, {
          id: 'w-sk-approve', label: 'Request reviewed', kind: 'ui', status: 'planned',
          detail: 'A submitted request stays Submitted forever and never becomes a stock movement.',
          evidence: [{ file: 'supabase/schema.sql', note: "status defaults to 'Submitted'" }],
        }],
      },
      {
        id: 'w4', title: 'Stock on hand',
        nodes: [{
          id: 'w-soh', label: 'Stock figures', kind: 'db', status: 'live',
          detail: '779 warehouse lines and 132 safekeeping lines, real and read from the database.',
          evidence: [{ file: 'src/lib/hydrate.js', note: 'inventory and safekeeping_soh' }],
        }, {
          id: 'w-soh-update', label: 'Figures move when stock moves', kind: 'trigger', status: 'planned',
          detail: 'Stock on hand is an imported snapshot, only as current as the last re-seed.',
          evidence: [{ file: 'scripts/generate-seeds.mjs', note: 'npm run seed' }],
        }],
      },
      {
        id: 'w5', title: 'Location',
        nodes: [{
          id: 'w-loc', label: 'Floor plan and racking', kind: 'ui', status: 'live',
          detail: 'Three levels drawn from the real CW Taytay plan, with capacities from the engineering drawing.',
          evidence: [{ file: 'src/data/warehouseMap.js', note: 'drawing coordinates' }],
        }, {
          id: 'w-loc-real', label: 'Where a pallet actually is', kind: 'gap', status: 'partial',
          detail: 'The stock sheet records no location, so which bay a line sits in is a model, not a record.',
          missing: 'A recorded location column, which turns the placement rule into a lookup.',
          evidence: [{ file: 'src/data/warehouseMap.js', note: 'placement()' }],
        }],
      },
      {
        id: 'w6', title: 'Logging',
        nodes: [{
          id: 'w-log', label: 'Every action recorded', kind: 'db', status: 'planned',
          detail: 'Nothing is logged. The audit table is append-only and empty.',
          evidence: [{ file: 'supabase/schema.sql', note: 'audit_log, insert + read only' }],
        }],
      },
    ],
  },

  {
    id: 'procurement',
    title: 'Procurement operations',
    icon: 'request',
    summary: 'Demand signals are real. Everything downstream of the signal is unsaved or unbuilt.',
    stages: [
      {
        id: 'p1', title: 'Demand signal',
        nodes: [{
          id: 'p-low', label: 'Low stock alerts', kind: 'ui', status: 'live',
          detail: 'Materials at or below minimum, ranked, with the shortfall and its value.',
          evidence: [{ file: 'src/pages/LowStock.jsx', note: 'the alert list' }],
        }, {
          id: 'p-aging', label: 'Aging and non-moving stock', kind: 'ui', status: 'live',
          detail: 'Six aging bands from the recorded last-movement date, plus a non-moving value figure.',
          evidence: [{ file: 'src/data/insights.js', note: 'agingAnalysis()' }],
        }],
      },
      {
        id: 'p2', title: 'Material request',
        nodes: [{
          id: 'p-mr', label: 'Site raises a request', kind: 'ui', status: 'partial',
          detail: 'Item, quantity, project, purpose, date. Submits into the page and is lost on refresh.',
          missing: 'An insert, and routing to an approver.',
          evidence: [{ file: 'src/pages/RequestMaterials.jsx', note: 'submit() into page state' }],
        }, {
          id: 'p-mr-projects', label: 'Project list on the form', kind: 'gap', status: 'partial',
          detail: 'The form offers five hard-coded project names while the database has a projects table.',
          missing: 'Read the projects table the rest of the app already reads.',
          evidence: [{ file: 'src/pages/RequestMaterials.jsx', note: 'a local array of five strings' }],
        }],
      },
      {
        id: 'p3', title: 'Purchase requirement',
        nodes: [{
          id: 'p-pr', label: 'Requirements register', kind: 'ui', status: 'partial',
          detail: 'A read-only register over an empty table, with no way to raise one.',
          missing: 'A creation form and an insert.',
          evidence: [{ file: 'src/pages/PurchaseRequests.jsx', note: 'renders a table' }],
        }, {
          id: 'p-po', label: 'Purchase order', kind: 'external', status: 'planned',
          detail: 'No table, no screen. Purchase orders live in SAP Business One.',
          evidence: [{ file: 'docs/sap-integration-brief.md', note: 'the integration plan' }],
        }],
      },
      {
        id: 'p4', title: 'Receiving',
        nodes: [{
          id: 'p-track', label: 'Delivery tracker', kind: 'ui', status: 'live',
          detail: '27 scheduled deliveries with target weeks, towers, down-payment status and remarks.',
          evidence: [{ file: 'src/data/deliveryTracker.js', note: 'rebuildDeliveryRows()' }],
        }, {
          id: 'p-recv', label: 'Match a delivery to its order', kind: 'external', status: 'planned',
          detail: 'Not possible without the SAP link: this system has no purchase order to match against.',
          evidence: [],
        }],
      },
      {
        id: 'p5', title: 'Synchronisation',
        nodes: [{
          id: 'p-seed', label: 'Manual re-seed', kind: 'logic', status: 'live',
          detail: 'How the data gets current today: a script generates SQL and a person pastes it in order.',
          evidence: [{ file: 'scripts/generate-seeds.mjs', note: 'npm run seed' }],
        }, {
          id: 'p-sap', label: 'Two-way sync with SAP', kind: 'external', status: 'planned',
          detail: 'Business One already exposes every object needed, so nothing has to be built on the SAP side.',
          evidence: [{ file: 'docs/sap-integration-brief.md', note: 'the object mapping' }],
        }],
      },
    ],
  },

  {
    id: 'reporting',
    title: 'Reporting and analytics',
    icon: 'reports',
    summary: 'The strongest part of the system. Every figure is derived. Only export is missing.',
    stages: [
      {
        id: 'r1', title: 'Data',
        nodes: [{
          id: 'r-hydrate', label: 'One load at startup', kind: 'api', status: 'live',
          detail: 'Thirteen tables fetched once, then held in memory for every page.',
          evidence: [{ file: 'src/lib/hydrate.js', note: 'the loader' }],
        }],
      },
      {
        id: 'r2', title: 'Computation',
        nodes: [{
          id: 'r-kpi', label: 'Quantity and value KPIs', kind: 'logic', status: 'live',
          detail: 'Six figures in units and in pesos, so total equals available plus reserved in both.',
          evidence: [{ file: 'src/data/insights.js', note: 'KPIS()' }],
        }, {
          id: 'r-turn', label: 'Turnover and value trend', kind: 'logic', status: 'live',
          detail: 'Anchored to the newest recorded ledger day, not to today, so a lagging sheet cannot report a false 0%.',
          evidence: [{ file: 'src/data/insights.js', note: 'analytics(), valueAt()' }],
        }],
      },
      {
        id: 'r3', title: 'Presentation',
        nodes: [{
          id: 'r-rep', label: 'Reports and analytics', kind: 'ui', status: 'live',
          detail: 'Trade breakdowns, high-value and non-moving lines, turnover, availability.',
          evidence: [{ file: 'src/pages/Analytics.jsx', note: 'every tile derived' }],
        }, {
          id: 'r-model', label: 'Figures that are modelled', kind: 'gap', status: 'partial',
          detail: 'Two remain and both are labelled: the available/reserved split in Movement History, and pre-ledger buckets.',
          missing: 'Reservation history, which arrives once reservations are recorded.',
          evidence: [{ file: 'src/data/insights.js', note: 'movementCombinedSeries()' }],
        }],
      },
      {
        id: 'r4', title: 'Export',
        nodes: [{
          id: 'r-exp', label: 'Download a report', kind: 'logic', status: 'planned',
          detail: 'No export exists. Two roles are granted the permission.',
          evidence: [{ file: 'src/data/roles.js', note: "the 'export' permission" }],
        }],
      },
    ],
  },

  {
    id: 'users',
    title: 'User and access management',
    icon: 'users',
    summary: 'The weakest area. Accounts are made by hand and the user screen changes nothing.',
    stages: [
      {
        id: 'u1', title: 'Creation',
        nodes: [{
          id: 'u-add', label: 'Add User form', kind: 'ui', status: 'partial',
          detail: 'Cannot work as written: creating an account needs a key that must never reach a browser.',
          missing: 'A server-side function holding that key.',
          evidence: [{ file: 'src/pages/Users.jsx', note: 'add() appends to page state' }],
        }, {
          id: 'u-manual', label: 'Created in the Supabase dashboard', kind: 'external', status: 'live',
          detail: 'How accounts are really made today.',
          evidence: [{ file: 'CLAUDE.md', note: 'create the real user accounts' }],
        }],
      },
      {
        id: 'u2', title: 'Role assignment',
        nodes: [{
          id: 'u-map', label: 'Guessed from the email address', kind: 'trigger', status: 'live',
          detail: 'The rule reads the text before the @ and ignores the domain. A privilege-escalation route if signup is open.',
          evidence: [{ file: 'supabase/schema.sql', note: 'handle_new_user()' }],
        }, {
          id: 'u-change', label: 'Change a role', kind: 'db', status: 'partial',
          detail: 'Administrator only, enforced by a trigger, and the only way is to edit the row in Supabase.',
          missing: 'A control on the user screen, and an audit entry.',
          evidence: [{ file: 'supabase/schema.sql', note: 'guard_role_change()' }],
        }],
      },
      {
        id: 'u3', title: 'Permission checks',
        nodes: [{
          id: 'u-ui', label: 'In the interface', kind: 'logic', status: 'live',
          detail: 'A permission helper and a locked-navigation list decide what a role is offered.',
          evidence: [{ file: 'src/data/roles.js', note: 'can() and isLocked()' }],
        }, {
          id: 'u-db', label: 'In the database', kind: 'policy', status: 'partial',
          detail: 'Two kinds of user exist: administrator, and everyone else signed in. All four operational roles are identical.',
          missing: 'Per-role policies. The schema comment already names the change.',
          evidence: [{ file: 'supabase/schema.sql', note: "auth.role() = 'authenticated'" }],
        }],
      },
      {
        id: 'u4', title: 'Deactivation',
        nodes: [{
          id: 'u-off', label: 'Disable an account', kind: 'ui', status: 'partial',
          detail: 'The toggle changes a label. An account marked Inactive signs in normally.',
          missing: 'Use the Supabase ban facility, or remove the control.',
          evidence: [{ file: 'src/pages/Users.jsx', note: 'toggle() flips a label' }],
        }, {
          id: 'u-deadmenu', label: 'Per-role menus nothing reads', kind: 'gap', status: 'partial',
          detail: 'All five roles carry a full menu definition and no code reads any of them.',
          missing: 'Delete them, or make the sidebar read them.',
          evidence: [{ file: 'src/data/roles.js', note: 'ROLES[*].menu — no consumer' }],
        }],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// 3. SYSTEM ARCHITECTURE
// ---------------------------------------------------------------------------
const kindCount = (k) => CODE.files.filter((f) => f.kind === k).length

export const ARCHITECTURE = {
  note: 'There is no server of ours in the middle. The browser talks straight to the database, which is why the database rules are the only enforcement point.',
  layers: [
    {
      id: 'frontend',
      title: 'Frontend — the browser',
      status: 'live',
      summary: `React single-page app built by Vite. ${CODE.fileCount} files, ${CODE.totalLines.toLocaleString('en-PH')} lines.`,
      groups: [
        {
          title: 'Pages', status: 'live', count: kindCount('page') + kindCount('dashboard-tab'),
          detail: 'Routed pages plus dashboard tabs. Fifteen load on demand.',
          items: CODE.files.filter((f) => f.kind === 'page' || f.kind === 'dashboard-tab').map((f) => f.path),
        },
        {
          title: 'Components', status: 'live', count: kindCount('component') + kindCount('floorplan') + kindCount('processflow'),
          detail: 'An in-house kit plus the chart, floor-plan and diagram renderers. No third-party UI library.',
          items: CODE.files.filter((f) => ['component', 'floorplan', 'processflow'].includes(f.kind)).map((f) => f.path),
        },
        {
          title: 'State', status: 'live', count: kindCount('context'),
          detail: 'Four React contexts, nothing heavier. Shareable screen state lives in the URL.',
          items: CODE.files.filter((f) => f.kind === 'context').map((f) => f.path),
        },
        {
          title: 'Data modules', status: 'live', count: kindCount('data'),
          detail: 'The view models, filled in place by the loader. Refill an array, never replace it.',
          items: CODE.files.filter((f) => f.kind === 'data').map((f) => f.path),
        },
        {
          title: 'Library', status: 'live', count: kindCount('lib'),
          detail: 'The Supabase client, the loader, formatting, colours, icons.',
          items: CODE.files.filter((f) => f.kind === 'lib').map((f) => f.path),
        },
      ],
      gaps: [
        { label: 'No error boundary', status: 'recommended', detail: 'One thrown error takes the whole app to a blank page with no message.' },
        { label: 'No automated tests', status: 'recommended', detail: 'The calculation modules are pure functions with hand-checked expected values. Nothing guards them.' },
      ],
    },
    {
      id: 'backend',
      title: 'Backend — Supabase',
      status: 'live',
      summary: 'Authentication, an automatic HTTP interface over the database, and file storage. We run none of it.',
      groups: [
        {
          title: 'Authentication', status: 'live', count: 4,
          detail: 'Sign-in, session storage, automatic token refresh, a state subscription.',
          items: ['sign in with password', 'get session', 'sign out', 'auth state subscription'],
        },
        {
          title: 'Database interface', status: 'live', count: DB.tableCount,
          detail: 'Requests carry the user’s signed token and the database decides what it may see.',
          items: ['select (13 tables at startup)', 'select item_master on demand', 'insert safekeeping_requests'],
        },
        {
          title: 'File storage', status: 'planned', count: 0,
          detail: 'Not configured. Delivery paperwork, packing lists and photographs have nowhere to go.',
          items: [],
        },
        {
          title: 'Server-side functions', status: 'planned', count: 0,
          detail: 'None. Three things need one: creating accounts, sending mail, calling SAP.',
          items: [],
        },
      ],
      gaps: [
        { label: 'Everything runs on the user’s own token', status: 'live', detail: 'Correct and deliberate — and why anything needing elevated rights waits for a server-side function.' },
      ],
    },
    {
      id: 'database',
      title: 'Database — Postgres',
      status: 'live',
      summary: `${DB.tableCount} tables, ${DB.relationships.length} foreign keys, ${DB.tables.reduce((a, t) => a + t.policies.length, 0)} policies, ${DB.functions.length} functions, ${DB.triggers.length} triggers.`,
      groups: [
        { title: 'Identity', status: 'live', count: 1, detail: 'One table joining an account to its role, protected by the role-change trigger.', items: ['profiles'] },
        { title: 'Reference data', status: 'live', count: DB.groups.reference.length, detail: 'The real dataset. Read by everyone signed in; written only by an administrator.', items: DB.groups.reference },
        { title: 'Transactional', status: 'partial', count: DB.groups.transactional.length, detail: 'Created empty on purpose. One of the seven has ever received a row.', items: DB.groups.transactional },
      ],
      gaps: [
        { label: 'No rules keep the stock figures consistent', status: 'planned', detail: 'Once writes begin, correctness would rest entirely on the browser being right every time.' },
        { label: 'No quantity constraints', status: 'recommended', detail: 'Quantity columns accept zero and negatives.' },
      ],
    },
  ],
}

// How a request travels. Linear, for the same reason the journey is.
export const REQUEST_FLOW = {
  id: 'request',
  title: 'What happens when a screen asks for data',
  stages: [
    {
      id: 'q1', title: 'Browser',
      nodes: [{
        id: 'q-page', label: 'A page needs data', kind: 'ui', status: 'live',
        detail: 'It reads the data modules, which were filled once at startup. It fetches nothing itself.',
        evidence: [{ file: 'src/pages/dashboard/InventoryTab.jsx', note: 'reads insights, never queries' }],
      }],
    },
    {
      id: 'q2', title: 'Client',
      nodes: [{
        id: 'q-client', label: 'The Supabase client', kind: 'logic', status: 'live',
        detail: 'One file creates it for the whole app and attaches the signed-in token to every request.',
        evidence: [{ file: 'src/lib/supabase.js', note: 'the single createClient call' }],
      }],
    },
    {
      id: 'q3', title: 'Network',
      nodes: [{
        id: 'q-http', label: 'HTTPS request with the token', kind: 'api', status: 'live',
        detail: 'Straight from the browser to Supabase. Nothing of ours inspects, filters or logs it.',
        evidence: [],
      }],
    },
    {
      id: 'q4', title: 'Supabase',
      nodes: [{
        id: 'q-rest', label: 'Database interface', kind: 'service', status: 'live',
        detail: 'Reads the user id and role out of the token and hands both to Postgres.',
        evidence: [{ file: 'src/lib/hydrate.js', note: 'select with range paging' }],
      }],
    },
    {
      id: 'q5', title: 'Postgres',
      nodes: [{
        id: 'q-rls', label: 'Row-level security', kind: 'policy', status: 'live',
        detail: 'The only enforcement point in the system. There is no server-side code of ours that could add a check.',
        evidence: [{ file: 'supabase/schema.sql', note: 'the policy loop' }],
      }],
    },
    {
      id: 'q6', title: 'Tables',
      nodes: [{
        id: 'q-table', label: 'The table, and any rule on it', kind: 'db', status: 'live',
        detail: 'On a write, column defaults capture who did it from the token.',
        evidence: [{ file: 'supabase/schema.sql', note: 'created_by defaults' }],
      }],
    },
    {
      id: 'q7', title: 'Back to the screen',
      nodes: [{
        id: 'q-back', label: 'Rows mapped and rendered', kind: 'logic', status: 'live',
        detail: 'Column names translated, arrays refilled in place, derived figures recomputed, React draws.',
        evidence: [{ file: 'src/lib/hydrate.js', note: 'row mappers and rebuild calls' }],
      }],
    },
  ],
}

// ---------------------------------------------------------------------------
// TABLE DESCRIPTIONS — authored, one sentence each
// ---------------------------------------------------------------------------
// The generator lifts each table's purpose from the comment above it in the schema,
// which gives nothing for the eight tables with no adjacent comment. These are
// written for a reader who does not work on the code.
export const TABLE_NOTES = {
  profiles: 'One row per person who can sign in — role, name, department, access level.',
  trades: 'The trade taxonomy every material is filed under: trade, then item group.',
  projects: 'The project register — a short code and the proper name.',
  item_master: 'The company-wide catalogue of 7,378 codes. Not stock — the list of everything that can be stocked.',
  inventory: 'Central Warehouse stock on hand, 779 lines. Every dashboard figure is computed from this.',
  ledger: '184 real recorded movements in and out, imported. Turnover and aging come from here.',
  safekeeping_soh: 'Stock held on behalf of a project, 132 lines. Not company-owned.',
  safekeeping_incoming: 'Project-owned material received into safekeeping — 271 receipts.',
  safekeeping_outgoing: 'Project-owned material released back out — 160 releases.',
  delivery_tracker: '27 expected deliveries with target weeks, towers and down-payment status.',
  movements: 'Where receipts, issues, returns and adjustments would be written. Live, empty, willing.',
  reservations: 'Where a hold on stock would be written. Live and empty, and nothing adjusts availability.',
  purchase_requests: 'Where a request to buy would be written. Live and empty.',
  material_requests: 'Where a site’s request for material would be written. Live and empty.',
  approvals: 'Where an approval decision would be recorded. Live and empty.',
  safekeeping_requests: 'The one table the app writes to. Packing lists stored as a structured document.',
  audit_log: 'The record of who did what. Append-only by design, and empty.',
}

// ---------------------------------------------------------------------------
// 4. DATA FLOW TRACES
// ---------------------------------------------------------------------------
const STEP_LABELS = [
  'User action', 'Frontend component', 'API call', 'Supabase service',
  'Database table', 'Trigger / function', 'Returned data', 'UI update',
]

export const DATA_FLOWS = [
  {
    id: 'signin', title: 'Signing in', status: 'live',
    steps: [
      { label: 'Types email and password, presses Sign In', status: 'live' },
      { label: 'Login.jsx submits to AuthContext.signIn', status: 'live' },
      { label: 'auth.signInWithPassword', status: 'live' },
      { label: 'Auth service verifies and issues a signed token', status: 'live' },
      { label: 'auth.users, then a select from profiles', status: 'live' },
      { label: 'None on read', status: 'live' },
      { label: 'Role, name, department, access level', status: 'live' },
      { label: 'Data reloads with the new session; dashboard renders', status: 'live' },
    ],
  },
  {
    id: 'load', title: 'Loading the dashboard data', status: 'live',
    steps: [
      { label: 'Opens the app, or completes a sign-in', status: 'live' },
      { label: 'main.jsx, before the first render', status: 'live' },
      { label: 'Thirteen parallel reads, paged 1,000 rows at a time', status: 'live' },
      { label: 'Database interface, filtered by row-level security', status: 'live' },
      { label: 'Inventory, ledger, safekeeping, deliveries, projects, six transactional', status: 'live' },
      { label: 'None', status: 'live' },
      { label: 'Rows, mapped to the shapes the app uses', status: 'live' },
      { label: 'Arrays refilled, figures recomputed, React renders once', status: 'live' },
    ],
  },
  {
    id: 'sk-request', title: 'Submitting a safekeeping request', status: 'live',
    note: 'The only complete write. The template for Phase 3.',
    steps: [
      { label: 'Fills the packing list and submits', status: 'live' },
      { label: 'AddSafekeepingRequestModal into SafekeepingContext', status: 'live' },
      { label: 'insert into safekeeping_requests, returning the row', status: 'live' },
      { label: 'Database interface; the insert policy allows any signed-in user', status: 'live' },
      { label: 'safekeeping_requests', status: 'live' },
      { label: 'Column defaults capture the account and email from the token', status: 'live' },
      { label: 'The saved row and its generated id', status: 'live' },
      { label: 'Shown immediately, rolled back if the save was refused', status: 'live' },
    ],
  },
  {
    id: 'item-lookup', title: 'Looking up an item code', status: 'live',
    steps: [
      { label: 'Starts typing in an item field', status: 'live' },
      { label: 'ItemLookup, on first open', status: 'live' },
      { label: 'select from item_master, paged, cached for the session', status: 'live' },
      { label: 'Database interface', status: 'live' },
      { label: 'item_master — 7,378 codes', status: 'live' },
      { label: 'None', status: 'live' },
      { label: 'Code, description, trade, item group, unit', status: 'live' },
      { label: 'Filtered suggestions; falls back to free typing', status: 'live' },
    ],
  },
  {
    id: 'movement', title: 'Recording an incoming delivery', status: 'partial',
    note: 'Everything up to the save exists. The save does not.',
    steps: [
      { label: 'Fills the incoming form and presses Save', status: 'live' },
      { label: 'Movement.jsx', status: 'live' },
      { label: 'No call is made', status: 'planned' },
      { label: 'Not reached', status: 'planned' },
      { label: 'movements — exists, accepts inserts, empty', status: 'planned' },
      { label: 'None. A movement should adjust stock and write an audit entry', status: 'planned' },
      { label: 'Nothing returned', status: 'planned' },
      { label: 'Appears on screen, gone on refresh', status: 'partial' },
    ],
  },
  {
    id: 'approval', title: 'Approving a request', status: 'partial',
    steps: [
      { label: 'Presses Approve', status: 'live' },
      { label: 'Approvals.jsx', status: 'live' },
      { label: 'No call is made', status: 'planned' },
      { label: 'Not reached', status: 'planned' },
      { label: 'approvals — decided_by and decided_at never written', status: 'planned' },
      { label: 'None. An approval should release the hold or post the movement', status: 'planned' },
      { label: 'Nothing returned', status: 'planned' },
      { label: 'Badge changes, reverts on refresh', status: 'partial' },
    ],
  },
]
export { STEP_LABELS }

// ---------------------------------------------------------------------------
// 5. ROLE-BASED ACCESS
// ---------------------------------------------------------------------------
const uiPerms = (roleKey) => ROLES[roleKey]?.can || []
const lockedFor = (roleKey) => NAV.filter((n) => isLocked(n, roleKey)).map((n) => n.label)

// Every non-admin role has identical database rights, so this is written once —
// repeating it per role would imply variation that does not exist.
const DB_NON_ADMIN = {
  view: `Every row of all ${DB.tableCount} tables, including unit prices and total valuation.`,
  create: 'Rows in any of the seven transactional tables.',
  edit: 'Nothing — update is administrator-only.',
  remove: 'Nothing — delete is administrator-only.',
  approve: 'No approval concept exists in the database.',
  exportData: 'Anything they can read, through the database interface directly.',
}

export const ROLE_MATRIX = [
  {
    key: 'admin', label: 'System Administrator', people: 'IT / Systems', status: 'live',
    ui: {
      view: ['Everything'], create: ['Every form'], edit: ['Settings; users on screen'],
      remove: ['Nothing — no delete in the interface'], approve: ['Granted'], exportData: ['Granted; nothing implements it'],
    },
    db: {
      view: 'Every table.', create: 'Every table.', edit: 'Every table, and any profile including its role.',
      remove: 'Every table except the audit log.', approve: 'No approval concept exists.', exportData: 'Everything.',
    },
    gaps: ['Administrator is the only role the database actually recognises.'],
  },
  {
    key: 'procurement', label: 'Procurement Personnel', people: 'Procurement', status: 'live',
    ui: {
      view: ['Inventory and values', 'Low stock', 'Purchase requirements', 'Safekeeping', 'Floor plan', 'Reports'],
      create: ['Purchase requests — not saved', 'Safekeeping requests — saved'],
      edit: ['Nothing'], remove: ['Nothing'], approve: ['Not granted'], exportData: ['Not granted'],
    },
    db: DB_NON_ADMIN,
    gaps: ['Padlocked destinations still render if the address is typed in.', 'The database grants the same rights as every other signed-in role.'],
  },
  {
    key: 'warehouse', label: 'Warehouse Personnel', people: 'Central Warehouse', status: 'live',
    ui: {
      view: ['Inventory', 'Incoming and outgoing', 'Reservations', 'Safekeeping', 'Floor plan'],
      create: ['Movements — not saved', 'Materials — not saved', 'Safekeeping requests — saved'],
      edit: ['Condition and location granted; no screen uses either'], remove: ['Nothing'],
      approve: ['Not granted'], exportData: ['Not granted'],
    },
    db: DB_NON_ADMIN,
    gaps: ['Cannot write inventory: reference data is administrator-only, so receiving would be refused even once the forms save.'],
  },
  {
    key: 'site', label: 'Project Site Personnel', people: 'Project sites', status: 'live',
    ui: {
      view: ['Available stock', 'Own reservations', 'Delivery tracking', 'Floor plan'],
      create: ['Material requests — not saved'], edit: ['Nothing'], remove: ['Nothing'],
      approve: ['Not granted'], exportData: ['Not granted'],
    },
    db: DB_NON_ADMIN,
    gaps: [
      'The largest mismatch in the system: shown "available stock", able to read every price and the whole valuation.',
      '"Own reservations" is a label, not a filter — nothing scopes reservations to their creator.',
    ],
  },
  {
    key: 'management', label: 'Management / Supervisor', people: 'Operations management', status: 'live',
    ui: {
      view: ['Everything operational, plus analytics'], create: ['Nothing of its own'], edit: ['Nothing'],
      remove: ['Nothing'], approve: ['Granted; works on screen only'], exportData: ['Granted; nothing implements it'],
    },
    db: DB_NON_ADMIN,
    gaps: ['Approval decisions are never saved, so there is no record of who approved what.'],
  },
]

export const FUTURE_ROLES = [
  { label: 'Warehouse Supervisor', status: 'recommended', why: 'Once movements save, someone must be able to correct a mis-keyed quantity — and not the person who keyed it.', access: 'Warehouse rights plus adjustments, reversals, and approval under a value threshold.' },
  { label: 'Auditor / read-only', status: 'recommended', why: 'Handing audit an administrator account because no read-only role exists is how audit trails get polluted.', access: 'Read every table including the audit log. No writes anywhere.' },
  { label: 'Project Manager', status: 'recommended', why: 'A site user sees the whole warehouse. A project manager should see their own projects properly and nobody else’s.', access: 'Read and create scoped to assigned projects; approve their own up to a threshold.' },
  { label: 'Finance / Cost Control', status: 'recommended', why: 'Valuation and aging are finance questions being answered on an operations screen.', access: 'Read valuation, aging and turnover. No operational write. Export.' },
  { label: 'Integration service account', status: 'recommended', why: 'When SAP is connected, something must sign in as itself so automated postings stay distinguishable from human ones.', access: 'Insert movements and update stock figures. No interface access.' },
  { label: 'Safekeeping Custodian', status: 'recommended', why: 'Safekeeping holds material the company does not own. It is the one part that already saves, and it has no owner.', access: 'Approve, receive and release requests for assigned projects.' },
]

// ---------------------------------------------------------------------------
// 6. SECURITY
// ---------------------------------------------------------------------------
export const SECURITY_SECTIONS = [
  {
    id: 'authn', title: 'Authentication', status: 'live',
    points: [
      { label: 'Password verification', status: 'live', detail: 'Handled entirely by Supabase Auth. Our code never stores or compares a password.' },
      { label: 'Signed tokens', status: 'live', detail: 'The database reads the user id and email from the token itself, so a client cannot claim to be someone else.' },
      { label: 'Session storage', status: 'live', detail: 'Browser local storage. The standard trade-off for an app with no server of its own.' },
      { label: 'Demo password fallback', status: 'live', detail: 'Dev machines only; compiled out of the published build. This was a real hole and it is closed.' },
      { label: 'Second factor', status: 'recommended', detail: 'None. One leaked password reads the entire valuation.' },
    ],
  },
  {
    id: 'authz', title: 'Authorisation', status: 'partial',
    points: [
      { label: 'Route guard', status: 'live', detail: 'Seventeen of nineteen routes require a session.' },
      { label: 'Role-aware navigation', status: 'live', detail: 'Restricted destinations show a padlock rather than being hidden.' },
      { label: 'Route-level role checks', status: 'partial', detail: 'A padlocked destination still renders if typed in. Presentation, not enforcement.' },
      { label: 'Row-level security on every table', status: 'live', detail: `All ${DB.tableCount} tables have it enabled. Nothing is reachable without a valid token.` },
      { label: 'Policies that tell the roles apart', status: 'partial', detail: 'They do not. All four operational roles hold identical database rights.' },
    ],
  },
  {
    id: 'dbsec', title: 'Database', status: 'live',
    points: [
      { label: 'Role-escalation guard', status: 'live', detail: 'A trigger refuses a role change from anyone who is not already an administrator.' },
      { label: 'Append-only audit log', status: 'live', detail: 'Not even an administrator can rewrite it. The table is empty because nothing writes to it.' },
      { label: 'Administrator check', status: 'live', detail: 'Runs with elevated rights so reading profiles inside a policy does not recurse. Standard and correct.' },
      { label: 'Reference data is administrator-write only', status: 'live', detail: 'Also what will block warehouse receiving the moment the forms start saving.' },
      { label: 'Public key in the bundle', status: 'live', detail: 'By design — it grants nothing on its own. It does mean the database rules are the entire defence.' },
    ],
  },
]

export const VULNERABILITIES = [
  {
    id: 'v-signup', severity: 'high', status: 'recommended',
    title: 'The signup rule grants administrator by email prefix, ignoring the domain',
    detail: 'A trigger reads the text before the @ and assigns a matching role. If self-signup is enabled — the default for a new project — anyone registering as admin@ any domain becomes an administrator here.',
    evidence: [{ file: 'supabase/schema.sql', note: 'handle_new_user(), split_part(email, @, 1)' }],
    verify: 'Supabase dashboard → Authentication → Sign In / Providers: is email signup enabled? This cannot be read from the code.',
    fix: 'Disable public signup, then narrow the mapping to exact company addresses or remove it. Five accounts do not need automation.',
  },
  {
    id: 'v-rls-roles', severity: 'high', status: 'recommended',
    title: 'Every signed-in user can read the entire dataset, including valuation',
    detail: `The read policy on all ${DB.tableCount} tables is "is the caller signed in". A project-site user can read every unit price and the total valuation — and the app already downloads it into their browser.`,
    evidence: [{ file: 'supabase/schema.sql', note: "the policy loop: auth.role() = 'authenticated'" }],
    fix: 'Gate the priced columns on the caller’s role. A view exposing inventory without prices, granted to the operational roles, is the smaller change.',
  },
  {
    id: 'v-audit', severity: 'high', status: 'planned',
    title: 'Nothing is logged, and audit entries could be attributed to anyone',
    detail: 'No action writes an audit entry. The table also takes the user email as plain text with no default from the token, unlike every other table, so an entry could name someone else.',
    evidence: [{ file: 'supabase/schema.sql', note: 'audit_log.user_email has no default' }],
    fix: 'Default the email from the token as the other tables do, and write entries from database triggers rather than the browser.',
  },
  {
    id: 'v-status', severity: 'medium', status: 'recommended',
    title: 'Disabling a user does not disable them',
    detail: 'Sign-in never consults the status column, so an account marked Inactive signs in normally. A control that appears to revoke access and does not is worse than no control.',
    evidence: [{ file: 'src/pages/Users.jsx', note: 'toggle() changes a label' }],
    fix: 'Use the Supabase ban facility for real revocation, and until then remove the control.',
  },
  {
    id: 'v-profiles', severity: 'medium', status: 'recommended',
    title: 'Every signed-in user can read every colleague’s profile',
    detail: 'Any user can list every account’s name, email, department, role and access level. Needed for the user screen, but granted to everyone.',
    evidence: [{ file: 'supabase/schema.sql', note: 'the profiles_read policy' }],
    fix: 'Restrict to the caller’s own row plus administrators.',
  },
  {
    id: 'v-hosting', severity: 'medium', status: 'planned',
    title: 'The site is publicly reachable, and will not pass an SAP security review',
    detail: 'GitHub Pages on a free account serves the site to the whole internet; the sign-in is the only access control. Acceptable for a prototype, not once this touches production SAP data.',
    evidence: [{ file: 'docs/sap-integration-brief.md', note: 'noted as a blocker' }],
    fix: 'Move to a host supporting private access before production data arrives, behind the company identity provider.',
  },
  {
    id: 'v-selfupdate', severity: 'low', status: 'recommended',
    title: 'A user can edit profile fields they should not own',
    detail: 'The role is protected by a trigger; department, access level and status are not. Nothing grants real access from those fields today, which is the only reason this is low.',
    evidence: [{ file: 'supabase/schema.sql', note: 'profiles_self_update, no column restriction' }],
    fix: 'Restrict self-update to display fields.',
  },
  {
    id: 'v-boundary', severity: 'low', status: 'recommended',
    title: 'One error blanks the whole application',
    detail: 'There is no error boundary. An exception while drawing any screen leaves a blank page with no message and no way back but a reload.',
    evidence: [{ file: 'CLAUDE.md', note: 'known blocker #5' }],
    fix: 'One boundary around the routed content, showing the error and a retry.',
  },
  {
    id: 'v-integrity', severity: 'low', status: 'recommended',
    title: 'The database will not defend the stock figures once writing starts',
    detail: 'Quantity columns accept negatives, nothing ties a reservation to available stock, and no rule adjusts stock when a movement is recorded.',
    evidence: [{ file: 'supabase/schema.sql', note: 'no check constraints on quantities' }],
    fix: 'Add the constraints and the stock-adjustment trigger as part of the write path, not after it.',
  },
]

// ---------------------------------------------------------------------------
// 7. DEPENDENCIES
// ---------------------------------------------------------------------------
export const DEP_NOTES = {
  react: { role: 'Interface framework', note: 'Version 18. Current.', status: 'live' },
  'react-dom': { role: 'Browser renderer', note: 'Imported once, at startup.', status: 'live' },
  'react-router-dom': { role: 'Navigation', note: 'Holds the routes, and puts screen state in the address bar.', status: 'live' },
  recharts: { role: 'Charts', note: 'Imported by one file, which wraps it for the whole app — so it could be replaced without touching a page.', status: 'live' },
  '@supabase/supabase-js': { role: 'Database and auth client', note: 'Imported by one file. Everything else goes through it.', status: 'live' },
  vite: { role: 'Build tool', note: 'Used by the config, not by app code.', status: 'live' },
  '@vitejs/plugin-react': { role: 'Build plugin', note: 'Lets the build understand React syntax.', status: 'live' },
}

export const DEP_FINDINGS = [
  { label: 'Nothing unused, duplicated or deprecated', status: 'live', detail: 'Five runtime and two build packages, every one imported by real code — checked against the import graph.' },
  { label: 'No diagram library was added for this module', status: 'live', detail: 'A flowchart library would have roughly doubled the app’s download. These diagrams are drawn directly.' },
  { label: 'No test runner', status: 'recommended', detail: 'The calculation modules are pure functions with hand-verified expected values. Nothing guards them.' },
  { label: 'No continuous integration beyond deploy', status: 'recommended', detail: 'Nothing checks a build before it becomes the live site.' },
  { label: 'No error-handling library', status: 'recommended', detail: 'An error boundary is about thirty lines of React and needs no package.' },
]

// ---------------------------------------------------------------------------
// SUMMARY — counted, never asserted
// ---------------------------------------------------------------------------
function collectStatuses() {
  const tally = { live: 0, partial: 0, planned: 0, recommended: 0 }
  const bump = (s) => { if (tally[s] !== undefined) tally[s]++ }
  JOURNEY.stages.forEach((st) => st.nodes.forEach((n) => bump(n.status)))
  JOURNEY_RECOMMENDATIONS.forEach(() => bump('recommended'))
  PROCESSES.forEach((p) => p.stages.forEach((st) => st.nodes.forEach((n) => bump(n.status))))
  ARCHITECTURE.layers.forEach((l) => { l.groups.forEach((g) => bump(g.status)); l.gaps.forEach((g) => bump(g.status)) })
  DATA_FLOWS.forEach((f) => bump(f.status))
  SECURITY_SECTIONS.forEach((s) => s.points.forEach((p) => bump(p.status)))
  VULNERABILITIES.forEach((v) => bump(v.status))
  FUTURE_ROLES.forEach((r) => bump(r.status))
  DEP_FINDINGS.forEach((d) => bump(d.status))
  return tally
}

export const SUMMARY = {
  tally: collectStatuses(),
  processCount: PROCESSES.length,
  processNodeCount: PROCESSES.reduce((a, p) => a + p.stages.reduce((b, s) => b + s.nodes.length, 0), 0),
  journeyNodeCount: JOURNEY.stages.reduce((a, s) => a + s.nodes.length, 0),
  tableCount: DB.tableCount,
  columnCount: DB.tables.reduce((a, t) => a + t.columns.length, 0),
  policyCount: DB.tables.reduce((a, t) => a + t.policies.length, 0),
  relationshipCount: DB.relationships.length,
  routeCount: CODE.routes.length,
  protectedRouteCount: CODE.routes.filter((r) => r.protected).length,
  fileCount: CODE.fileCount,
  lineCount: CODE.totalLines,
  depCount: CODE.dependencies.length,
  writePathCount: 1,
  emptyTransactionalTables: DB.groups.transactional.length - 1,
  highSeverity: VULNERABILITIES.filter((v) => v.severity === 'high').length,
}

export const SEARCH_INDEX = [
  ...JOURNEY.stages.flatMap((s) => s.nodes.map((n) => ({ id: 'journey:' + n.id, view: 'journey', label: n.label, context: 'Journey · ' + s.title, status: n.status, detail: n.detail }))),
  ...JOURNEY_RECOMMENDATIONS.map((r) => ({ id: 'jrec:' + r.label, view: 'journey', label: r.label, context: 'Journey · proposal at ' + r.at, status: 'recommended', detail: r.detail })),
  ...PROCESSES.flatMap((p) => p.stages.flatMap((s) => s.nodes.map((n) => ({ id: 'process:' + p.id + ':' + n.id, view: 'processes', label: n.label, context: p.title + ' · ' + s.title, status: n.status, detail: n.detail })))),
  ...ARCHITECTURE.layers.flatMap((l) => l.groups.map((g) => ({ id: 'arch:' + l.id + ':' + g.title, view: 'architecture', label: g.title, context: l.title, status: g.status, detail: g.detail }))),
  ...DB.tables.map((t) => ({ id: 'db:' + t.name, view: 'database', label: t.name, context: 'Database · ' + t.group, status: t.group === 'transactional' && t.name !== 'safekeeping_requests' ? 'partial' : 'live', detail: TABLE_NOTES[t.name] || '' })),
  ...DATA_FLOWS.map((f) => ({ id: 'flow:' + f.id, view: 'dataflow', label: f.title, context: 'Data flow', status: f.status, detail: f.note || '' })),
  ...ROLE_MATRIX.map((r) => ({ id: 'role:' + r.key, view: 'access', label: r.label, context: 'Role', status: r.status, detail: r.people })),
  ...FUTURE_ROLES.map((r) => ({ id: 'future:' + r.label, view: 'access', label: r.label, context: 'Proposed role', status: r.status, detail: r.why })),
  ...VULNERABILITIES.map((v) => ({ id: 'vuln:' + v.id, view: 'security', label: v.title, context: 'Security · ' + v.severity, status: v.status, detail: v.detail })),
  ...SECURITY_SECTIONS.flatMap((s) => s.points.map((p) => ({ id: 'sec:' + s.id + ':' + p.label, view: 'security', label: p.label, context: 'Security · ' + s.title, status: p.status, detail: p.detail }))),
  ...CODE.dependencies.map((d) => ({ id: 'dep:' + d.name, view: 'dependencies', label: d.name, context: 'Dependency', status: 'live', detail: DEP_NOTES[d.name]?.role || '' })),
  ...DEP_FINDINGS.map((d) => ({ id: 'depf:' + d.label, view: 'dependencies', label: d.label, context: 'Dependency finding', status: d.status, detail: d.detail })),
]

export { DB, CODE, lockedFor, uiPerms }
