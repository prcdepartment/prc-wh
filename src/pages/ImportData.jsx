// Import Data — replace the live warehouse dataset from a monthly workbook.
//
// LAYOUT RULE FOR THIS PAGE (2026-10-07): it fits one desktop screen and the page
// itself never scrolls. It uses the house `.page-fit` shell (see the comment above
// that class in index.css, and src/pages/Inventory.jsx) — a fixed-height flex column
// whose one elastic row is a pair of cards that scroll INTERNALLY. Everything else is
// flex-shrink: 0 and must stay small enough that the elastic row keeps real height.
//
// And it carries NO explanatory prose. The earlier version wrapped every panel in a
// paragraph saying what it was for; that is a tutorial, not a tool, and it pushed the
// thing you actually came to look at below the fold. What survives is the data needed
// to answer one question — apply this workbook or not — and nothing else:
// the snapshot date, the new figures against the current ones, anything the reader
// distrusted about the file, the per-table before/after, the rows themselves, and the
// button. Adding a sentence here means removing one.
//
// Nothing is written until Apply: readSnapshotFile parses in the browser, stageSnapshot
// uploads to a holding table, and only import_commit() touches live data — in one
// transaction. The reading rules are shared with the command-line importer
// (src/lib/snapshotRules.js) so the two can never disagree about one file.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Icon from '../lib/icons'
import { num, peso, compact, fmtDate } from '../lib/format'
import { hydrationStatus } from '../lib/hydrate'
import {
  readSnapshotFile, stageSnapshot, commitSnapshot, discardSnapshot, listImports,
} from '../lib/importSnapshot'

// The five tables one workbook replaces, warehouse-owned first.
const DESTINATIONS = [
  ['inventory', 'Inventory'],
  ['ledger', 'Movement ledger'],
  ['safekeeping_soh', 'Safekeeping stock'],
  ['safekeeping_incoming', 'Safekeeping in'],
  ['safekeeping_outgoing', 'Safekeeping out'],
]

const pctChange = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null)

function Delta({ now, before }) {
  const p = pctChange(now, before)
  if (p === null) return <span className="imp-delta faint">new</span>
  if (Math.abs(p) < 0.05) return <span className="imp-delta faint">=</span>
  const up = p > 0
  return (
    <span className={`imp-delta ${up ? 'up' : 'down'}`}>
      <Icon name={up ? 'arrowUp' : 'arrowDown'} size={11} />{Math.abs(p).toFixed(1)}%
    </span>
  )
}

