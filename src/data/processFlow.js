// The system model behind the Process Flow module.
//
// WHAT THIS FILE IS
// A single authored description of how the PRC-WH system works, what is finished,
// what is half-built, what is only planned, and what I think should be added. Every
// screen in the Process Flow module reads from here, so there is exactly one place
// to update when the system changes.
//
// THE ONE RULE: every node, step, table claim, permission and finding carries a
// `status`. Nothing in this file is allowed to describe a workflow without saying
// whether that workflow actually runs today. A documentation module that quietly
// mixes "we do this" with "we should do this" is worse than no documentation, because
// it is the kind of wrong that survives a management review.
//
// STATUS DEFINITIONS ARE LOAD-BEARING:
//   live        — it runs in the deployed app right now, and `evidence` names the file
//   partial     — some of it runs; `missing` says exactly what does not
//   planned     — it does not run; it is recorded in a plan, a roadmap or a schema
//   recommended — nobody asked for it; it is my proposal, kept strictly separate
//
// The database and code-graph halves of the model are GENERATED (see
// src/data/generated/) so the table catalogue, the route list, the import graph and
// the dependency audit cannot drift from the source. This file is the part that
// requires judgement — what a process means, and how far along it is.
import { DB } from './generated/dbSchema'
import { CODE } from './generated/codeMap'
import { ROLES, NAV, isLocked } from './roles'

// ---------------------------------------------------------------------------
// STATUS VOCABULARY
// ---------------------------------------------------------------------------
// Colour roles are taken from the existing design tokens rather than new hues:
// green already means "good/available", yellow already means "warning", grey means
// "inert", and orange already carries the Incoming/attention role. Brand red is
// deliberately NOT used for a status — it is reserved for the genuine risk callouts
// in the Security view, so a red mark on this page always means "this is a problem".
export const STATUS = {
  live: {
    key: 'live',
    label: 'Implemented',
    short: 'Live',
    tone: 'ok',
    desc: 'Running in the deployed application today. Every entry names the source file that does the work.',
  },
  partial: {
    key: 'partial',
    label: 'In Development',
    short: 'Partial',
    tone: 'warn',
    desc: 'Part of it runs. Typically the screen exists and the database table exists, but the two are not connected — so nothing is saved.',
  },
  planned: {
    key: 'planned',
    label: 'Planned',
    short: 'Planned',
    tone: 'neutral',
    desc: 'Not built. It appears in a plan, a roadmap note or a schema, and no workflow exists for it yet.',
  },
  recommended: {
    key: 'recommended',
    label: 'Recommendation',
    short: 'Suggested',
    tone: 'orange',
    desc: 'Nobody asked for this. It is a proposal for strengthening the system, kept separate from everything above.',
  },
}
export const STATUS_ORDER = ['live', 'partial', 'planned', 'recommended']
export const STATUS_LIST = STATUS_ORDER.map((k) => STATUS[k])

// Node kinds — what sort of thing a box on a diagram is. Shape and icon come from
// this, so a reader can tell a screen from a database table without reading the label.
export const KIND = {
  entry: { label: 'Entry point', icon: 'doc' },
  ui: { label: 'Screen / component', icon: 'dashboard' },
  logic: { label: 'Application logic', icon: 'settings' },
  api: { label: 'Network call', icon: 'transfer' },
  service: { label: 'Supabase service', icon: 'warehouse' },
  db: { label: 'Database table', icon: 'layers' },
  trigger: { label: 'Database trigger / function', icon: 'audit' },
  policy: { label: 'Security policy', icon: 'lock' },
  external: { label: 'External system', icon: 'truck' },
  decision: { label: 'Decision point', icon: 'filter' },
  gap: { label: 'Missing link', icon: 'alert' },
}

