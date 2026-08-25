import { useState } from 'react'
import { supabase, isConfigured } from '../../lib/supabase'
import { hydrationStatus } from '../../lib/hydrate'
import { DB } from '../../data/processFlow'
import Icon from '../../lib/icons'
import { Badge } from '../ui'

// Cross-checks the documented schema against the database that is actually running.
//
// WHY THIS EXISTS
// Everything else in this module is read from the schema file and the source code. That
// is authoritative for what the system was BUILT to be, and it cannot see a table that
// was altered by hand in the Supabase SQL editor. This asks the live database directly.
//
// WHAT IT ASKS FOR, AND WHY THAT IS SAFE
// A row COUNT and nothing else — `head: true` means the request returns headers with no
// rows in the body, so no warehouse data crosses the network to draw this. It runs on
// the signed-in user's own token, so what it reports is what that user is permitted to
// see. That is the point: if you are a project-site user and this says you can count
// 779 inventory rows, you have just watched the row-level security policy hand them to
// you.
//
// It is a button rather than something that runs on page load: fifteen extra requests
// every time somebody opens a documentation page is rude to the database.

const REACHABLE = 'reachable'
const MISSING = 'missing'
const DENIED = 'denied'

export default function LiveProbe() {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [ranAt, setRanAt] = useState(null)

  const names = ['profiles', ...DB.tables.filter((t) => t.name !== 'profiles').map((t) => t.name)]

  const run = async () => {
    setBusy(true)
    const out = []
    for (const name of names) {
      try {
        const { count, error } = await supabase.from(name).select('*', { count: 'exact', head: true })
        if (error) {
          // PostgREST reports an unknown relation as 42P01; anything else that fails
          // here is a permission or connectivity problem, and the two must not be
          // reported as the same thing.
          const missing = error.code === '42P01' || /does not exist/i.test(error.message || '')
          out.push({ name, state: missing ? MISSING : DENIED, note: error.message })
        } else {
          out.push({ name, state: REACHABLE, count: count ?? 0 })
        }
      } catch (e) {
        out.push({ name, state: DENIED, note: e.message })
      }
    }
    setRows(out)
    setRanAt(new Date())
    setBusy(false)
  }

  if (!isConfigured)
    return (
      <div className="pf-probe">
        <div className="pf-probe-head">
          <div>
            <div className="pf-probe-title">Live database check</div>
            <p className="pf-probe-note">
              This build has no database connection configured, so there is nothing to check against.
              Everything else on this page is read from the schema file and the source code and is still accurate.
            </p>
          </div>
          <Badge tone="warn">Not configured</Badge>
        </div>
      </div>
    )

  const signedOut = hydrationStatus.source !== 'postgres'
  const reachable = rows?.filter((r) => r.state === REACHABLE) || []
  const withRows = reachable.filter((r) => r.count > 0)
  const empty = reachable.filter((r) => r.count === 0)
  const problems = rows?.filter((r) => r.state !== REACHABLE) || []

  // Reference tables hold the imported warehouse dataset. If EVERY one of them counts
  // zero, the database is almost certainly fine and the caller simply has no session —
  // row-level security answers "nothing" rather than "denied" to a request with no
  // identity, which looks identical to an empty database unless you say so. Without
  // this, a developer signed in through the demo fallback would read seventeen zeroes
  // and conclude the warehouse data had been lost.
  const refTables = DB.groups.reference
  const refReachable = reachable.filter((r) => refTables.includes(r.name))
  const noSessionSignature =
    rows !== null && refReachable.length === refTables.length && refReachable.every((r) => r.count === 0)

  return (
    <div className="pf-probe">
      <div className="pf-probe-head">
        <div>
          <div className="pf-probe-title">Live database check</div>
          <p className="pf-probe-note">
            Asks the running database for a row count on each of the {DB.tableCount} tables — a count only, no
            data. It runs on your own sign-in, so what it reports is what <b>your</b> account is allowed to see.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={busy}>
          <Icon name={busy ? 'clock' : 'search'} size={14} /> {busy ? 'Checking…' : rows ? 'Check again' : 'Run the check'}
        </button>
      </div>

      {signedOut && !rows && (
        <div className="pf-probe-warn">
          <Icon name="alert" size={13} /> The dataset did not load this session
          {hydrationStatus.error ? ` (${hydrationStatus.error})` : ''} — the check will most likely come back empty.
        </div>
      )}

      {noSessionSignature && (
        <div className="pf-probe-warn strong">
          <Icon name="alert" size={13} />
          <span>
            <b>Every reference table counted zero, which means this is a permissions result, not an empty
            database.</b> Those tables hold the imported warehouse dataset and are never empty in a working
            project. Row-level security answers &ldquo;no rows&rdquo; rather than &ldquo;denied&rdquo; when a
            request carries no identity, so a session-less sign-in — the developer demo login, or an expired
            token — produces exactly this. Sign in with a real Supabase account and run it again to see your
            actual access.
          </span>
        </div>
      )}

      {rows && (
        <>
          <div className="pf-probe-summary">
            <span><b>{withRows.length}</b> tables with rows</span>
            <span><b>{empty.length}</b> empty</span>
            <span className={problems.length ? 'bad' : ''}><b>{problems.length}</b> unreachable</span>
            <span className="pf-probe-when">checked {ranAt.toLocaleTimeString('en-PH')}</span>
          </div>

          <div className="pf-probe-grid">
            {rows.map((r) => {
              const doc = DB.tables.find((t) => t.name === r.name)
              return (
                <div key={r.name} className={`pf-probe-row st-${r.state}`}>
                  <code className="pf-probe-name">{r.name}</code>
                  <span className="pf-probe-count">
                    {r.state === REACHABLE
                      ? r.count.toLocaleString('en-PH')
                      : r.state === MISSING
                        ? 'not in the database'
                        : 'no access'}
                  </span>
                  <span className="pf-probe-grp">{doc ? doc.group : '—'}</span>
                </div>
              )
            })}
          </div>

          {problems.length > 0 && (
            <div className="pf-probe-warn">
              <Icon name="alert" size={13} /> {problems.length} table
              {problems.length > 1 ? 's' : ''} could not be counted. A table reported as
              &ldquo;not in the database&rdquo; means the schema file has been run somewhere this project has not —
              re-run <code>supabase/schema.sql</code>.
            </div>
          )}

          {/* Scoped to the transactional tables, and suppressed when the zeroes are a
              permissions result — otherwise this reassuring sentence would be printed
              over a row of reference tables where zero is genuinely wrong. */}
          {!noSessionSignature &&
            empty.some((r) => DB.groups.transactional.includes(r.name)) && (
              <p className="pf-probe-foot">
                An empty transactional table is expected and is the finding, not a fault: those tables were
                created empty on purpose and nothing in the application writes to them yet.
              </p>
            )}
        </>
      )}
    </div>
  )
}