export default function ImportData() {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'

  const [snap, setSnap] = useState(null)       // parsed workbook, before anything is written
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
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
      setError('Not an .xlsx workbook.')
      return
    }
    setError(null); setResult(null); setSnap(null); setConfirming(false)
    try {
      setSnap(await readSnapshotFile(file, setBusy))
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
      setBusy('Staging')
      batchId = await stageSnapshot(snap, (done, total) => setProgress({ done, total }))
      setProgress(null)
      setBusy('Replacing the live data')
      setResult(await commitSnapshot(batchId))
      setSnap(null)
    } catch (e) {
      setError(e.message)
      // A staged batch that was never applied changed nothing, but leaving it behind
      // would clutter the history with a phantom import.
      if (batchId) await discardSnapshot(batchId).catch(() => {})
    } finally {
      setBusy(''); setProgress(null); refreshHistory()
    }
  }, [snap, refreshHistory])

  if (!isAdmin) {
    return (
      <div className="page-fit imp-page">
        <div className="card imp-denied">
          <Icon name="lock" size={26} />
          <b>Import Data is restricted to system administrators.</b>
          <span className="muted">The database enforces this independently of this screen.</span>
        </div>
      </div>
    )
  }

  const stats = snap?.stats
  const prev = snap?.previous

  // ---- reasons this import must not be applied ----
  //
  // A workbook can parse perfectly and still produce a dataset worse than the one it
  // replaces, because several columns are not IN the workbook: unit price, condition
  // class and bin address are carried forward from the current data, and trade, item
  // group and material type come from the item master. If either source is missing,
  // all of them arrive empty — the import succeeds and the dashboard quietly loses its
  // valuation and its trade filters.
  //
  // Not hypothetical: the first browser run of this page was against a session with no
  // database connection and produced 763 lines worth ₱136,013 instead of ₱102.7M, with
  // the trade column blank on every row. It looked like a success. Hard block.
  const blockers = []
  if (snap) {
    if (hydrationStatus.source !== 'postgres') {
      blockers.push('Live data not loaded — prices, condition classes and bin addresses cannot be carried forward. Sign out and back in.')
    }
    if (!snap.itemMasterRows) {
      blockers.push('Item master unavailable — every line would import with no trade or item group.')
    }
  }
  const blocked = blockers.length > 0

  return (
    <div className="page-fit imp-page">
      {/* ================= nothing chosen yet ================= */}
      {!snap && !result && (
        <>
          <div className="imp-bar">
            <span className="au-eyebrow">Live data</span>
            <b className="imp-bar-date tabular">{hydrationStatus.snapshotDate || '—'}</b>
            <div className="imp-bar-chips">
              {Object.entries(hydrationStatus.counts || {}).map(([k, v]) => (
                <span key={k} className="chip">{k.replace(/_/g, ' ')} <b className="faint">{num(v)}</b></span>
              ))}
            </div>
            <span className={`badge badge-${hydrationStatus.source === 'postgres' ? 'ok' : 'danger'}`}>
              <span className="dot" />{hydrationStatus.source === 'postgres' ? 'Loaded' : 'Not loaded'}
            </span>
          </div>

          {error && (
            <div className="imp-alert danger">
              <Icon name="alert" size={15} />
              <span>{error}</span>
              <button className="btn btn-sm" onClick={() => { setError(null); fileRef.current?.click() }}>Choose another</button>
            </div>
          )}

          <div className="imp-cols">
            <div
              className={`imp-drop ${dragging ? 'over' : ''} ${busy ? 'busy' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]) }}
              onClick={() => !busy && fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click() }}
            >
              <input ref={fileRef} type="file" accept=".xlsx" hidden
                onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
              {busy ? <span className="imp-spinner lg" aria-hidden="true" /> : <Icon name="upload" size={34} />}
              <div className="imp-drop-title">{busy ? `${busy}…` : 'Drop the inventory workbook'}</div>
              <code className="imp-drop-spec">MCC. PRC. WM. CW Taytay Inventory. YYYY MM DD.xlsx</code>
            </div>

            <div className="card inv-card">
              <div className="card-head"><div className="card-title">Import history</div></div>
              <div className="inv-scroll">
                {history.length === 0
                  ? <div className="empty">Nothing imported yet.</div>
                  : (
                    <table className="data">
                      <thead>
                        <tr><th>Applied</th><th>Snapshot</th><th>By</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {history.map((h) => (
                          <tr key={h.id} title={h.source_file || ''}>
                            <td>{h.applied_at ? fmtDate(new Date(h.applied_at)) : <span className="faint">—</span>}</td>
                            <td className="tabular">{h.snapshot_date || '—'}</td>
                            <td className="trunc">{h.created_by_email || '—'}</td>
                            <td>
                              <span className={`badge badge-${h.status === 'applied' ? 'ok' : h.status === 'failed' ? 'danger' : 'neutral'}`}>
                                <span className="dot" />{h.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= a workbook is open ================= */}
      {snap && (
        <>
          <div className="imp-hero">
            <div className="imp-hero-focus">
              <div className="imp-hero-date">
                <span className="au-eyebrow">Snapshot</span>
                <div className="imp-hero-day tabular">{snap.snapshotDate}</div>
              </div>
              <div className="imp-hero-say">
                <div className="imp-hero-title">
                  {num(stats.counts.inventory)} stock lines, worth {peso(stats.value)}
                </div>
                <div className="imp-hero-note">
                  was {num(prev.inventory)} lines <Delta now={stats.counts.inventory} before={prev.inventory} />
                  {' · '}was {peso(prev.value)} <Delta now={stats.value} before={prev.value} />
                  {' · '}{snap.split ? 'split' : 'merged'} workbook, by {snap.partition}
                </div>
                <div className="imp-hero-file" title={snap.fileName}>{snap.fileName}</div>
              </div>
            </div>
            <div className="imp-hero-strip">
              <div className="au-stat">
                <div className="au-stat-label">Units on hand</div>
                <div className="au-stat-value tabular">{compact(stats.units)}</div>
                <div className="au-stat-meta"><Delta now={stats.units} before={prev.units} /> vs live</div>
              </div>
              <div className="au-stat">
                <div className="au-stat-label">Movement rows</div>
                <div className="au-stat-value tabular">{num(stats.counts.ledger)}</div>
                <div className="au-stat-meta">{num(stats.ledgerIn)} in · {num(stats.ledgerOut)} out
                  {stats.droppedLedger > 0 && <> · {stats.droppedLedger} undated</>}</div>
              </div>
              <div className="au-stat">
                <div className="au-stat-label">Unpriced</div>
                <div className="au-stat-value tabular">{num(stats.unpricedLines)}</div>
                <div className="au-stat-meta">{stats.unpricedLines ? `${num(stats.unpricedUnits)} units at zero` : 'every line priced'}</div>
              </div>
              <div className="au-stat">
                <div className="au-stat-label">Placed on floor plan</div>
                <div className="au-stat-value tabular">{num(stats.placedLines)}</div>
                <div className="au-stat-meta">{snap.locationCarried ? 'carried forward' : "this workbook's sheet"}</div>
              </div>
            </div>
          </div>

          {blocked && (
            <div className="imp-alert danger">
              <Icon name="alert" size={15} />
              <span>{blockers.join(' ')}</span>
            </div>
          )}

          <div className="imp-cols narrow-left">
            <div className="card inv-card">
              <div className="card-head">
                <div className="card-title">What changes</div>
                {snap.warnings.length > 0 && (
                  <span className="chip imp-chip-warn">
                    <Icon name="alert" size={12} />{snap.warnings.length}
                  </span>
                )}
              </div>
              <div className="inv-scroll">
                <table className="data imp-dest">
                  <thead>
                    <tr><th>Table</th><th className="num">Now</th><th className="num">After</th><th className="num" /></tr>
                  </thead>
                  <tbody>
                    {DESTINATIONS.map(([key, label]) => (
                      <tr key={key}>
                        <td>{label}</td>
                        <td className="num tabular faint">{num(prev.counts[key] ?? 0)}</td>
                        <td className="num tabular"><b>{num(stats.counts[key] ?? 0)}</b></td>
                        <td className="num"><Delta now={stats.counts[key] ?? 0} before={prev.counts[key] ?? 0} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* The reader's own complaints about the source file. It fell back and
                    carried on, so this is not a failure — but a figure produced from a
                    column the reader rejected should never be read without it. */}
                {snap.warnings.length > 0 && (
                  <ul className="imp-warnlist">
                    {snap.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
              </div>
            </div>

            <div className="card inv-card">
              <div className="card-head">
                <div className="card-title">Stock lines as they would be stored</div>
                <span className="chip">{num(stats.counts.inventory)}</span>
              </div>
              <div className="inv-scroll">
                <table className="data imp-preview">
                  <thead>
                    <tr>
                      <th>Code</th><th>Description</th><th>Specific</th>
                      <th>UOM</th><th className="num">SOH</th><th className="num">Unit Price</th><th>Bin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.inventory.map((r) => (
                      <tr key={r.id}>
                        <td className="tabular">{r.itemCode}</td>
                        <td className="trunc" title={r.description}>{r.description}</td>
                        <td className="trunc" title={r.detailedDescription}>{r.detailedDescription}</td>
                        <td>{r.uom}</td>
                        <td className="num tabular">{num(r.totalQty)}</td>
                        <td className="num tabular">{r.unitPrice ? peso(r.unitPrice, { decimals: 2 }) : <span className="faint">—</span>}</td>
                        <td className="tabular">{r.location || <span className="faint">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="imp-applybar">
            {busy ? (
              <>
                <span className="imp-spinner" aria-hidden="true" />
                <b>{busy}…</b>
                {progress && (
                  <>
                    <span className="imp-bar-track"><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></span>
                    <span className="muted tabular">{progress.done}/{progress.total}</span>
                  </>
                )}
              </>
            ) : confirming ? (
              <>
                <b className="imp-ask">
                  Replace {num(prev.inventory)} lines with {num(stats.counts.inventory)} and set the working date to {snap.snapshotDate}?
                </b>
                <div className="imp-actions">
                  <button className="btn btn-primary" onClick={apply}><Icon name="check" size={15} /> Yes, replace</button>
                  <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                {error
                  ? <b className="imp-ask danger-text"><Icon name="alert" size={14} /> {error}</b>
                  : <span className="muted">Replaces five tables in one transaction. No undo.</span>}
                <div className="imp-actions">
                  <button className="btn btn-primary" disabled={blocked} onClick={() => setConfirming(true)}>
                    <Icon name="check" size={15} /> Apply to the live site
                  </button>
                  <button className="btn" onClick={() => { setSnap(null); setError(null) }}>Discard</button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ================= applied ================= */}
      {result && (
        <>
          <div className="imp-bar ok">
            <Icon name="approve" size={18} />
            <b>Live data is now the {String(result.snapshot_date).slice(0, 10)} snapshot.</b>
            <div className="imp-bar-chips">
              {Object.entries(result.counts || {}).map(([k, v]) => (
                <span key={k} className="chip">{k.replace(/_/g, ' ')} <b className="faint">{num(v)}</b></span>
              ))}
            </div>
            <button className="btn btn-sm" onClick={() => setResult(null)}>
              <Icon name="upload" size={14} /> Import another
            </button>
          </div>
          <div className="card inv-card">
            <div className="card-head"><div className="card-title">Import history</div></div>
            <div className="inv-scroll">
              <table className="data">
                <thead>
                  <tr><th>Applied</th><th>Snapshot</th><th>Source file</th><th>By</th><th className="num">Lines</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>{h.applied_at ? fmtDate(new Date(h.applied_at)) : <span className="faint">—</span>}</td>
                      <td className="tabular">{h.snapshot_date || '—'}</td>
                      <td className="trunc" title={h.source_file}>{h.source_file || '—'}</td>
                      <td className="trunc">{h.created_by_email || '—'}</td>
                      <td className="num tabular">{num(h.summary?.counts?.inventory ?? 0)}</td>
                      <td>
                        <span className={`badge badge-${h.status === 'applied' ? 'ok' : h.status === 'failed' ? 'danger' : 'neutral'}`}>
                          <span className="dot" />{h.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