// ---------------------------------------------------------------------------
// 1. BUSINESS PROCESS FLOW — the end-to-end user journey
// ---------------------------------------------------------------------------
// Stage order is the order things actually happen in. Where a stage is honest about
// a break in the chain, the break is its own node with kind 'gap' — drawing the
// arrow straight through would claim a connection that is not there.
export const JOURNEY = {
  id: 'journey',
  title: 'Login to logout — the complete user journey',
  note:
    'Read top to bottom; each box names the file that does the work, and clicking one opens the detail ' +
    'beside it. The amber and grey boxes are where the journey stops short of the database — they cluster ' +
    'in the second half, from the moment somebody tries to record something rather than look something up. ' +
    'The dashed arrows mark a link that does not actually carry anything today.',
  stages: [
    {
      id: 'arrival',
      title: 'Arrival',
      nodes: [
        {
          id: 'browser',
          label: 'Staff opens the site',
          kind: 'entry',
          status: 'live',
          detail:
            'The application is a single-page app served as static files from GitHub Pages at ' +
            'prcdepartment.github.io/prc-wh. There is no application server of our own — the browser ' +
            'downloads the whole app once and then talks directly to Supabase.',
          evidence: [
            { file: '.github/workflows/deploy.yml', note: 'builds and publishes on every push to main' },
            { file: 'vite.config.js', note: "production base path '/prc-wh/'" },
          ],
          next: ['spa-shim'],
        },
        {
          id: 'spa-shim',
          label: 'Deep-link repair',
          kind: 'logic',
          status: 'live',
          detail:
            'GitHub Pages cannot rewrite URLs, so opening a bookmark such as /prc-wh/inventory would ' +
            'normally 404. A 404 page encodes the requested path into a query string and index.html ' +
            'restores it before the router starts, so bookmarks and refreshes work.',
          evidence: [
            { file: 'public/404.html', note: 'encodes the path' },
            { file: 'index.html', note: 'restores it with history.replaceState' },
          ],
          next: ['session-check'],
        },
      ],
    },
    {
      id: 'session',
      title: 'Session check',
      nodes: [
        {
          id: 'session-check',
          label: 'Is there an existing session?',
          kind: 'decision',
          status: 'live',
          detail:
            'On startup the app asks Supabase whether a valid session is already stored in the ' +
            'browser. If it is, the user skips the login screen entirely; the token is refreshed ' +
            'automatically in the background.',
          evidence: [
            { file: 'src/context/AuthContext.jsx', note: 'supabase.auth.getSession() in the mount effect' },
            { file: 'src/lib/supabase.js', note: 'persistSession + autoRefreshToken enabled' },
          ],
          next: ['login-form', 'guard'],
        },
      ],
    },
    {
      id: 'signin',
      title: 'Sign in',
      nodes: [
        {
          id: 'login-form',
          label: 'Login screen',
          kind: 'ui',
          status: 'live',
          detail:
            'Email and password. On the production build there is no credential prefill and no ' +
            'demo quick-sign-in panel — those exist only when a developer runs the app locally.',
          evidence: [{ file: 'src/pages/Login.jsx', note: 'demo panel gated behind import.meta.env.DEV' }],
          next: ['authenticate'],
        },
        {
          id: 'sso',
          label: 'Company single sign-on',
          kind: 'external',
          status: 'recommended',
          detail:
            'Staff currently hold a second password for this system. Supabase supports Azure AD / ' +
            'Microsoft 365 as an identity provider, which would let people sign in with the same ' +
            'account they use for email, and would let IT disable access in one place when someone leaves.',
          evidence: [],
          next: ['authenticate'],
        },
      ],
    },
    {
      id: 'auth',
      title: 'Authentication',
      nodes: [
        {
          id: 'authenticate',
          label: 'Verify credentials',
          kind: 'service',
          status: 'live',
          detail:
            'The password is checked by Supabase Auth, not by our code. Our application never sees a ' +
            'stored password — it receives a signed token (a JWT) that proves who the user is and ' +
            'expires on its own.',
          evidence: [{ file: 'src/context/AuthContext.jsx', note: 'supabase.auth.signInWithPassword' }],
          next: ['role-read'],
        },
        {
          id: 'mfa',
          label: 'Second factor',
          kind: 'service',
          status: 'recommended',
          detail:
            'There is no second factor today. A single leaked password is enough to read the whole ' +
            'inventory valuation. Supabase supports app-based one-time codes without new infrastructure.',
          evidence: [],
          next: ['role-read'],
        },
      ],
    },
    {
      id: 'role',
      title: 'Role verification',
      nodes: [
        {
          id: 'role-read',
          label: 'Read the profile row',
          kind: 'db',
          status: 'live',
          detail:
            "The user's role, name and department come from a profiles table keyed to the Supabase " +
            'account. The role decides which menu items are enabled and which figures are shown.',
          evidence: [
            { file: 'src/context/AuthContext.jsx', note: "select from 'profiles' filtered by the session user id" },
            { file: 'supabase/schema.sql', note: 'public.profiles, role of type wms_role' },
          ],
          next: ['hydrate'],
        },
        {
          id: 'role-guard',
          label: 'Role-change guard',
          kind: 'trigger',
          status: 'live',
          detail:
            'A database trigger blocks a user from promoting themselves. Without it, "a user may edit ' +
            'their own profile" would be enough to become an administrator, because a security policy ' +
            'cannot see which column an update changed.',
          evidence: [{ file: 'supabase/schema.sql', note: 'guard_role_change() on before update of profiles' }],
          next: ['hydrate'],
        },
      ],
    },
    {
      id: 'load',
      title: 'Data loading',
      nodes: [
        {
          id: 'hydrate',
          label: 'Load the warehouse dataset',
          kind: 'api',
          status: 'live',
          detail:
            'Thirteen tables are fetched in parallel and written into the in-memory data modules ' +
            'before the first screen draws, which is why no page in the app has a loading spinner. ' +
            'The dataset is small enough (~1,600 rows) that this is cheaper than making every page ' +
            'wait on its own query.',
          evidence: [
            { file: 'src/lib/hydrate.js', note: 'thirteen fetchAll() calls, paged past the 1,000-row API cap' },
            { file: 'src/main.jsx', note: 'hydrate() resolves before ReactDOM.render' },
          ],
          next: ['guard'],
        },
        {
          id: 'hydrate-scope',
          label: 'Fetch only what the role needs',
          kind: 'api',
          status: 'recommended',
          detail:
            'Today every signed-in user downloads every row of every table, including unit prices and ' +
            'total valuation. A project-site user has no business reason to hold the whole company ' +
            'valuation in their browser. Narrowing the load per role is both a privacy and a ' +
            'performance improvement.',
          evidence: [],
          next: ['guard'],
        },
      ],
    },
    {
      id: 'guarding',
      title: 'Route protection',
      nodes: [
        {
          id: 'guard',
          label: 'Protected route check',
          kind: 'logic',
          status: 'live',
          detail:
            'Every route except the login page is wrapped in a guard that sends an unauthenticated ' +
            'visitor back to /login. Seventeen of the nineteen routes are protected; the other two are ' +
            'the login page and a catch-all redirect.',
          evidence: [{ file: 'src/App.jsx', note: '<Protected> wrapper around every application route' }],
          next: ['shell'],
        },
      ],
    },
    {
      id: 'shell',
      title: 'Application shell',
      nodes: [
        {
          id: 'shell',
          label: 'Layout, navigation, account menu',
          kind: 'ui',
          status: 'live',
          detail:
            'The persistent frame: the sidebar, the page title in the top bar, the theme switch and ' +
            'the account menu holding notifications, the guided tour and sign-out.',
          evidence: [{ file: 'src/components/Layout.jsx', note: 'shell, navigation and account menu' }],
          next: ['modules'],
        },
      ],
    },
    {
      id: 'modules',
      title: 'Module access',
      nodes: [
        {
          id: 'modules',
          label: 'Open a module',
          kind: 'ui',
          status: 'live',
          detail:
            'The sidebar shows the same destinations to everyone; entries a role may not use are ' +
            'shown with a padlock rather than hidden, so the shape of the system stays legible. ' +
            'Pages are code-split, so opening one downloads only that page.',
          evidence: [
            { file: 'src/data/roles.js', note: 'NAV plus lockedFor, and isLocked()' },
            { file: 'src/App.jsx', note: 'React.lazy on fifteen of the seventeen pages' },
          ],
          next: ['read-action', 'write-action'],
        },
      ],
    },
    {
      id: 'actions',
      title: 'User action',
      nodes: [
        {
          id: 'read-action',
          label: 'Look something up',
          kind: 'ui',
          status: 'live',
          detail:
            'Everything that only READS works end to end: dashboards, the inventory masterlist, ' +
            'material profiles, the floor plan, low-stock alerts, the delivery tracker, reports and ' +
            'analytics. All of it is computed from the Postgres data loaded at startup.',
          evidence: [
            { file: 'src/data/insights.js', note: 'every KPI, ranking and chart series' },
            { file: 'src/pages/dashboard/InventoryTab.jsx', note: 'the Warehouse dashboard' },
          ],
          next: ['report'],
        },
        {
          id: 'write-action',
          label: 'Record something',
          kind: 'ui',
          status: 'partial',
          detail:
            'The forms exist and validate. Only one of them saves. Add Material shows a success screen ' +
            'and discards the entry; the movement, material-request, purchase-request, approval and ' +
            'user forms all change the screen in front of you and lose everything on refresh.',
          missing:
            'A save call for every form except the safekeeping request. The database tables are already ' +
            'there and already accept inserts — nothing writes to them.',
          evidence: [
            { file: 'src/components/AddMaterialModal.jsx', note: 'submit() sets a success flag; there is no insert' },
            { file: 'src/pages/Movement.jsx', note: 'form submits into local state only' },
            { file: 'src/pages/Users.jsx', note: 'add() appends to a useState array' },
          ],
          next: ['sk-write', 'no-write'],
        },
      ],
    },
    {
      id: 'persist',
      title: 'Database transaction',
      nodes: [
        {
          id: 'sk-write',
          label: 'Safekeeping request saved',
          kind: 'db',
          status: 'live',
          detail:
            'The one complete write path in the application. A safekeeping request is inserted into ' +
            'its table immediately, the form closes optimistically, and the row is rolled back out of ' +
            'the screen if the insert is refused — so the interface never claims a save that failed.',
          evidence: [
            { file: 'src/context/SafekeepingContext.jsx', note: 'insert into safekeeping_requests with rollback' },
            { file: 'supabase/schema.sql', note: 'public.safekeeping_requests, jsonb payload column' },
          ],
          next: ['notify'],
        },
        {
          id: 'no-write',
          label: 'Nothing is saved',
          kind: 'gap',
          status: 'partial',
          detail:
            'Six transactional tables are live, empty, and already accept inserts from any signed-in ' +
            'user: movements, reservations, purchase requests, material requests, approvals and the ' +
            'audit log. No code inserts into any of them. This is the single largest gap in the system ' +
            'and the whole of Phase 3.',
          missing: 'Insert calls, and a rule for what a successful save does to the stock figures.',
          evidence: [
            { file: 'CLAUDE.md', note: 'known blocker #6 — "Writes still go nowhere"' },
            { file: 'src/data/transactions.js', note: 'the six arrays are filled from Postgres and are empty' },
          ],
          next: ['notify'],
        },
      ],
    },
    {
      id: 'notify',
      title: 'Notifications',
      nodes: [
        {
          id: 'notify',
          label: 'Notification list',
          kind: 'ui',
          status: 'partial',
          detail:
            'The account menu shows four notifications with an unread dot. Three of the four counts ' +
            'are real — they are computed from the loaded data (materials below minimum, pending ' +
            'approvals, active reservations). The fourth is a fixed line of text. Nothing is ' +
            'delivered, nothing can be marked read, and nothing arrives while you are looking at it.',
          missing:
            'A notifications table, a rule for what raises one, a read/unread state per user, and ' +
            'delivery while the page is open.',
          evidence: [
            { file: 'src/components/Layout.jsx', note: 'the notifications array, built from counts' },
            { file: 'src/data/transactions.js', note: 'rebuildCounts() — lowStock, reservations, approvals' },
          ],
          next: ['approve'],
        },
      ],
    },
    {
      id: 'approve',
      title: 'Approvals',
      nodes: [
        {
          id: 'approve',
          label: 'Approve or reject',
          kind: 'ui',
          status: 'partial',
          detail:
            'The approvals screen lists pending items and the Approve and Reject buttons work — on ' +
            'screen. The decision is held in the page and is gone on refresh. The approvals table has ' +
            'columns for who decided and when; neither is ever written.',
          missing:
            'An update call, and the consequence of a decision — an approved movement should change ' +
            'the stock, an approved request should become a reservation.',
          evidence: [
            { file: 'src/pages/Approvals.jsx', note: "act() maps over local state setting r.state" },
            { file: 'supabase/schema.sql', note: 'approvals.decided_by and decided_at, never populated' },
          ],
          next: ['report'],
        },
      ],
    },
    {
      id: 'reporting',
      title: 'Reporting',
      nodes: [
        {
          id: 'report',
          label: 'Dashboards, reports, analytics',
          kind: 'ui',
          status: 'live',
          detail:
            'Every figure on the dashboards, the reports page and the analytics page is derived from ' +
            'the Postgres data. There are no invented numbers left in the application: stock turnover ' +
            'is computed from the ledger, and where the data cannot support a figure the card says so ' +
            'instead of showing a confident zero.',
          evidence: [
            { file: 'src/data/insights.js', note: 'KPIS(), analytics(), agingAnalysis(), ledgerActivity()' },
            { file: 'src/pages/Analytics.jsx', note: 'every tile derived; warehouse utilisation removed as uncomputable' },
          ],
          next: ['export'],
        },
      ],
    },
    {
      id: 'exporting',
      title: 'Export',
      nodes: [
        {
          id: 'export',
          label: 'Export to Excel or PDF',
          kind: 'logic',
          status: 'planned',
          detail:
            'Two roles are granted an export permission in the role definitions, and nothing in the ' +
            'application implements one. There is no download button anywhere in the app.',
          evidence: [
            { file: 'src/data/roles.js', note: "the 'export' permission on admin and management" },
          ],
          next: ['audit'],
        },
      ],
    },
    {
      id: 'auditing',
      title: 'Audit trail',
      nodes: [
        {
          id: 'audit',
          label: 'Record who did what',
          kind: 'db',
          status: 'planned',
          detail:
            'The audit log table exists and is deliberately append-only — even an administrator ' +
            'cannot edit or delete a row, because an audit trail you can rewrite is not an audit ' +
            'trail. Nothing writes to it, so the screen is empty and no action in the system leaves a ' +
            'trace.',
          evidence: [
            { file: 'supabase/schema.sql', note: 'the audit_log_admin policy is dropped, leaving read + insert only' },
            { file: 'src/pages/AuditLogs.jsx', note: 'reads the table; renders empty' },
          ],
          next: ['signout'],
        },
      ],
    },
    {
      id: 'exit',
      title: 'Sign out',
      nodes: [
        {
          id: 'signout',
          label: 'Sign out',
          kind: 'service',
          status: 'live',
          detail:
            'Ends the Supabase session, clears the locally stored session and returns the user to the ' +
            'login screen. The loaded dataset lives in memory only, so closing the tab discards it.',
          evidence: [{ file: 'src/context/AuthContext.jsx', note: 'signOut(): auth.signOut + clear local storage' }],
          next: [],
        },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// 2. FUNCTIONAL PROCESS MAPPING
// ---------------------------------------------------------------------------
// One flow per business domain. These are the answer to "what can this system
// actually do", and they are where the honest statuses matter most: a warehouse
// supervisor reading this needs to know that Receiving does not yet save.
export const PROCESSES = [
  {
    id: 'authentication',
    title: 'Authentication',
    icon: 'lock',
    summary:
      'Complete. Sign-in, session handling and sign-out all work against Supabase Auth, and roles ' +
      'come from the database rather than the browser.',
    stages: [
      {
        id: 'a1',
        title: 'Sign in',
        nodes: [
          {
            id: 'a-form', label: 'Credential entry', kind: 'ui', status: 'live',
            detail: 'Email and password on the login screen. Production builds carry no demo credentials.',
            evidence: [{ file: 'src/pages/Login.jsx', note: 'the sign-in form' }],
          },
          {
            id: 'a-demo', label: 'Developer demo sign-in', kind: 'logic', status: 'live',
            detail:
              'A fixed demo password unlocks five sample accounts — but only when the app is run from a ' +
              'developer machine. The check is compiled out of the published build, so the live site ' +
              'accepts real Supabase accounts only. This was a genuine production hole and is now closed.',
            evidence: [{ file: 'src/context/AuthContext.jsx', note: 'the demo branch is wrapped in import.meta.env.DEV' }],
          },
        ],
      },
      {
        id: 'a2',
        title: 'Session creation',
        nodes: [
          {
            id: 'a-jwt', label: 'Signed token issued', kind: 'service', status: 'live',
            detail:
              'Supabase Auth returns a short-lived signed token plus a refresh token. Every later ' +
              'database request carries the signed token, which is how the database knows who is asking.',
            evidence: [{ file: 'src/lib/supabase.js', note: 'createClient with persistSession' }],
          },
          {
            id: 'a-store', label: 'Stored in the browser', kind: 'logic', status: 'live',
            detail:
              'The Supabase client keeps the session in browser local storage so a refresh does not sign ' +
              'you out. This is the standard trade-off for an app with no server of its own: convenient, ' +
              'and readable by any script that manages to run on the page.',
            evidence: [{ file: 'src/lib/supabase.js', note: 'persistSession: true' }],
          },
        ],
      },
      {
        id: 'a3',
        title: 'Session validation',
        nodes: [
          {
            id: 'a-valid', label: 'Checked on every startup', kind: 'logic', status: 'live',
            detail: 'getSession() on mount, plus a subscription that reacts to sign-in and sign-out anywhere in the app.',
            evidence: [{ file: 'src/context/AuthContext.jsx', note: 'getSession + onAuthStateChange' }],
          },
          {
            id: 'a-refresh', label: 'Token refresh', kind: 'service', status: 'live',
            detail: 'Handled by the Supabase client automatically; the app has no refresh code of its own.',
            evidence: [{ file: 'src/lib/supabase.js', note: 'autoRefreshToken: true' }],
          },
        ],
      },
      {
        id: 'a4',
        title: 'Role determination',
        nodes: [
          {
            id: 'a-role', label: 'Profile lookup', kind: 'db', status: 'live',
            detail: 'One row from profiles, by account id, giving role, name, department and access level.',
            evidence: [{ file: 'src/context/AuthContext.jsx', note: 'loadProfile()' }],
          },
          {
            id: 'a-provision', label: 'Profile auto-created on signup', kind: 'trigger', status: 'live',
            detail:
              'A database trigger creates the profile row the moment an account is created, and guesses ' +
              'the role from the part of the email before the @. That guess is a security problem — see ' +
              'the Security view.',
            evidence: [{ file: 'supabase/schema.sql', note: 'handle_new_user() on after insert of auth.users' }],
          },
        ],
      },
      {
        id: 'a5',
        title: 'Route protection',
        nodes: [
          {
            id: 'a-guard', label: 'Unauthenticated visitors redirected', kind: 'logic', status: 'live',
            detail: 'Seventeen of nineteen routes require a session. Reaching one without a session redirects to /login.',
            evidence: [{ file: 'src/App.jsx', note: 'the Protected component' }],
          },
          {
            id: 'a-roleguard', label: 'Per-role route restriction', kind: 'logic', status: 'partial',
            detail:
              'Restricted destinations are shown with a padlock and are not clickable — but the route ' +
              'itself is not role-checked. Typing /users into the address bar as a warehouse user still ' +
              'renders the page. It reads nothing confidential the user could not already read, but the ' +
              'restriction is decoration rather than enforcement.',
            missing: 'A role check inside the route guard, and matching database policies behind it.',
            evidence: [
              { file: 'src/data/roles.js', note: 'lockedFor is used by the sidebar only' },
              { file: 'src/App.jsx', note: 'Protected checks for a user, never for a role' },
            ],
          },
        ],
      },
      {
        id: 'a6',
        title: 'Logout',
        nodes: [
          {
            id: 'a-out', label: 'Session ended and cleared', kind: 'service', status: 'live',
            detail: 'Supabase sign-out, local storage cleared, user state emptied, redirect to login.',
            evidence: [{ file: 'src/context/AuthContext.jsx', note: 'signOut()' }],
          },
        ],
      },
    ],
  },

  {
    id: 'inventory',
    title: 'Inventory management',
    icon: 'inventory',
    summary:
      'Reading inventory is complete and accurate. Changing inventory is not built: no form in the ' +
      'application alters a stock figure, so the numbers move only when the source workbooks are ' +
      're-seeded into the database.',
    stages: [
      {
        id: 'i1',
        title: 'Create',
        nodes: [
          {
            id: 'i-add', label: 'Add Material form', kind: 'ui', status: 'partial',
            detail:
              'A full form with item-code validation against the 7,378-row company catalogue, trade and ' +
              'item-group selection, unit of measure and price. It ends on a confirmation screen and ' +
              'saves nothing.',
            missing: 'An insert into inventory, and an audit entry recording who added the line.',
            evidence: [{ file: 'src/components/AddMaterialModal.jsx', note: 'submit() sets saved=true' }],
          },
          {
            id: 'i-lookup', label: 'Item catalogue lookup', kind: 'api', status: 'live',
            detail:
              'The item master is fetched from the database the first time a lookup opens rather than ' +
              'shipped in the app, and degrades to free typing if the fetch fails.',
            evidence: [{ file: 'src/components/ItemLookup.jsx', note: "fetchAll('item_master') on first use" }],
          },
        ],
      },
      {
        id: 'i2',
        title: 'Update',
        nodes: [
          {
            id: 'i-edit', label: 'Edit a material line', kind: 'ui', status: 'planned',
            detail:
              'There is no edit screen. Corrections to a description, a minimum level or a price have to ' +
              'be made in the database directly.',
            evidence: [],
          },
          {
            id: 'i-cond', label: 'Condition / grade update', kind: 'ui', status: 'planned',
            detail:
              'Warehouse staff hold an updateCondition permission in the role definitions and there is ' +
              'no screen that exercises it. Condition classes are read from the seeded data.',
            evidence: [{ file: 'src/data/roles.js', note: "warehouse.can includes 'updateCondition'" }],
          },
        ],
      },
      {
        id: 'i3',
        title: 'Reserve',
        nodes: [
          {
            id: 'i-res', label: 'Reservations register', kind: 'ui', status: 'partial',
            detail:
              'The screen reads the reservations table and can release a reservation on screen. The ' +
              'table is empty because nothing creates a reservation, and Release changes local state only.',
            missing: 'Create and release calls, plus the effect on available stock.',
            evidence: [{ file: 'src/pages/Reservations.jsx', note: 'release() maps over local state' }],
          },
          {
            id: 'i-res-effect', label: 'Reserved stock reduces availability', kind: 'trigger', status: 'planned',
            detail:
              'A reservation ought to move quantity out of available and into reserved. Nothing does ' +
              'this today — the two columns are independent figures loaded from the source sheet, and ' +
              'the database has no rule tying them together.',
            evidence: [{ file: 'supabase/schema.sql', note: 'reservations has no trigger against inventory' }],
          },
        ],
      },
      {
        id: 'i4',
        title: 'Issue, return, transfer, adjust',
        nodes: [
          {
            id: 'i-issue', label: 'Issuance', kind: 'ui', status: 'planned',
            detail: 'Listed in the New Transaction menu and deliberately disabled, so the eventual shape of the module is visible now.',
            evidence: [{ file: 'src/components/NewTransactionMenu.jsx', note: "the 'issuance' entry has no form" }],
          },
          {
            id: 'i-return', label: 'Return from site', kind: 'ui', status: 'planned',
            detail: 'Same — present in the menu, disabled.',
            evidence: [{ file: 'src/components/NewTransactionMenu.jsx', note: "the 'return' entry" }],
          },
          {
            id: 'i-transfer', label: 'Transfer — borrowing and reorganisation', kind: 'ui', status: 'planned',
            detail:
              'Two sub-types are named: lending stock to a site temporarily, and relocating stock inside ' +
              'the warehouse. Both are disabled.',
            evidence: [{ file: 'src/components/NewTransactionMenu.jsx', note: "'borrowing' and 'reorganization'" }],
          },
          {
            id: 'i-adjust', label: 'Adjustment', kind: 'db', status: 'planned',
            detail:
              'The movements table already accepts a type of Adjustment, so the database is ready for ' +
              'stock corrections. No screen creates one.',
            evidence: [{ file: 'supabase/schema.sql', note: "movements.type check includes 'Adjustment'" }],
          },
        ],
      },
      {
        id: 'i5',
        title: 'History',
        nodes: [
          {
            id: 'i-hist', label: 'Movement history per material', kind: 'ui', status: 'live',
            detail:
              'A material profile shows its real recorded movements from the incoming and outgoing ' +
              'ledger — 184 rows of genuine warehouse activity from the source workbooks.',
            evidence: [
              { file: 'src/pages/MaterialProfile.jsx', note: 'reads the ledger for the item code' },
              { file: 'src/data/ledger.js', note: 'LEDGER, filled from Postgres' },
            ],
          },
          {
            id: 'i-hist-new', label: 'History of actions taken in this app', kind: 'db', status: 'partial',
            detail:
              'The ledger is imported history. Movements created through the application would land in ' +
              'a separate table, which is empty — so there is no record of anything anyone has done ' +
              'inside the system.',
            missing: 'The write path, and a decision on whether new movements join the ledger view or stay separate.',
            evidence: [{ file: 'src/data/transactions.js', note: 'movements[] is filled from Postgres and empty' }],
          },
        ],
      },
    ],
  },

  {
    id: 'warehouse',
    title: 'Warehouse operations',
    icon: 'warehouse',
    summary:
      'Safekeeping is the one operation that works end to end. Receiving, issuance and transfers are ' +
      'screens without a save. Physical location is modelled rather than recorded.',
    stages: [
      {
        id: 'w1',
        title: 'Receiving',
        nodes: [
          {
            id: 'w-recv', label: 'Incoming material form', kind: 'ui', status: 'partial',
            detail:
              'The incoming and outgoing entry screens exist, with quantity, project, document ' +
              'reference and a file-drop area for the delivery paperwork. The file drop is labelled a ' +
              'prototype and accepts nothing; the form saves nothing.',
            missing: 'An insert into movements, document storage, and the effect on stock on hand.',
            evidence: [{ file: 'src/pages/Movement.jsx', note: 'the incoming/outgoing form and its prototype drop zone' }],
          },
          {
            id: 'w-recv-sk', label: 'Safekeeping receipt', kind: 'ui', status: 'live',
            detail:
              'Project-owned material delivered in for storage is recorded through the safekeeping ' +
              'request form, and that one does save.',
            evidence: [{ file: 'src/components/AddSafekeepingRequestModal.jsx', note: 'the request form' }],
          },
        ],
      },
      {
        id: 'w2',
        title: 'Issuance and transfer',
        nodes: [
          {
            id: 'w-issue', label: 'Issue against a request', kind: 'ui', status: 'planned',
            detail: 'No screen. The intended chain is request, approval, reservation, issuance, and only the request and approval screens exist.',
            evidence: [],
          },
          {
            id: 'w-move', label: 'Internal relocation', kind: 'ui', status: 'planned',
            detail:
              'Relocating a pallet is listed as a transaction type and disabled. It also has nowhere to ' +
              'write to: inventory carries zone, rack, shelf and bin columns that are empty.',
            evidence: [{ file: 'supabase/schema.sql', note: 'inventory.zone / rack / shelf / bin, unpopulated' }],
          },
        ],
      },
      {
        id: 'w3',
        title: 'Safekeeping',
        nodes: [
          {
            id: 'w-sk-req', label: 'Request submitted', kind: 'ui', status: 'live',
            detail: 'A multi-line request with packing lists, submitted from the New Transaction menu.',
            evidence: [{ file: 'src/components/AddSafekeepingRequestModal.jsx', note: 'the form' }],
          },
          {
            id: 'w-sk-save', label: 'Saved to the database', kind: 'db', status: 'live',
            detail:
              'Inserted into safekeeping_requests. The deep, variable shape of a packing list is stored ' +
              'as a single structured document, with the handful of fields the app sorts and filters on ' +
              'promoted to real columns.',
            evidence: [{ file: 'src/context/SafekeepingContext.jsx', note: 'the insert, with optimistic rollback' }],
          },
          {
            id: 'w-sk-approve', label: 'Request reviewed and accepted', kind: 'ui', status: 'planned',
            detail:
              'A submitted request stays at Submitted forever. There is no review step, so a request ' +
              'never becomes a stock movement and the safekeeping stock-on-hand figures never change.',
            evidence: [{ file: 'supabase/schema.sql', note: "safekeeping_requests.status defaults to 'Submitted'" }],
          },
        ],
      },
      {
        id: 'w4',
        title: 'Stock on hand',
        nodes: [
          {
            id: 'w-soh', label: 'Stock figures', kind: 'db', status: 'live',
            detail:
              'The 779 warehouse lines and 132 safekeeping lines are real, current and read from ' +
              'Postgres. Every KPI, chart and ranking in the app is computed from them.',
            evidence: [{ file: 'src/lib/hydrate.js', note: 'inventory and safekeeping_soh loaded at startup' }],
          },
          {
            id: 'w-soh-update', label: 'Figures change when stock moves', kind: 'trigger', status: 'planned',
            detail:
              'Stock on hand is a snapshot imported from the source workbooks. Nothing recalculates it, ' +
              'because nothing records a movement. Until the write path exists, the figures are only as ' +
              'current as the last re-seed.',
            evidence: [{ file: 'CLAUDE.md', note: 'npm run seed regenerates the dataset from the source modules' }],
          },
        ],
      },
      {
        id: 'w5',
        title: 'Location',
        nodes: [
          {
            id: 'w-loc', label: 'Floor plan and racking', kind: 'ui', status: 'live',
            detail:
              'Three levels drawn from the real CW Taytay warehouse plan: the site, the shed with its ' +
              'eleven rack runs and eight rooms, and the rack elevations. The geometry and the ' +
              'capacities come from the engineering drawing.',
            evidence: [
              { file: 'src/data/warehouseMap.js', note: 'raw drawing coordinates and the conversion' },
              { file: 'src/pages/StorageMap.jsx', note: 'the three levels' },
            ],
          },
          {
            id: 'w-loc-real', label: 'Where a specific pallet actually is', kind: 'gap', status: 'partial',
            detail:
              'The stock sheet records no physical location, so the floor plan places each line by rule: ' +
              'item group first where the plan puts that group outdoors, then value for the locked room, ' +
              'then trade. Which bay a line sits in is a MODEL, not a record, and every screen showing a ' +
              'bay says so.',
            missing: 'A recorded location column on inventory, which would turn the placement rule into a lookup.',
            evidence: [{ file: 'src/data/warehouseMap.js', note: 'placement() — the documented rule' }],
          },
        ],
      },
      {
        id: 'w6',
        title: 'Transaction logging',
        nodes: [
          {
            id: 'w-log', label: 'Every action recorded', kind: 'db', status: 'planned',
            detail:
              'Nothing is logged. The audit table is append-only and empty; the transactional tables ' +
              'carry the columns for who created a row and when, and no rows exist to carry them.',
            evidence: [{ file: 'supabase/schema.sql', note: 'created_by and created_by_email default from the session' }],
          },
        ],
      },
    ],
  },

  {
    id: 'procurement',
    title: 'Procurement operations',
    icon: 'request',
    summary:
      'Demand signals are real and useful — low stock, aging, non-moving value all come from live ' +
      'data. Everything downstream of the signal, from raising a request to receiving against a ' +
      'purchase order, is either unsaved or unbuilt.',
    stages: [
      {
        id: 'p1',
        title: 'Demand signal',
        nodes: [
          {
            id: 'p-low', label: 'Low stock alerts', kind: 'ui', status: 'live',
            detail:
              'Materials at or below their minimum level, ranked, with the shortfall and its value. ' +
              'Computed from the live data and surfaced as a sidebar badge count.',
            evidence: [
              { file: 'src/pages/LowStock.jsx', note: 'the alert list' },
              { file: 'src/data/insights.js', note: 'lowStock()' },
            ],
          },
          {
            id: 'p-aging', label: 'Aging and non-moving stock', kind: 'ui', status: 'live',
            detail:
              'Six aging bands from the recorded last-movement date, and a non-moving value figure ' +
              'based on issue frequency rather than on overstock, so the label matches the measure.',
            evidence: [{ file: 'src/data/insights.js', note: 'agingAnalysis()' }],
          },
        ],
      },
      {
        id: 'p2',
        title: 'Material request',
        nodes: [
          {
            id: 'p-mr', label: 'Site raises a material request', kind: 'ui', status: 'partial',
            detail:
              'A form with item, quantity, project, purpose and required date. It submits into the page ' +
              'and is lost on refresh. The material_requests table is ready and empty.',
            missing: 'An insert, and routing the request to whoever approves it.',
            evidence: [{ file: 'src/pages/RequestMaterials.jsx', note: 'submit() into local state' }],
          },
          {
            id: 'p-mr-projects', label: 'Project list on the request form', kind: 'gap', status: 'partial',
            detail:
              'The request form offers five project names written into the file, while the database has ' +
              'a projects table that the rest of the app reads. The form should read the table.',
            missing: 'Replace the hard-coded list with the projects data already loaded at startup.',
            evidence: [{ file: 'src/pages/RequestMaterials.jsx', note: 'a local PROJECTS array of five strings' }],
          },
        ],
      },
      {
        id: 'p3',
        title: 'Purchase requirement',
        nodes: [
          {
            id: 'p-pr', label: 'Purchase requirements register', kind: 'ui', status: 'partial',
            detail:
              'A read-only register with estimated cost totals. It reads the purchase_requests table, ' +
              'which is empty, and offers no way to raise one.',
            missing: 'A creation form and an insert.',
            evidence: [{ file: 'src/pages/PurchaseRequests.jsx', note: 'reads seed, renders a table' }],
          },
          {
            id: 'p-po', label: 'Purchase order', kind: 'external', status: 'planned',
            detail:
              'There is no purchase-order concept in this system at all — no table, no screen. Purchase ' +
              'orders live in SAP Business One, which is the system of record for buying.',
            evidence: [{ file: 'docs/sap-integration-brief.md', note: 'the integration plan' }],
          },
        ],
      },
      {
        id: 'p4',
        title: 'Receiving against a purchase order',
        nodes: [
          {
            id: 'p-recv', label: 'Match a delivery to its order', kind: 'external', status: 'planned',
            detail:
              'Not built and not possible without the SAP link: this system has no purchase order to ' +
              'match against. Today a delivery is recorded on a spreadsheet-derived tracker.',
            evidence: [{ file: 'src/components/DeliveryTracker.jsx', note: 'the tracker, read from the source sheet' }],
          },
          {
            id: 'p-track', label: 'Delivery tracker', kind: 'ui', status: 'live',
            detail:
              'Twenty-seven scheduled deliveries with target weeks, tower locations, down-payment status ' +
              'and remarks, read from the warehouse schedule sheet. Item codes are resolved against the ' +
              'item master at run time, because the source sheet carries no codes.',
            evidence: [{ file: 'src/data/deliveryTracker.js', note: 'rebuildDeliveryRows()' }],
          },
        ],
      },
      {
        id: 'p5',
        title: 'Inventory synchronisation',
        nodes: [
          {
            id: 'p-sap', label: 'Two-way sync with SAP Business One', kind: 'external', status: 'planned',
            detail:
              'The company runs SAP Business One 10, which already exposes a REST interface covering ' +
              'every object this system needs — items, stock per warehouse, goods receipts and issues, ' +
              'transfers, purchase requests. Nothing has to be built on the SAP side. Three decisions ' +
              'are still open: whether bin-location management is switched on, what damaged stock maps ' +
              'to, and whether a reservation becomes a transfer request in SAP or stays a hold in this app.',
            evidence: [{ file: 'docs/sap-integration-brief.md', note: 'the full brief, including the object mapping' }],
          },
          {
            id: 'p-seed', label: 'Manual re-seed from the source workbooks', kind: 'logic', status: 'live',
            detail:
              'How the data gets current today: a script regenerates SQL from the master modules held ' +
              'outside the repository, and the parts are pasted into the Supabase SQL editor in order. ' +
              'It works, and it is a person doing it by hand.',
            evidence: [{ file: 'scripts/generate-seeds.mjs', note: 'npm run seed' }],
          },
        ],
      },
    ],
  },

  {
    id: 'reporting',
    title: 'Reporting and analytics',
    icon: 'reports',
    summary:
      'The strongest part of the system. Every figure is derived from the database, and where the ' +
      'data cannot support a figure the card says so rather than showing a plausible number. Only ' +
      'export is missing.',
    stages: [
      {
        id: 'r1',
        title: 'Dashboard data',
        nodes: [
          {
            id: 'r-hydrate', label: 'One load at startup', kind: 'api', status: 'live',
            detail: 'Thirteen tables fetched once, before the first paint, then held in memory for every page.',
            evidence: [{ file: 'src/lib/hydrate.js', note: 'the loader' }],
          },
          {
            id: 'r-derive', label: 'Derived view models', kind: 'logic', status: 'live',
            detail:
              'Each data module recomputes its derived exports after a load. This is why arrays in the ' +
              'data folder must be refilled and never replaced — a page holding a reference to a ' +
              'replaced array would silently show nothing.',
            evidence: [{ file: 'src/data/insights.js', note: 'rebuildItems() and the rebuild* family' }],
          },
        ],
      },
      {
        id: 'r2',
        title: 'KPI computation',
        nodes: [
          {
            id: 'r-kpi', label: 'Quantity and value KPIs', kind: 'logic', status: 'live',
            detail:
              'Total inventory, stock on hand, reserved, incoming, outgoing and damaged, each in units ' +
              'and in pesos, so that total equals available plus reserved in both.',
            evidence: [{ file: 'src/data/insights.js', note: 'KPIS()' }],
          },
          {
            id: 'r-turn', label: 'Stock turnover and value trend', kind: 'logic', status: 'live',
            detail:
              'Turnover is cost issued over the ledger window divided by average valuation, annualised. ' +
              'The value trend is anchored to the newest recorded ledger day rather than to today, ' +
              'because anchoring to today would compare the current value against itself whenever the ' +
              'sheets lag and report a confident zero percent.',
            evidence: [{ file: 'src/data/insights.js', note: 'analytics(), valueAt(), avgCostByCode()' }],
          },
          {
            id: 'r-cap', label: 'Warehouse capacity', kind: 'logic', status: 'live',
            detail:
              'Floor-space occupancy computed off the same racking numbers the floor plan reports, so ' +
              'the two can never disagree. Note this is a measure of SPACE, not of stock.',
            evidence: [{ file: 'src/data/warehouseMap.js', note: 'facilityCapacity() reduces over areaCapacity()' }],
          },
        ],
      },
      {
        id: 'r3',
        title: 'Reports and analytics',
        nodes: [
          {
            id: 'r-rep', label: 'Reports page', kind: 'ui', status: 'live',
            detail: 'Trade and item-group breakdowns, high-value lines and non-moving lines.',
            evidence: [{ file: 'src/pages/Reports.jsx', note: 'the report set' }],
          },
          {
            id: 'r-an', label: 'Analytics page', kind: 'ui', status: 'live',
            detail:
              'Turnover, inventory value trend, stock availability and non-moving value. Warehouse ' +
              'utilisation was removed rather than estimated: nothing in the system records rack ' +
              'capacity per material, so it was not computable at any accuracy.',
            evidence: [{ file: 'src/pages/Analytics.jsx', note: 'every tile derived; the header states ledger coverage' }],
          },
          {
            id: 'r-model', label: 'Figures that are modelled, not measured', kind: 'gap', status: 'partial',
            detail:
              'Two remain, both labelled in the interface. The available-versus-reserved split inside ' +
              'Movement History is modelled, because the source sheets carry no reservation history. ' +
              'Ledger buckets older than the recorded window are projected at the recorded daily average.',
            missing: 'Reservation history, which only arrives once reservations are actually recorded.',
            evidence: [{ file: 'src/data/insights.js', note: 'movementCombinedSeries() and its card note' }],
          },
        ],
      },
      {
        id: 'r4',
        title: 'Export',
        nodes: [
          {
            id: 'r-exp', label: 'Download a report', kind: 'logic', status: 'planned',
            detail: 'No export exists. Two roles are granted the permission and nothing implements it.',
            evidence: [{ file: 'src/data/roles.js', note: "the 'export' permission" }],
          },
          {
            id: 'r-sched', label: 'Scheduled report delivery', kind: 'logic', status: 'recommended',
            detail:
              'A weekly low-stock summary emailed to procurement would turn a screen someone has to ' +
              'remember to open into something that arrives. It needs a server-side scheduled job, ' +
              'which Supabase can run.',
            evidence: [],
          },
        ],
      },
    ],
  },

  {
    id: 'users',
    title: 'User and access management',
    icon: 'users',
    summary:
      'The weakest area. Accounts are created by hand in the Supabase dashboard, roles are guessed ' +
      'from the email address by a database trigger, and the user screen in the app changes nothing.',
    stages: [
      {
        id: 'u1',
        title: 'User creation',
        nodes: [
          {
            id: 'u-add', label: 'Add User form', kind: 'ui', status: 'partial',
            detail:
              'The form appends a row to the page and disappears on refresh. It cannot work as written: ' +
              'creating a real account needs an administrative key that must never be shipped to a ' +
              'browser, so this needs a small piece of server-side code.',
            missing: 'A server-side function holding the service key, which creates the account and its profile row.',
            evidence: [{ file: 'src/pages/Users.jsx', note: 'add() appends to useState' }],
          },
          {
            id: 'u-manual', label: 'Created by hand in Supabase', kind: 'external', status: 'live',
            detail: 'How accounts are really made today: an administrator adds the user in the Supabase dashboard.',
            evidence: [{ file: 'CLAUDE.md', note: 'create the real user accounts' }],
          },
        ],
      },
      {
        id: 'u2',
        title: 'Role assignment',
        nodes: [
          {
            id: 'u-map', label: 'Role guessed from the email address', kind: 'trigger', status: 'live',
            detail:
              'A trigger reads the part of the email before the @ and assigns a matching role, ' +
              'defaulting to warehouse. Convenient for seeding five demo accounts; a privilege-' +
              'escalation route if account signup is open, because the rule looks at the local part ' +
              'and ignores the domain entirely.',
            evidence: [{ file: 'supabase/schema.sql', note: 'handle_new_user(), split_part(email, @, 1)' }],
          },
          {
            id: 'u-change', label: 'Change someone’s role', kind: 'db', status: 'partial',
            detail:
              'Only an administrator may change a role, enforced by a trigger, and the only way to do ' +
              'it is by editing the row in the Supabase dashboard. There is no screen for it.',
            missing: 'A role-change control on the user screen, and an audit entry when a role changes.',
            evidence: [{ file: 'supabase/schema.sql', note: 'guard_role_change()' }],
          },
        ],
      },
      {
        id: 'u3',
        title: 'Permission validation',
        nodes: [
          {
            id: 'u-ui', label: 'Interface-level checks', kind: 'logic', status: 'live',
            detail:
              'A permission helper and a locked-navigation list decide what a role is offered. This is ' +
              'real and it works — as an interface affordance.',
            evidence: [{ file: 'src/data/roles.js', note: 'can() and isLocked()' }],
          },
          {
            id: 'u-db', label: 'Database-level checks', kind: 'policy', status: 'partial',
            detail:
              'The database distinguishes exactly two kinds of user: administrator, and everyone else ' +
              'who is signed in. All four operational roles have identical database rights — every one ' +
              'of them can read every table, including unit prices and total valuation, and insert into ' +
              'every transactional table. The role distinctions that the interface draws so carefully ' +
              'are not enforced where it counts.',
            missing:
              'Per-role policies. The schema comment already anticipates this and names the change: ' +
              'replace the administrator check with a role-in-list check.',
            evidence: [
              { file: 'supabase/schema.sql', note: "policies use auth.role() = 'authenticated' and is_admin()" },
              { file: 'supabase/schema.sql', note: 'the comment: "To let warehouse staff write inventory too…"' },
            ],
          },
          {
            id: 'u-deadmenu', label: 'Per-role menus that nothing reads', kind: 'gap', status: 'partial',
            detail:
              'Each of the five roles carries a full menu definition — sections, destinations, badges — and ' +
              'nothing in the application reads any of them. The sidebar was changed to one shared list ' +
              'showing the same destinations to everybody, with padlocks where a role may not go, and the ' +
              'old per-role menus were left behind. Harmless, but anyone reading the role file would ' +
              'reasonably believe those menus are what drives the navigation.',
            missing: 'Either delete them, or make the sidebar read them. Two descriptions of the navigation is one too many.',
            evidence: [
              { file: 'src/data/roles.js', note: 'ROLES[*].menu — no consumer anywhere in src/' },
              { file: 'src/components/Layout.jsx', note: 'the sidebar maps over the shared NAV list instead' },
            ],
          },
        ],
      },
      {
        id: 'u4',
        title: 'Deactivation',
        nodes: [
          {
            id: 'u-off', label: 'Disable an account', kind: 'ui', status: 'partial',
            detail:
              'The user screen has an Enable/Disable toggle that changes a label. Profiles carry a ' +
              'status column that nothing reads — a profile marked Inactive can still sign in, because ' +
              'sign-in is handled by Supabase Auth and never consults that column.',
            missing:
              'Either use the Supabase account ban facility, or check the status column at sign-in and ' +
              'in the policies. A status field that does not deny access is worse than none.',
            evidence: [
              { file: 'src/pages/Users.jsx', note: 'toggle() flips a local label' },
              { file: 'supabase/schema.sql', note: "profiles.status defaults to 'Active' and is never read" },
            ],
          },
        ],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// 3. SYSTEM ARCHITECTURE
// ---------------------------------------------------------------------------
// The layer inventory is built from the GENERATED code map, so the counts are of
// files that really exist. The prose per layer is authored.
const kindCount = (k) => CODE.files.filter((f) => f.kind === k).length

export const ARCHITECTURE = {
  note:
    'Three layers, and an unusual shape worth understanding: there is no application server of our ' +
    'own. The browser holds the whole application and talks straight to the database, which is why ' +
    'the database security rules are the only thing standing between a signed-in user and the data.',
  layers: [
    {
      id: 'frontend',
      title: 'Frontend — the browser',
      status: 'live',
      summary:
        'A React single-page application, built by Vite and served as static files. ' +
        CODE.fileCount + ' source files, ' + CODE.totalLines.toLocaleString('en-PH') + ' lines.',
      groups: [
        {
          title: 'Pages',
          status: 'live',
          count: kindCount('page') + kindCount('dashboard-tab'),
          detail:
            kindCount('page') + ' routed pages plus ' + kindCount('dashboard-tab') +
            ' dashboard tabs. Fifteen of the pages are code-split, so opening the dashboard no longer ' +
            'pays to parse every other page and its charts up front.',
          items: CODE.files.filter((f) => f.kind === 'page' || f.kind === 'dashboard-tab').map((f) => f.path),
        },
        {
          title: 'Components',
          status: 'live',
          count: kindCount('component') + kindCount('floorplan') + kindCount('processflow'),
          detail:
            'A small in-house kit — card, badge, KPI card, toggle, data table, modal — plus the chart ' +
            'wrappers, the floor-plan renderers and this module’s diagram renderers. No third-party ' +
            'UI library.',
          items: CODE.files
            .filter((f) => f.kind === 'component' || f.kind === 'floorplan' || f.kind === 'processflow')
            .map((f) => f.path),
        },
        {
          title: 'State management',
          status: 'live',
          count: kindCount('context'),
          detail:
            'Four React contexts and nothing heavier. Authentication, theme, the guided tour and ' +
            'safekeeping requests. Screen state that should survive a refresh or be shareable as a ' +
            'link lives in the URL instead — which tab, which sub-view, which floor-plan level.',
          items: CODE.files.filter((f) => f.kind === 'context').map((f) => f.path),
        },
        {
          title: 'Data modules',
          status: 'live',
          count: kindCount('data'),
          detail:
            'The view models. These compute eagerly when imported and are filled in place by the ' +
            'loader, which is the single most important thing to know before editing them: refill an ' +
            'array, never replace it.',
          items: CODE.files.filter((f) => f.kind === 'data').map((f) => f.path),
        },
        {
          title: 'Library',
          status: 'live',
          count: kindCount('lib'),
          detail: 'The Supabase client, the data loader, formatting, colours and the icon set.',
          items: CODE.files.filter((f) => f.kind === 'lib').map((f) => f.path),
        },
      ],
      gaps: [
        {
          label: 'No error boundary',
          status: 'recommended',
          detail:
            'One thrown error while drawing any screen takes the entire application to a blank white ' +
            'page with no message. A boundary around the routed content would keep the frame and show ' +
            'a recoverable error instead.',
        },
        {
          label: 'No automated tests',
          status: 'recommended',
          detail:
            'The calculation modules — turnover, aging, capacity, the back-cast value series — are ' +
            'pure functions with hand-checked expected values recorded in the changelog. They are ' +
            'exactly what a test suite is for, and there is none.',
        },
      ],
    },
    {
      id: 'backend',
      title: 'Backend — Supabase',
      status: 'live',
      summary:
        'Supabase provides everything a server would: authentication, an automatic HTTP interface ' +
        'over the database, and file storage. We run none of it ourselves.',
      groups: [
        {
          title: 'Authentication service',
          status: 'live',
          count: 4,
          detail:
            'Sign-in by email and password, session storage, automatic token refresh and a sign-in ' +
            'state subscription. Used from one file.',
          items: ['sign in with password', 'get session', 'sign out', 'auth state subscription'],
        },
        {
          title: 'Database service',
          status: 'live',
          count: DB.tableCount,
          detail:
            'Supabase turns the database into an HTTP interface automatically. Requests carry the ' +
            'user’s signed token, and the database decides what that token may see. Requests are ' +
            'capped at 1,000 rows, which the loader pages past.',
          items: ['select (13 tables at startup)', 'select item_master on demand', 'insert safekeeping_requests'],
        },
        {
          title: 'File storage',
          status: 'planned',
          count: 0,
          detail:
            'Not configured and not used. The incoming-material screen has a document drop area ' +
            'labelled a prototype; delivery paperwork, packing lists and photographs have nowhere to go.',
          items: [],
        },
        {
          title: 'Server-side functions',
          status: 'planned',
          count: 0,
          detail:
            'None exist. Three things genuinely need one, because each requires a secret that must ' +
            'never reach a browser: creating user accounts, sending notification email, and calling ' +
            'SAP Business One.',
          items: [],
        },
      ],
      gaps: [
        {
          label: 'Everything runs with the user’s own token',
          status: 'live',
          detail:
            'This is correct and deliberate — the browser only ever holds the public key, and the ' +
            'database rules do the enforcing. It is also why anything needing elevated rights has to ' +
            'wait for a server-side function.',
        },
      ],
    },
    {
      id: 'database',
      title: 'Database — Postgres',
      status: 'live',
      summary:
        DB.tableCount + ' tables, ' + DB.relationships.length + ' foreign keys, ' +
        DB.tables.reduce((a, t) => a + t.policies.length, 0) + ' security policies, ' +
        DB.functions.length + ' functions and ' + DB.triggers.length + ' triggers. Row-level security is on for every table.',
      groups: [
        {
          title: 'Identity',
          status: 'live',
          count: 1,
          detail:
            'One table joining a Supabase account to its role, name and department, protected by the ' +
            'role-change trigger.',
          items: ['profiles'],
        },
        {
          title: 'Reference data',
          status: 'live',
          count: DB.groups.reference.length,
          detail:
            'The real warehouse dataset, loaded from the source workbooks. Read by every signed-in ' +
            'user; written only by an administrator.',
          items: DB.groups.reference,
        },
        {
          title: 'Transactional data',
          status: 'partial',
          count: DB.groups.transactional.length,
          detail:
            'Created empty on purpose — every row from here on should be a real record made by a real ' +
            'person. One of the seven has ever received a row.',
          items: DB.groups.transactional,
        },
      ],
      gaps: [
        {
          label: 'No triggers keep the stock figures consistent',
          status: 'planned',
          detail:
            'Recording a movement should change stock on hand; creating a reservation should move ' +
            'quantity from available to reserved. Neither rule exists in the database, so once writes ' +
            'begin, correctness would depend entirely on the browser getting it right every time.',
        },
        {
          label: 'No quantity constraints',
          status: 'recommended',
          detail:
            'Quantity columns accept zero and negatives. A check constraint per quantity column is a ' +
            'few lines of SQL and prevents a whole class of bad data.',
        },
      ],
    },
  ],
}

// How a single request travels between the layers. Drawn on the Architecture view,
// because "there is no server of ours in the middle" is the one structural fact that
// explains most of the security findings further down.
export const REQUEST_FLOW = {
  id: 'request',
  title: 'What happens when a screen asks for data',
  stages: [
    {
      id: 'q1',
      title: 'Browser',
      nodes: [
        {
          id: 'q-page', label: 'A page or component', kind: 'ui', status: 'live',
          detail: 'A screen needs data. It does not fetch anything itself — it reads the data modules, which were filled once at startup.',
          evidence: [{ file: 'src/pages/dashboard/InventoryTab.jsx', note: 'reads insights, never queries' }],
          next: ['q-client'],
        },
      ],
    },
    {
      id: 'q2',
      title: 'Client',
      nodes: [
        {
          id: 'q-client', label: 'The Supabase client', kind: 'logic', status: 'live',
          detail: 'One file creates the client for the whole application, and attaches the signed-in user’s token to every request it makes.',
          evidence: [{ file: 'src/lib/supabase.js', note: 'the single createClient call' }],
          next: ['q-http'],
        },
      ],
    },
    {
      id: 'q3',
      title: 'Network',
      nodes: [
        {
          id: 'q-http', label: 'HTTPS request with the token', kind: 'api', status: 'live',
          detail: 'A plain web request straight from the browser to Supabase. There is no application server of ours in between — nothing of ours inspects, filters or logs this request.',
          evidence: [],
          next: ['q-rest', 'q-auth'],
        },
      ],
    },
    {
      id: 'q4',
      title: 'Supabase',
      nodes: [
        {
          id: 'q-rest', label: 'Database interface', kind: 'service', status: 'live',
          detail: 'Supabase exposes the database over HTTP automatically. It reads the user id and role out of the signed token and hands both to Postgres.',
          evidence: [{ file: 'src/lib/hydrate.js', note: 'select with range paging' }],
          next: ['q-rls'],
        },
        {
          id: 'q-auth', label: 'Authentication service', kind: 'service', status: 'live',
          detail: 'Issues, verifies and refreshes the token. Sign-in and sign-out go here rather than to the database interface.',
          evidence: [{ file: 'src/context/AuthContext.jsx', note: 'the auth calls' }],
          next: ['q-rls'],
        },
      ],
    },
    {
      id: 'q5',
      title: 'Postgres',
      nodes: [
        {
          id: 'q-rls', label: 'Row-level security', kind: 'policy', status: 'live',
          detail: 'Every table checks the caller before returning a single row. This is the ONLY enforcement point in the whole system — there is no server-side code of ours that could add a check.',
          evidence: [{ file: 'supabase/schema.sql', note: 'the policy loop over every table' }],
          next: ['q-table'],
        },
      ],
    },
    {
      id: 'q6',
      title: 'Tables',
      nodes: [
        {
          id: 'q-table', label: 'The table, and any trigger on it', kind: 'db', status: 'live',
          detail: 'Rows are read or written. On a write, column defaults capture who did it, and the role-change trigger runs on a profile update.',
          evidence: [{ file: 'supabase/schema.sql', note: 'created_by defaults and the profiles trigger' }],
          next: ['q-back'],
        },
      ],
    },
    {
      id: 'q7',
      title: 'Back to the screen',
      nodes: [
        {
          id: 'q-back', label: 'Rows mapped and rendered', kind: 'logic', status: 'live',
          detail: 'Database column names are translated to the shapes the app uses, arrays are refilled in place, derived figures recomputed, and React draws.',
          evidence: [{ file: 'src/lib/hydrate.js', note: 'the row mappers and the rebuild calls' }],
          next: [],
        },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// TABLE DESCRIPTIONS — authored, in plain English
// ---------------------------------------------------------------------------
// The generator lifts each table's purpose out of the comment above it in the schema,
// which works where the schema has prose and gives nothing where it does not — eight
// of the seventeen tables had no adjacent comment, and three had only a section label.
// These are written for a reader who does not work on the code: what the table holds,
// in warehouse terms rather than database terms. The detail panel shows the schema's
// own comment underneath where the two differ, so nothing is hidden.
export const TABLE_NOTES = {
  profiles:
    'One row per person who can sign in — their role, name, department and access level. Supabase Auth owns ' +
    'the account and the password; this table holds everything about that person the warehouse system needs.',
  trades:
    'The trade taxonomy every material is filed under: trade at the top level (Structural, Electrical and ' +
    'Auxiliary, Architectural…) and item group beneath it. Drives the sidebar filters and the distribution charts.',
  projects: 'The project register — a short code and the project’s proper name. Used wherever a project is named.',
  item_master:
    'The company-wide item catalogue, 7,378 codes. Not warehouse stock — the list of everything that CAN be ' +
    'stocked. Fetched only when a form with an item lookup opens, because it is far too large to load at startup.',
  inventory:
    'Central Warehouse stock on hand — 779 lines. One row per physical line item, not per item code: the same ' +
    'code appears on several lines with different secondary descriptions, different conditions and different prices. ' +
    'This is the table every dashboard figure in the app is computed from.',
  ledger:
    'Real recorded movements in and out of the warehouse, imported from the incoming and outgoing sheets — 184 ' +
    'rows. This is genuine history, and it is what turnover, aging and the movement charts are calculated from. ' +
    'It is separate from the movements table, which is where movements made INSIDE the app would go.',
  safekeeping_soh: 'Stock on hand for material the company is storing on behalf of a project — 132 lines. Not company-owned.',
  safekeeping_incoming: 'Project-owned material received into safekeeping — 271 recorded receipts.',
  safekeeping_outgoing: 'Project-owned material released back out of safekeeping — 160 recorded releases.',
  delivery_tracker:
    'The warehouse delivery schedule — 27 expected deliveries with target weeks, tower locations, down-payment ' +
    'status and remarks. Taken from the schedule sheet, which carries no item codes, so the app resolves those ' +
    'against the item catalogue at run time.',
  movements:
    'Where a receipt, issue, return or adjustment recorded through the app would be written. Live, empty, and ' +
    'already accepting inserts — nothing in the application writes to it yet.',
  reservations:
    'Where a hold placed on stock for a project would be written. Live and empty. Note that nothing in the ' +
    'database moves quantity from available to reserved when a row lands here — that rule does not exist yet.',
  purchase_requests: 'Where a request to buy more of something would be written. Live and empty.',
  material_requests: 'Where a project site’s request for material would be written. Live and empty.',
  approvals:
    'Where an approval decision would be recorded, including who decided and when. Live and empty — the ' +
    'Approve and Reject buttons on the approvals screen change the display and are never saved.',
  safekeeping_requests:
    'The one table the application actually writes to. A safekeeping request with its packing lists, stored as a ' +
    'structured document with the fields the app sorts and filters on promoted to real columns.',
  audit_log:
    'The record of who did what. Deliberately append-only — not even an administrator can edit or delete a row, ' +
    'because an audit trail you can rewrite is not an audit trail. It is empty: nothing in the system writes to it.',
}

// ---------------------------------------------------------------------------
// 4. DATA FLOW TRACES
// ---------------------------------------------------------------------------
// The eight-step shape asked for: action, component, call, service, table,
// trigger, response, screen update. Where a step does not exist, it says so —
// that absence is the most useful thing on the page.
const STEP_LABELS = [
  'User action',
  'Frontend component',
  'API call',
  'Supabase service',
  'Database table',
  'Trigger / function',
  'Returned data',
  'UI update',
]

export const DATA_FLOWS = [
  {
    id: 'signin',
    title: 'Signing in',
    status: 'live',
    steps: [
      { label: 'Types email and password, presses Sign In', status: 'live' },
      { label: 'src/pages/Login.jsx submits to AuthContext.signIn', status: 'live' },
      { label: 'supabase.auth.signInWithPassword', status: 'live' },
      { label: 'Auth service verifies the password and issues a signed token', status: 'live' },
      { label: 'auth.users, then a select from public.profiles', status: 'live' },
      { label: 'None on read. handle_new_user only fires when the account is first created', status: 'live' },
      { label: 'Role, name, department, access level', status: 'live' },
      { label: 'hydrate() re-runs with the new session, then the dashboard renders', status: 'live' },
    ],
  },
  {
    id: 'load',
    title: 'Loading the dashboard data',
    status: 'live',
    steps: [
      { label: 'Opens the app, or completes a sign-in', status: 'live' },
      { label: 'src/main.jsx, before the first render', status: 'live' },
      { label: 'Thirteen parallel selects, paged 1,000 rows at a time', status: 'live' },
      { label: 'Database service, filtered by row-level security', status: 'live' },
      { label: 'inventory, ledger, three safekeeping sheets, delivery_tracker, projects, and the six transactional tables', status: 'live' },
      { label: 'None', status: 'live' },
      { label: 'Rows, mapped from database column names to the shapes the app uses', status: 'live' },
      { label: 'Arrays refilled in place, derived figures recomputed, then React renders once', status: 'live' },
    ],
  },
  {
    id: 'sk-request',
    title: 'Submitting a safekeeping request',
    status: 'live',
    note: 'The only complete write in the application. Worth reading as the template for Phase 3.',
    steps: [
      { label: 'New Transaction, Receipt, Safekeeping — fills the packing list and submits', status: 'live' },
      { label: 'AddSafekeepingRequestModal, into SafekeepingContext.addRequest', status: 'live' },
      { label: 'insert into safekeeping_requests, returning the new row', status: 'live' },
      { label: 'Database service, with the insert policy allowing any signed-in user', status: 'live' },
      { label: 'safekeeping_requests — key fields as columns, the packing list as a structured document', status: 'live' },
      { label: 'Column defaults capture the account id and email from the token', status: 'live' },
      { label: 'The saved row, including its generated id', status: 'live' },
      { label: 'Shown immediately and rolled back out if the save was refused', status: 'live' },
    ],
  },
  {
    id: 'item-lookup',
    title: 'Looking up an item code',
    status: 'live',
    steps: [
      { label: 'Starts typing in an item field', status: 'live' },
      { label: 'ItemLookup, on first open', status: 'live' },
      { label: 'select from item_master, paged, cached for the session', status: 'live' },
      { label: 'Database service', status: 'live' },
      { label: 'item_master — 7,378 codes', status: 'live' },
      { label: 'None', status: 'live' },
      { label: 'Code, description, trade, item group, unit of measure', status: 'live' },
      { label: 'Filtered suggestions; falls back to free typing if the fetch fails', status: 'live' },
    ],
  },
  {
    id: 'movement',
    title: 'Recording an incoming delivery',
    status: 'partial',
    note: 'Everything up to the save exists. The save does not.',
    steps: [
      { label: 'Warehouse staff fill the incoming form and press Save', status: 'live' },
      { label: 'src/pages/Movement.jsx', status: 'live' },
      { label: 'No call is made', status: 'planned' },
      { label: 'Not reached', status: 'planned' },
      { label: 'movements — exists, accepts inserts, empty', status: 'planned' },
      { label: 'None exists. A movement should adjust inventory and write an audit entry', status: 'planned' },
      { label: 'Nothing returned', status: 'planned' },
      { label: 'The row appears on screen and is gone on refresh', status: 'partial' },
    ],
  },
  {
    id: 'approval',
    title: 'Approving a request',
    status: 'partial',
    steps: [
      { label: 'Management presses Approve', status: 'live' },
      { label: 'src/pages/Approvals.jsx', status: 'live' },
      { label: 'No call is made', status: 'planned' },
      { label: 'Not reached', status: 'planned' },
      { label: 'approvals — decided_by and decided_at are never written', status: 'planned' },
      { label: 'None. An approval should release the reservation or post the movement', status: 'planned' },
      { label: 'Nothing returned', status: 'planned' },
      { label: 'The badge changes and reverts on refresh', status: 'partial' },
    ],
  },
]
export { STEP_LABELS }

// ---------------------------------------------------------------------------
// 5. ROLE-BASED ACCESS MAPPING
// ---------------------------------------------------------------------------
// Two truths per role, side by side, because they disagree — and the disagreement is
// the point. The interface column is derived from the role definitions in code; the
// database column is derived from the generated policy list.
const uiPerms = (roleKey) => ROLES[roleKey]?.can || []
const lockedFor = (roleKey) => NAV.filter((n) => isLocked(n, roleKey)).map((n) => n.label)

// Every non-admin role gets the same database rights, so this is written once and
// referenced per role rather than repeated — repeating it would imply variation.
const DB_NON_ADMIN = {
  view: 'Every row of every one of the ' + DB.tableCount + ' tables, including unit prices and total valuation.',
  create: 'Rows in any of the seven transactional tables.',
  edit: 'Nothing. Update is administrator-only.',
  remove: 'Nothing. Delete is administrator-only.',
  approve: 'No approval concept exists in the database.',
  exportData: 'Any data they can read, through the database interface directly.',
}

export const ROLE_MATRIX = [
  {
    key: 'admin',
    label: 'System Administrator',
    people: 'IT / Systems',
    status: 'live',
    ui: {
      view: ['Everything — inventory, values, audit, users, settings'],
      create: ['Every form the application offers'],
      edit: ['Settings; user records on screen'],
      remove: ['Nothing — no delete exists in the interface'],
      approve: ['Granted the approve permission'],
      exportData: ['Granted the export permission — nothing implements it'],
    },
    db: {
      view: 'Every table.',
      create: 'Every table, reference and transactional alike.',
      edit: 'Every table, and any profile including its role.',
      remove: 'Every table except the audit log, which no one may alter.',
      approve: 'No approval concept exists in the database.',
      exportData: 'Everything.',
    },
    gaps: [
      'The interface offers no delete anywhere, while the database permits it. Deletions happen in the Supabase dashboard.',
      'Administrator is the only role the database actually recognises.',
    ],
  },
  {
    key: 'procurement',
    label: 'Procurement Personnel',
    people: 'Procurement',
    status: 'live',
    ui: {
      view: ['Inventory and values', 'Low stock alerts', 'Purchase requirements', 'Safekeeping', 'Floor plan', 'Reports'],
      create: ['Purchase requests (not saved)', 'Safekeeping requests (saved)'],
      edit: ['Nothing'],
      remove: ['Nothing'],
      approve: ['Not granted'],
      exportData: ['Not granted'],
    },
    db: DB_NON_ADMIN,
    gaps: [
      'Movement History and Users are padlocked in the menu but the routes still render if typed.',
      'The database grants the same rights as every other signed-in role.',
    ],
  },
  {
    key: 'warehouse',
    label: 'Warehouse Personnel',
    people: 'Central Warehouse',
    status: 'live',
    ui: {
      view: ['Inventory', 'Incoming and outgoing', 'Reservations', 'Safekeeping', 'Floor plan'],
      create: ['Movements (not saved)', 'Materials (not saved)', 'Safekeeping requests (saved)'],
      edit: ['Condition and location are granted as permissions — no screen exercises either'],
      remove: ['Nothing'],
      approve: ['Not granted'],
      exportData: ['Not granted'],
    },
    db: DB_NON_ADMIN,
    gaps: [
      'Cannot write inventory in the database — reference data is administrator-only — so even once the forms save, receiving would be refused unless the policy changes.',
      'Holds updateCondition and updateLocation permissions with nowhere to use them.',
    ],
  },
  {
    key: 'site',
    label: 'Project Site Personnel',
    people: 'Project sites',
    status: 'live',
    ui: {
      view: ['Available stock', 'Own reservations', 'Delivery tracking', 'Floor plan'],
      create: ['Material requests (not saved)'],
      edit: ['Nothing'],
      remove: ['Nothing'],
      approve: ['Not granted'],
      exportData: ['Not granted'],
    },
    db: DB_NON_ADMIN,
    gaps: [
      'The most significant mismatch in the system: a site user is shown "available stock" and can read every unit price and the whole inventory valuation from the database.',
      '"Own reservations" is a label, not a filter — reservations are not scoped to their creator anywhere.',
    ],
  },
  {
    key: 'management',
    label: 'Management / Supervisor',
    people: 'Operations management',
    status: 'live',
    ui: {
      view: ['Everything operational, plus analytics'],
      create: ['Nothing of its own'],
      edit: ['Nothing'],
      remove: ['Nothing'],
      approve: ['Granted, and the buttons work on screen only'],
      exportData: ['Granted — nothing implements it'],
    },
    db: DB_NON_ADMIN,
    gaps: [
      'Approval decisions are never saved, so there is no record of who approved what.',
      'The database has no notion of an approver.',
    ],
  },
]

export const FUTURE_ROLES = [
  {
    label: 'Warehouse Supervisor',
    status: 'recommended',
    why:
      'Today warehouse staff either can do a thing or cannot. Once movements save, someone has to be ' +
      'able to correct a mis-keyed quantity, and that must not be the same person who keyed it.',
    access: 'Everything warehouse personnel can do, plus adjustments and reversals, plus approval of movements under a value threshold.',
  },
  {
    label: 'Auditor / read-only',
    status: 'recommended',
    why:
      'Internal audit and external reviewers need to see everything and change nothing. Handing them ' +
      'an administrator account because there is no read-only role is how audit trails get polluted.',
    access: 'Read every table including the audit log. No insert, no update, no delete, anywhere.',
  },
  {
    label: 'Project Manager',
    status: 'recommended',
    why:
      'A site user sees the whole warehouse. A project manager should see their own projects properly ' +
      '— all of their material requests, reservations and deliveries — and nobody else’s.',
    access: 'Read and create scoped to their assigned projects. Approve their own project’s requests up to a threshold.',
  },
  {
    label: 'Finance / Cost Control',
    status: 'recommended',
    why:
      'Valuation, aging and non-moving stock are finance questions being answered on an operations ' +
      'screen. Finance needs the value views without the operational ones — and, conversely, ' +
      'operational roles probably should not see valuation at all.',
    access: 'Read valuation, aging and turnover. No operational write. Export.',
  },
  {
    label: 'Integration service account',
    status: 'recommended',
    why:
      'When the SAP link is built, something has to sign in as itself rather than as a person. A ' +
      'machine account keeps automated postings distinguishable from human ones in the audit trail.',
    access: 'Narrow: insert movements and update stock figures. No interface access at all.',
  },
  {
    label: 'Safekeeping Custodian',
    status: 'recommended',
    why:
      'Safekeeping holds material the company does not own, which is a custody responsibility distinct ' +
      'from warehouse stock. It is the one part of the system that already saves, and it has no owner.',
    access: 'Approve, receive and release safekeeping requests for the projects assigned to them.',
  },
]

// ---------------------------------------------------------------------------
// 6. SECURITY ARCHITECTURE
// ---------------------------------------------------------------------------
export const SECURITY_SECTIONS = [
  {
    id: 'authn',
    title: 'Authentication',
    status: 'live',
    points: [
      {
        label: 'Password verification',
        status: 'live',
        detail:
          'Handled entirely by Supabase Auth. Our code never stores or compares a password, which ' +
          'removes the most commonly mishandled part of authentication from our responsibility.',
      },
      {
        label: 'Signed tokens',
        status: 'live',
        detail:
          'A short-lived signed token proves identity on every database request; a longer-lived ' +
          'refresh token renews it. The database reads the user id and email out of the token itself, ' +
          'which is why a client cannot claim to be someone else.',
      },
      {
        label: 'Session storage',
        status: 'live',
        detail:
          'Kept in browser local storage so a refresh does not sign you out. The standard trade-off ' +
          'for an app with no server of its own, and the reason a cross-site scripting bug would be ' +
          'serious here.',
      },
      {
        label: 'Demo password fallback',
        status: 'live',
        detail:
          'A fixed demo password unlocks the five sample accounts on a developer machine only. The ' +
          'branch is compiled out of the published build. This was a real production hole and is closed.',
      },
      {
        label: 'Second factor',
        status: 'recommended',
        detail: 'None. One leaked password is enough to read the entire inventory valuation.',
      },
    ],
  },
  {
    id: 'authz',
    title: 'Authorisation',
    status: 'partial',
    points: [
      {
        label: 'Route guard',
        status: 'live',
        detail: 'Every application route requires a session. Seventeen of nineteen routes are protected.',
      },
      {
        label: 'Role-aware navigation',
        status: 'live',
        detail:
          'Restricted destinations show a padlock instead of being hidden, so the shape of the system ' +
          'stays legible to everyone.',
      },
      {
        label: 'Route-level role checks',
        status: 'partial',
        detail:
          'A padlocked destination still renders if its address is typed in. Nothing confidential is ' +
          'newly exposed by this — the database would have handed the data over anyway — but the ' +
          'restriction is presentation rather than enforcement.',
      },
      {
        label: 'Row-level security on every table',
        status: 'live',
        detail:
          'All ' + DB.tableCount + ' tables have it enabled, with ' +
          DB.tables.reduce((a, t) => a + t.policies.length, 0) +
          ' policies. Nothing is reachable without a valid token — that part is solid.',
      },
      {
        label: 'Policies that distinguish the operational roles',
        status: 'partial',
        detail:
          'They do not. Policies test only "is signed in" and "is an administrator", so all four ' +
          'operational roles hold identical database rights.',
      },
    ],
  },
  {
    id: 'dbsec',
    title: 'Database security',
    status: 'live',
    points: [
      {
        label: 'Role-escalation guard',
        status: 'live',
        detail:
          'A trigger refuses a role change from anyone who is not already an administrator. It closes ' +
          'a real hole: the policy letting a user edit their own profile could not tell that the ' +
          'column being edited was the role.',
      },
      {
        label: 'Append-only audit log',
        status: 'live',
        detail:
          'The audit table has read and insert policies and nothing else — deliberately, so not even ' +
          'an administrator can rewrite history. The table is empty because nothing writes to it.',
      },
      {
        label: 'Administrator check as a trusted function',
        status: 'live',
        detail:
          'The check runs with elevated rights so that reading the profile table inside a policy does ' +
          'not recurse into that table’s own policy. Standard and correct.',
      },
      {
        label: 'Reference data is administrator-write only',
        status: 'live',
        detail:
          'The real warehouse dataset cannot be altered by an ordinary signed-in user. This is also ' +
          'what will block warehouse receiving the moment the forms start saving, and the schema ' +
          'comment already names the fix.',
      },
      {
        label: 'Public key in the published bundle',
        status: 'live',
        detail:
          'By design. The key identifies the project, not a user; it grants nothing on its own because ' +
          'every table is protected. It does mean the database rules are the entire defence.',
      },
    ],
  },
]

// Findings are severity-ranked and each carries a fix. `status` here classifies the
// FIX, not the problem: recommended means nobody has asked for it yet.
export const VULNERABILITIES = [
  {
    id: 'v-signup',
    severity: 'high',
    status: 'recommended',
    title: 'The signup trigger grants administrator by email prefix, ignoring the domain',
    detail:
      'When an account is created, a trigger reads the text before the @ and assigns a matching role. ' +
      'It never looks at the domain. If self-signup is enabled on the Supabase project — the default ' +
      'for a new project — then anyone who registers as admin@ any domain at all becomes a system ' +
      'administrator of this application.',
    evidence: [{ file: 'supabase/schema.sql', note: 'handle_new_user(), case split_part(new.email, @, 1)' }],
    verify:
      'Supabase dashboard, Authentication, Sign In / Providers: check whether email signup is enabled. ' +
      'This is a setting I cannot read from the code, so it must be confirmed in the dashboard.',
    fix:
      'Disable public signup so accounts are created by an administrator only. Then narrow the mapping ' +
      'to the exact company addresses, or remove it and assign every role by hand — five accounts do ' +
      'not need automation.',
  },
  {
    id: 'v-rls-roles',
    severity: 'high',
    status: 'recommended',
    title: 'Every signed-in user can read the entire dataset, including valuation',
    detail:
      'The read policy on all ' + DB.tableCount + ' tables is "is the caller signed in". A project-site ' +
      'user, whose screens show them available stock, can read every unit price, every line value and ' +
      'the total inventory valuation — and the app already downloads all of it into their browser at ' +
      'startup. The careful role distinctions in the interface have no counterpart in the database.',
    evidence: [
      { file: 'supabase/schema.sql', note: "the policy loop: auth.role() = 'authenticated'" },
      { file: 'src/lib/hydrate.js', note: 'the whole inventory table is fetched for every role' },
    ],
    fix:
      'Add the role to the policies: read the caller’s role from their profile and gate the priced ' +
      'columns behind it. A view exposing inventory without the price columns, granted to the ' +
      'operational roles, is the smaller and safer change.',
  },
  {
    id: 'v-audit',
    severity: 'high',
    status: 'planned',
    title: 'Nothing is logged, and audit entries could be attributed to anyone',
    detail:
      'Two problems in one place. First, no action anywhere in the system writes an audit entry, so ' +
      'there is no record of who did what. Second, the audit table takes the user email as ordinary ' +
      'text with no default from the token — unlike every other table, which captures the signed-in ' +
      'identity automatically. Any signed-in user could therefore insert an entry naming someone else.',
    evidence: [
      { file: 'supabase/schema.sql', note: 'audit_log.user_email is plain text with no default' },
      { file: 'supabase/schema.sql', note: 'other tables default created_by_email from the token' },
    ],
    fix:
      'Default the email from the token exactly as the other tables do, and write audit entries from ' +
      'database triggers rather than from the browser — a log the client composes is a log the client ' +
      'can shape.',
  },
  {
    id: 'v-status',
    severity: 'medium',
    status: 'recommended',
    title: 'Disabling a user does not disable them',
    detail:
      'Profiles carry a status column, the user screen has an Enable/Disable control, and neither has ' +
      'any effect on access: sign-in is handled by Supabase Auth, which never consults that column. An ' +
      'account marked Inactive signs in normally. A control that appears to revoke access and does not ' +
      'is worse than no control, because someone will rely on it.',
    evidence: [
      { file: 'supabase/schema.sql', note: "profiles.status defaults to 'Active' and is read nowhere" },
      { file: 'src/pages/Users.jsx', note: 'toggle() changes a label in the page' },
    ],
    fix:
      'Use the Supabase account ban facility for real revocation, and until then remove the control ' +
      'rather than leave it implying something it does not do.',
  },
  {
    id: 'v-profiles',
    severity: 'medium',
    status: 'recommended',
    title: 'Every signed-in user can read every colleague’s profile',
    detail:
      'The profile read policy is "is signed in", so any user can list every account’s name, email, ' +
      'department, role and access level. It is needed for the user screen, but it is granted to ' +
      'everyone rather than to administrators.',
    evidence: [{ file: 'supabase/schema.sql', note: 'the profiles_read policy' }],
    fix: 'Restrict it to the caller’s own row plus administrators, and let the user screen be the one place that reads the rest.',
  },
  {
    id: 'v-selfupdate',
    severity: 'low',
    status: 'recommended',
    title: 'A user can edit fields on their own profile that they should not own',
    detail:
      'The self-update policy lets a user change their own row. The role is protected by the trigger, ' +
      'but department, access level and status are not — a user can rewrite their own department and ' +
      'access-level label. Nothing grants real access from those fields today, which is the only ' +
      'reason this is low.',
    evidence: [{ file: 'supabase/schema.sql', note: 'profiles_self_update, with no column restriction' }],
    fix: 'Restrict self-update to display fields, or route profile edits through a function that only accepts the fields a user owns.',
  },
  {
    id: 'v-hosting',
    severity: 'medium',
    status: 'planned',
    title: 'The site is publicly reachable, and will not pass an SAP security review',
    detail:
      'GitHub Pages on a free account serves the site to the whole internet; the only access control ' +
      'is the sign-in. That is acceptable for a prototype holding a data snapshot. It will not survive ' +
      'a review once this system touches production SAP data, and the SAP brief already records that.',
    evidence: [
      { file: 'CLAUDE.md', note: 'the deployment caveat' },
      { file: 'docs/sap-integration-brief.md', note: 'noted as a blocker for the integration' },
    ],
    fix: 'Move to a host that supports private access before production data arrives, and put the app behind the company identity provider.',
  },
  {
    id: 'v-boundary',
    severity: 'low',
    status: 'recommended',
    title: 'One error blanks the whole application',
    detail:
      'There is no error boundary. An exception while drawing any screen unmounts everything and ' +
      'leaves a blank page with no message and no way back except a manual reload.',
    evidence: [{ file: 'CLAUDE.md', note: 'known blocker #5' }],
    fix: 'One boundary around the routed content, showing the error and a retry, keeping the frame and the navigation alive.',
  },
  {
    id: 'v-integrity',
    severity: 'low',
    status: 'recommended',
    title: 'The database will not defend the stock figures once writing starts',
    detail:
      'Quantity columns accept negatives, no constraint ties a reservation to available stock, and no ' +
      'trigger adjusts stock when a movement is recorded. Nothing is wrong today because nothing ' +
      'writes — but that means correctness would rest entirely on the browser being right every time.',
    evidence: [{ file: 'supabase/schema.sql', note: 'no check constraints on the quantity columns' }],
    fix: 'Add the constraints and the stock-adjustment trigger as part of the write path, not after it.',
  },
]

// ---------------------------------------------------------------------------
// 7. TECHNICAL DEPENDENCIES
// ---------------------------------------------------------------------------
// The list and the used/unused verdict are GENERATED from the import graph. The
// commentary per package is authored.
export const DEP_NOTES = {
  react: {
    role: 'Interface framework',
    note: 'Version 18. Used by 36 files. Current; version 19 exists and would be a deliberate upgrade, not a fix.',
    status: 'live',
  },
  'react-dom': { role: 'Browser renderer', note: 'Paired with React and imported once, at startup.', status: 'live' },
  'react-router-dom': {
    role: 'Navigation',
    note:
      'Version 6. Holds the nineteen routes, and is what lets a dashboard tab or a floor-plan level ' +
      'live in the address bar so a colleague can be sent a link to exactly what you are looking at.',
    status: 'live',
  },
  recharts: {
    role: 'Charts',
    note:
      'Imported by exactly one file, which wraps it for the whole app. That is deliberate: a single ' +
      'wrapper means the charting library could be replaced without touching a page.',
    status: 'live',
  },
  '@supabase/supabase-js': {
    role: 'Database and authentication client',
    note: 'Imported by exactly one file, which creates the client. Every other file goes through that one.',
    status: 'live',
  },
  vite: { role: 'Build tool', note: 'Development server and production build. Used by the config, not by app code.', status: 'live' },
  '@vitejs/plugin-react': { role: 'Build plugin', note: 'Lets the build understand React syntax.', status: 'live' },
}

export const DEP_FINDINGS = [
  {
    label: 'Nothing unused, nothing duplicated, nothing deprecated',
    status: 'live',
    detail:
      'Five runtime packages and two build packages, every one of them imported by real code — ' +
      'checked against the import graph rather than assumed. For an application of this size that is ' +
      'unusually lean, and it is worth protecting.',
  },
  {
    label: 'No diagram library was added for this module',
    status: 'live',
    detail:
      'A flowchart library would have been the obvious way to build these diagrams and would have ' +
      'roughly doubled the download size of the app. The diagrams here are drawn directly, the same ' +
      'way the warehouse floor plan is, so this module costs the rest of the application nothing.',
  },
  {
    label: 'No test runner',
    status: 'recommended',
    detail:
      'The calculation modules are pure functions with hand-verified expected values recorded in the ' +
      'project changelog. Turning those recorded checks into a test file would take an afternoon and ' +
      'would stop a future change quietly breaking turnover or the aging bands.',
  },
  {
    label: 'No continuous integration beyond deploy',
    status: 'recommended',
    detail:
      'Every push to the main branch builds and publishes. Nothing checks the build before it becomes ' +
      'the live site, so a broken commit is discovered by whoever opens the site next.',
  },
  {
    label: 'No error-handling library',
    status: 'recommended',
    detail: 'An error boundary is about thirty lines of React and needs no package at all.',
  },
]

// ---------------------------------------------------------------------------
// SUMMARY — counted, never asserted
// ---------------------------------------------------------------------------
// Every status count on the page comes from here, walking the structures above.
// A hand-written "12 features live" would be wrong within a week.
function collectStatuses() {
  const tally = { live: 0, partial: 0, planned: 0, recommended: 0 }
  const bump = (s) => { if (tally[s] !== undefined) tally[s]++ }

  JOURNEY.stages.forEach((st) => st.nodes.forEach((n) => bump(n.status)))
  PROCESSES.forEach((p) => p.stages.forEach((st) => st.nodes.forEach((n) => bump(n.status))))
  ARCHITECTURE.layers.forEach((l) => {
    l.groups.forEach((g) => bump(g.status))
    l.gaps.forEach((g) => bump(g.status))
  })
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
}

// A single flat index of every documented item, for the module's search box. Built
// once at import; the search filters this rather than walking the structures again.
export const SEARCH_INDEX = [
  ...JOURNEY.stages.flatMap((s) =>
    s.nodes.map((n) => ({ id: 'journey:' + n.id, view: 'journey', label: n.label, context: 'Journey · ' + s.title, status: n.status, detail: n.detail }))
  ),
  ...PROCESSES.flatMap((p) =>
    p.stages.flatMap((s) =>
      s.nodes.map((n) => ({ id: 'process:' + p.id + ':' + n.id, view: 'processes', label: n.label, context: p.title + ' · ' + s.title, status: n.status, detail: n.detail }))
    )
  ),
  ...ARCHITECTURE.layers.flatMap((l) =>
    l.groups.map((g) => ({ id: 'arch:' + l.id + ':' + g.title, view: 'architecture', label: g.title, context: l.title, status: g.status, detail: g.detail }))
  ),
  ...DB.tables.map((t) => ({
    id: 'db:' + t.name,
    view: 'database',
    label: t.name,
    context: 'Database · ' + t.group + ' table',
    status: t.group === 'transactional' && t.name !== 'safekeeping_requests' ? 'partial' : 'live',
    detail: TABLE_NOTES[t.name] || t.purpose || t.columns.length + ' columns',
  })),
  ...DATA_FLOWS.map((f) => ({ id: 'flow:' + f.id, view: 'dataflow', label: f.title, context: 'Data flow', status: f.status, detail: f.note || '' })),
  ...ROLE_MATRIX.map((r) => ({ id: 'role:' + r.key, view: 'access', label: r.label, context: 'Role', status: r.status, detail: r.people })),
  ...FUTURE_ROLES.map((r) => ({ id: 'future:' + r.label, view: 'access', label: r.label, context: 'Proposed role', status: r.status, detail: r.why })),
  ...VULNERABILITIES.map((v) => ({ id: 'vuln:' + v.id, view: 'security', label: v.title, context: 'Security · ' + v.severity, status: v.status, detail: v.detail })),
  ...SECURITY_SECTIONS.flatMap((s) =>
    s.points.map((p) => ({ id: 'sec:' + s.id + ':' + p.label, view: 'security', label: p.label, context: 'Security · ' + s.title, status: p.status, detail: p.detail }))
  ),
  ...CODE.dependencies.map((d) => ({ id: 'dep:' + d.name, view: 'dependencies', label: d.name, context: 'Dependency', status: 'live', detail: DEP_NOTES[d.name]?.role || '' })),
  ...DEP_FINDINGS.map((d) => ({ id: 'depf:' + d.label, view: 'dependencies', label: d.label, context: 'Dependency finding', status: d.status, detail: d.detail })),
]

export { DB, CODE, lockedFor, uiPerms }
