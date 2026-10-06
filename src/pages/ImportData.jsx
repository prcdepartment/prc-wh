// Import Data — replace the live warehouse dataset from a monthly workbook.
//
// WHAT THIS SCREEN IS FOR. Every figure on every other page comes from one Central
// Warehouse inventory workbook. Until now, moving the site to a new month's workbook
// needed a developer with a checkout, node and the Supabase SQL editor, so the live
// data sat still between sessions. This page is the same operation, done by the
// administrator who actually receives the file.
//
// WHY IT IS THREE STEPS AND NOT ONE BUTTON. The last step is irreversible and it
// replaces the warehouse's own numbers. So the file is READ first and nothing is
// written: the page shows what the workbook says, what it would change, and every
// complaint the reader had about it, and only then offers to apply it. Most of the
// mistakes this guards against are not crashes — they are a misread column that still
// imports perfectly and quietly halves the valuation. Those show up in the comparison
// against the current data, which is why that comparison is the largest thing here.
//
// The reading rules themselves are in src/lib/snapshotRules.js, shared with
// scripts/import-snapshot.mjs so the browser and the command line cannot disagree.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Card, Badge, DataTable } from '../components/ui'
import Icon from '../lib/icons'
import { num, peso, fmtDate } from '../lib/format'
import { hydrationStatus } from '../lib/hydrate'
import {
  readSnapshotFile, stageSnapshot, commitSnapshot, discardSnapshot, listImports,
} from '../lib/importSnapshot'

// The five tables one workbook replaces, in the order the page lists them: the
// warehouse's own stock first, then its movement, then the three project-owned sheets.
const DESTINATIONS = [
  ['inventory', 'Inventory', 'Warehouse-owned stock on hand'],
  ['ledger', 'Movement ledger', "The warehouse's own receipts and releases"],
  ['safekeeping_soh', 'Safekeeping stock', 'Project-owned material held here'],
  ['safekeeping_incoming', 'Safekeeping in', 'Material received for a project'],
  ['safekeeping_outgoing', 'Safekeeping out', 'Material pulled out by a project'],
]

const pctChange = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null)

/** A signed percentage, or an em dash where there is nothing to compare against. */
function Delta({ now, before, suffix = '' }) {
  const p = pctChange(now, before)
  if (p === null) return <span className="imp-delta faint">new</span>
  if (Math.abs(p) < 0.05) return <span className="imp-delta faint">unchanged</span>
  const up = p > 0
  return (
    <span className={`imp-delta ${up ? 'up' : 'down'}`}>
      <Icon name={up ? 'arrowUp' : 'arrowDown'} size={12} />
      {Math.abs(p).toFixed(1)}%{suffix}
    </span>
  )
}

export default function ImportData() {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'

  const [snap, setSnap] = useState(null)       // the parsed workbook, before anything is written
  const [busy, setBusy] = useState('')         // what the page is doing right now, in words
  const [progress, setProgress] = useState(null) // { done, total } while staging
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)   // what the database reported after a commit
  const [confirming, setConfirming] = useState(false)
  const [history, setHistory] = useState([])
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  const refreshHistory = useCallback(() => {
    if (!isAdmin) return
    listImports().then(setHistory).catch(() => setHistory([]))
  }, [isAdmin])

  useEffect(() => { refreshHistory() }, [refreshHistory])

  const onFile = useCallback(async (file) => {
    if (!file) return
    if (!/\.xlsx$/i.test(file.name)) {
      setError('That is not an .xlsx workbook. The warehouse sends the snapshot as a modern Excel file; an .xls or .csv cannot be read.')
      return
    }
    setError(null); setResult(null); setSnap(null); setConfirming(false)
    try {
      const parsed = await readSnapshotFile(file, setBusy)
      setSnap(parsed)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }, [])

  const apply = useCallback(async () => {
    if (!snap) return
    setConfirming(false)
    setError(null)
    let batchId = null
    try {
      setBusy('Staging the parsed rows')
      batchId = await stageSnapshot(snap, (done, total) => setProgress({ done, total }))
      setProgress(null)
      setBusy('Replacing the live data')
      const res = await commitSnapshot(batchId)
      setResult(res)
      setSnap(null)
    } catch (e) {
      setError(e.message)
      // A staged batch that was never applied has changed nothing, but leaving it
      // behind would clutter the history with phantom imports.
      if (batchId) await discardSnapshot(batchId).catch(() => {})
    } finally {
      setBusy(''); setProgress(null); refreshHistory()
    }
  }, [snap, refreshHistory])

  // ---- not an administrator -------------------------------------------------
  if (!isAdmin) {
    return (
      <>
        <div className="section-note">Replace the warehouse dataset from a monthly workbook</div>
        <Card className="mt" title="Restricted" icon="lock">
          <p className="imp-prose">
            Importing replaces the stock, movement and safekeeping figures that every other
            page in this system reads. It is limited to system administrators, and the
            database enforces that independently of this screen — so there is nothing to
            be gained by reaching the page another way.
          </p>
          <p className="imp-prose">
            If you have a new Central Warehouse workbook, send it to an administrator.
          </p>
        </Card>
      </>
    )
  }

  const stats = snap?.stats
  const prev = snap?.previous

  // ---- reasons this import must not be applied ----
  //
  // A workbook can parse perfectly and still produce a dataset that is worse than the
  // one it replaces, because several columns are not IN the workbook: unit price,
  // condition class and bin address are carried forward from the current data, and
  // trade, item group and material type come from the item master. If either source
  // is missing, every one of those arrives empty — the import succeeds, the dashboard
  // loses its valuation and its trade filters, and nothing anywhere says why.
  //
  // This was not hypothetical. The first browser run of this page was against a
  // session with no database connection, and it produced 763 lines worth ₱136,013
  // instead of ₱102.7M, with the trade column blank on every row. It looked like a
  // successful import. So these are hard blocks, not warnings.
  const blockers = []
  if (snap) {
    if (hydrationStatus.source !== 'postgres') {
      blockers.push(
        'The live data is not loaded in this session, so there is nothing to carry unit prices, ' +
        'condition classes and bin addresses forward from. Applying now would replace priced, ' +
        'located stock with unpriced, unplaced stock. Sign out and back in, then try again.')
    }
    if (!snap.itemMasterRows) {
      blockers.push(
        'The item master could not be read, so no line in this workbook has a trade, item group ' +
        'or material type. Every chart and filter that groups by trade would come back empty.')
    }
  }
  const blocked = blockers.length > 0

  return (
    <>
      <div className="section-note">Replace the warehouse dataset from a monthly workbook</div>

      {/* Where the live data stands right now. Read first because every figure below
          is a comparison against it. */}
      <Card className="mt" title="Live data" icon="warehouse"
        right={<Badge tone={hydrationStatus.source === 'postgres' ? 'ok' : 'danger'}>
          {hydrationStatus.source === 'postgres' ? 'Loaded' : 'Not loaded'}
        </Badge>}>
        <div className="imp-live">
          <div>
            <div className="imp-live-label">Current snapshot</div>
            <div className="imp-live-value">{hydrationStatus.snapshotDate || '—'}</div>
            <div className="muted imp-live-note">
              {hydrationStatus.snapshotSource
                ? <>from <b>{hydrationStatus.snapshotSource}</b></>
                : 'The date every "days since" figure in the app is measured from.'}
            </div>
          </div>
          <div className="imp-live-counts">
            {Object.entries(hydrationStatus.counts || {}).map(([k, v]) => (
              <span key={k} className="chip">{k.replace(/_/g, ' ')} <b className="faint">{num(v)}</b></span>
            ))}
          </div>
        </div>
      </Card>

      {/* ---- the file ---- */}
      {!snap && !result && (
        <div
          className={`imp-drop mt ${dragging ? 'over' : ''} ${busy ? 'busy' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]) }}
          onClick={() => !busy && fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click() }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            hidden
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }}
          />
          <Icon name="upload" size={30} />
          <div className="imp-drop-title">{busy || 'Drop the inventory workbook here, or click to choose one'}</div>
          <div className="imp-drop-note">
            A Central Warehouse Taytay inventory export — the file named
            <code> MCC. PRC. WM. CW Taytay Inventory. YYYY MM DD.xlsx</code>. Nothing is written
            until you have seen what it says.
          </div>
        </div>
      )}

      {error && (
        <Card className="mt" title="The workbook could not be used" icon="alert" iconColor="var(--brand-red)">
          <p className="imp-prose">{error}</p>
          {/* No second file input here on purpose — the drop zone above is still on
              screen and owns the one `fileRef`. Two inputs sharing a ref means only
              the last one mounted is reachable, which is a bug waiting to be written. */}
          <button className="btn btn-sm" onClick={() => { setError(null); fileRef.current?.click() }}>
            <Icon name="upload" size={14} /> Try another file
          </button>
        </Card>
      )}

      {/* ---- what the workbook says ---- */}
      {snap && (
        <>
          <div className="imp-hero mt">
            <div className="imp-hero-focus">
              <div className="imp-hero-date">
                <span className="au-eyebrow">Snapshot</span>
                <div className="imp-hero-day">{snap.snapshotDate}</div>
                <div className="imp-hero-file" title={snap.fileName}>{snap.fileName}</div>
              </div>
              <div className="imp-hero-say">
                <div className="imp-hero-title">
                  {num(stats.counts.inventory)} warehouse stock lines, worth {peso(stats.value)}
                </div>
                <div className="imp-hero-note">
                  Against the {num(prev.inventory)} lines and {peso(prev.value)} on the site now
                  {' '}(<Delta now={stats.counts.inventory} before={prev.inventory} /> lines,
                  {' '}<Delta now={stats.value} before={prev.value} /> value).
                  {' '}Warehouse and safekeeping were separated by the{' '}
                  <b>{snap.partition}</b>, from a <b>{snap.split ? 'split' : 'merged'}</b> workbook.
                </div>
              </div>
            </div>
            <div className="imp-hero-strip">
              <div className="au-stat">
                <div className="au-stat-label">Units on hand</div>
                <div className="au-stat-value tabular">{num(stats.units)}</div>
                <div className="au-stat-meta"><Delta now={stats.units} before={prev.units} /> against the live data</div>
              </div>
              <div className="au-stat">
                <div className="au-stat-label">Movement rows</div>
                <div className="au-stat-value tabular">{num(stats.counts.ledger)}</div>
                <div className="au-stat-meta">
                  {num(stats.ledgerIn)} in, {num(stats.ledgerOut)} out
                  {stats.droppedLedger > 0 && <> · {stats.droppedLedger} undated, dropped</>}
                </div>
              </div>
              <div className="au-stat">
                <div className="au-stat-label">Priced</div>
                <div className="au-stat-value tabular">
                  {num(stats.counts.inventory - stats.unpricedLines)}
                </div>
                <div className="au-stat-meta">
                  {stats.unpricedLines
                    ? <>{stats.unpricedLines} lines have no price and count as zero</>
                    : <>every line carries a unit price</>}
                </div>
              </div>
              <div className="au-stat">
                <div className="au-stat-label">Placed on the floor plan</div>
                <div className="au-stat-value tabular">{num(stats.placedLines)}</div>
                <div className="au-stat-meta">
                  {snap.locationCarried
                    ? 'carried forward — this file has no location sheet'
                    : "read from this workbook's own location sheet"}
                </div>
              </div>
            </div>
          </div>

          {/* Conditions under which applying would make the data worse. Above the
              warnings, because a warning is about the workbook and these are about
              this session — and these are the ones that take the button away. */}
          {blocked && (
            <Card className="mt imp-block" title="This import cannot be applied" icon="alert"
              iconColor="var(--brand-red)"
              sub="The workbook read fine — what is missing is the reference data it has to be combined with">
              <ul className="imp-warnlist">
                {blockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </Card>
          )}

          {/* The reader's own complaints about the source file. Above the detail,
              because a figure produced from a column the reader rejected is not a
              figure anyone should act on without knowing that. */}
          {snap.warnings.length > 0 && (
            <Card className="mt imp-warn" title={`${snap.warnings.length} problem${snap.warnings.length > 1 ? 's' : ''} with this workbook`}
              icon="alert" iconColor="var(--orange)"
              sub="The import fell back and carried on — these are worth raising with the warehouse team">
              <ul className="imp-warnlist">
                {snap.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </Card>
          )}

          <div className="grid grid-2 mt">
            <Card title="What would be replaced" icon="transfer"
              sub="Each of these tables is emptied and refilled from this workbook">
              {/* .table-wrap, like DataTable uses: below ~500px this table is wider
                  than the card and would otherwise push the whole page sideways. */}
              <div className="table-wrap">
              <table className="data imp-dest">
                <thead>
                  <tr><th>Table</th><th className="num">Now</th><th className="num">After</th><th /></tr>
                </thead>
                <tbody>
                  {DESTINATIONS.map(([key, label, note]) => {
                    const after = stats.counts[key] ?? 0
                    const before = prev.counts[key] ?? 0
                    return (
                      <tr key={key}>
                        <td><b>{label}</b><div className="muted imp-dest-note">{note}</div></td>
                        <td className="num tabular">{num(before)}</td>
                        <td className="num tabular"><b>{num(after)}</b></td>
                        <td className="num"><Delta now={after} before={before} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
              <div className="divider" />
              <p className="imp-prose imp-prose-sm">
                Nothing else is touched. The item master, the project list, the delivery
                tracker and the warehouse audit come from their own workbooks and keep the
                rows they already have. Movements, reservations and requests that staff have
                entered are kept and re-linked to the new stock lines by item code.
              </p>
            </Card>

            <Card title="Read from this file" icon="doc"
              sub={`${snap.split ? 'Split' : 'Merged'} layout · ownership decided by ${snap.partition}`}>
              <dl className="imp-facts">
                <div><dt>Snapshot date</dt><dd>{snap.snapshotDate}<span className="muted"> — read from the SOH sheet's "As of" cell</span></dd></div>
                <div><dt>Condition class</dt><dd>{stats.noConditionClass === 0
                  ? 'on every line'
                  : `missing on ${num(stats.noConditionClass)} lines`}</dd></div>
                <div><dt>Unpriced stock</dt><dd>{stats.unpricedLines === 0
                  ? 'none'
                  : `${num(stats.unpricedLines)} lines holding ${num(stats.unpricedUnits)} units`}</dd></div>
                <div><dt>Bin addresses</dt><dd>{num(stats.placedLines)} of {num(stats.counts.inventory)} lines
                  {stats.multiBinLines > 0 && <>, {num(stats.multiBinLines)} across several bays</>}</dd></div>
                <div><dt>Areas used</dt><dd>{Object.entries(stats.byArea).sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => `${k} ${v}`).join(', ') || '—'}</dd></div>
                <div><dt>Safekeeping projects</dt><dd>
                  {stats.unmatchedProjects.length === 0
                    ? 'all matched to a project code'
                    : `${stats.unmatchedProjects.length} name${stats.unmatchedProjects.length > 1 ? 's' : ''} with no code in the master: ${stats.unmatchedProjects.join(', ')}`}
                </dd></div>
              </dl>
            </Card>
          </div>

          <Card className="mt" title="The first stock lines, as they would be stored" icon="inventory"
            sub="Check a few against the workbook before applying — a column read one place to the left still imports">
            <DataTable
              pageSize={8}
              columns={[
                { key: 'itemCode', label: 'Item Code', width: 110 },
                { key: 'description', label: 'Description' },
                { key: 'detailedDescription', label: 'Specific Description' },
                { key: 'uom', label: 'UOM', width: 70 },
                { key: 'totalQty', label: 'SOH', num: true, render: (r) => num(r.totalQty) },
                { key: 'unitPrice', label: 'Unit Price', num: true, render: (r) => (r.unitPrice ? peso(r.unitPrice, { decimals: 2 }) : <span className="faint">none</span>) },
                { key: 'tradeL1', label: 'Trade' },
                { key: 'location', label: 'Bin', render: (r) => r.location || <span className="faint">—</span> },
              ]}
              rows={snap.inventory}
            />
          </Card>

          {/* ---- apply ---- */}
          <Card className="mt imp-apply" title="Apply this import" icon="upload">
            {!confirming && !busy && (
              <>
                <p className="imp-prose">
                  {blocked
                    ? 'Applying is disabled while the conditions above hold. The workbook itself is ' +
                      'fine — nothing is wrong with the file, and the same upload will work once the ' +
                      'session has the reference data it needs.'
                    : 'Applying replaces all five tables above in one step. The database does the whole ' +
                      'swap inside a single transaction, so either every table is replaced or nothing ' +
                      'changes — there is no state where the warehouse has stock but no movement. There ' +
                      'is no undo, though: the previous snapshot is not kept anywhere once this runs.'}
                </p>
                <div className="wrap-gap">
                  <button className="btn btn-primary" disabled={blocked} onClick={() => setConfirming(true)}>
                    <Icon name="check" size={15} /> Apply to the live site
                  </button>
                  <button className="btn" onClick={() => { setSnap(null); setError(null) }}>
                    <Icon name="close" size={15} /> Discard this file
                  </button>
                </div>
              </>
            )}

            {confirming && (
              <>
                <p className="imp-prose">
                  This will replace the live warehouse data for every user, and set the system's
                  working date to <b>{snap.snapshotDate}</b>. {num(prev.inventory)} stock lines
                  become {num(stats.counts.inventory)}, and the valuation moves from{' '}
                  {peso(prev.value)} to {peso(stats.value)}.
                </p>
                <div className="wrap-gap">
                  <button className="btn btn-primary" onClick={apply}>
                    <Icon name="check" size={15} /> Yes, replace the live data
                  </button>
                  <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
                </div>
              </>
            )}

            {busy && (
              <div className="imp-busy">
                <div className="imp-busy-row">
                  <span className="imp-spinner" aria-hidden="true" />
                  <b>{busy}…</b>
                </div>
                {progress && (
                  <>
                    <div className="imp-bar"><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
                    <div className="muted">{progress.done} of {progress.total} batches uploaded</div>
                  </>
                )}
                <div className="muted imp-prose-sm">
                  Leave this page open until it finishes. Nothing live changes until the last step.
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ---- after ---- */}
      {result && (
        <Card className="mt" title="Import applied" icon="approve" iconColor="var(--green)"
          right={<Badge tone="ok">Live</Badge>}>
          <p className="imp-prose">
            The live data is now the <b>{String(result.snapshot_date).slice(0, 10)}</b> snapshot, and
            every page has been reloaded from the database. The system's working date moved with it,
            so "days since last movement" is measured from that date rather than the previous one.
          </p>
          <div className="wrap-gap">
            {Object.entries(result.counts || {}).map(([k, v]) => (
              <span key={k} className="chip">{k.replace(/_/g, ' ')} <b className="faint">{num(v)}</b></span>
            ))}
          </div>
          <div className="divider" />
          <button className="btn btn-sm" onClick={() => setResult(null)}>
            <Icon name="upload" size={14} /> Import another workbook
          </button>
        </Card>
      )}

      {/* ---- history ---- */}
      <Card className="mt" title="Import history" icon="clock"
        sub="Who replaced the dataset, when, and with what">
        {history.length === 0 ? (
          <div className="empty">No workbook has been imported through this page yet.</div>
        ) : (
          <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Applied</th><th>Snapshot</th><th>Source file</th><th>By</th>
                <th className="num">Lines</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.applied_at ? fmtDate(new Date(h.applied_at)) : <span className="faint">—</span>}</td>
                  <td className="tabular">{h.snapshot_date || '—'}</td>
                  <td className="imp-hist-file" title={h.source_file}>{h.source_file || '—'}</td>
                  <td>{h.created_by_email || '—'}</td>
                  <td className="num tabular">{num(h.summary?.counts?.inventory ?? 0)}</td>
                  <td><Badge tone={h.status === 'applied' ? 'ok' : h.status === 'failed' ? 'danger' : 'neutral'}>
                    {h.status === 'applied' ? 'Applied' : h.status === 'failed' ? 'Failed' : 'Staged'}
                  </Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      <Card className="mt" title="If something looks wrong" icon="help">
        <p className="imp-prose">
          A workbook that will not open at all usually is not the right file — the three
          warehouse exports look alike by name, and only the inventory one has the SOH sheet
          this page needs. The delivery tracker and the audit report are still imported from
          the command line.
        </p>
        <p className="imp-prose">
          A workbook that opens but reports a problem has a column the reader did not trust.
          The commonest is the ownership column (<i>Category</i>, reading "Central Warehouse
          Inventory" or "Safekeeping Inventory") being filled down the whole sheet, which would
          hand the warehouse's own stock to somebody else. When that happens the reader falls
          back to Project Origin and says so, and the figures above are still the right ones —
          but the workbook itself should be corrected for next month.
        </p>
        <p className="imp-prose">
          A message about the database not being up to date means{' '}
          <code>supabase/schema.sql</code> needs re-running in the Supabase SQL editor. That is
          always safe and is always the whole answer.
        </p>
      </Card>
    </>
  )
}
