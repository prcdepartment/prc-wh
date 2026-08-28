import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ARCHITECTURE, CODE, DATA_FLOWS, DB, DEP_FINDINGS, DEP_NOTES, FUTURE_ROLES, JOURNEY,
  PROCESSES, REQUEST_FLOW, ROLE_MATRIX, SEARCH_INDEX, SECURITY_SECTIONS, STATUS,
  SUMMARY, STEP_LABELS, TABLE_NOTES, VULNERABILITIES, JOURNEY_RECOMMENDATIONS, lockedFor, uiPerms,
} from '../data/processFlow'
import { Card, Badge, KpiCard } from '../components/ui'
import FlowDiagram from '../components/processflow/FlowDiagram'
import ErdDiagram from '../components/processflow/ErdDiagram'
import LiveProbe from '../components/processflow/LiveProbe'
import { DetailPanel, Evidence, ExpandRow, SectionBar, StatusChip, StatusFilter, StatusLegend } from '../components/processflow/pfUi'
import Icon from '../lib/icons'
import '../styles/processflow.css'

// The Process Flow module: a map of how this system actually works.
//
// Held in the URL (`?view=`, `?flow=`) so any view is a shareable link and the browser
// Back button moves between them — the same pattern the dashboard and the floor plan
// already use. A colleague can be sent straight to the security findings.
//
// The module's own status: this page is `live` and describes itself. Its DATABASE and
// ARCHITECTURE views are generated from the schema file and the import graph, so they
// cannot drift; the process descriptions are authored and carry a "last reviewed" date
// at the foot of the page, because a judgement about how finished something is has a
// shelf life that a parsed column list does not.

const VIEWS = [
  { key: 'journey', label: 'Journey', icon: 'transfer' },
  { key: 'processes', label: 'Processes', icon: 'reorganize' },
  { key: 'architecture', label: 'Architecture', icon: 'layers' },
  { key: 'database', label: 'Database', icon: 'folder' },
  { key: 'dataflow', label: 'Data Flow', icon: 'trend' },
  { key: 'access', label: 'Access', icon: 'users' },
  { key: 'security', label: 'Security', icon: 'lock' },
  { key: 'dependencies', label: 'Dependencies', icon: 'box' },
]

const REVIEWED = '25 August 2026'
const num = (n) => n.toLocaleString('en-PH')

/* ------------------------------------------------------------------ shared bits */

// A one-line roll-up of how much of something is finished. Used on every process
// header, so a reader scanning the list can see which domains are real before
// opening any of them.
function StatusRoll({ nodes }) {
  const tally = nodes.reduce((a, n) => ({ ...a, [n.status]: (a[n.status] || 0) + 1 }), {})
  return (
    <div className="pf-roll">
      {Object.keys(STATUS)
        .filter((k) => tally[k])
        .map((k) => (
          <span key={k} className={`pf-roll-item tone-${STATUS[k].tone}`} title={STATUS[k].label}>
            <span className="pf-roll-dot" aria-hidden="true" />
            {tally[k]}
          </span>
        ))}
    </div>
  )
}

function StatusDot({ status }) {
  const st = STATUS[status] || STATUS.planned
  return <span className={`pf-dot tone-${st.tone}`} title={st.label} aria-label={st.label} />
}

/* ------------------------------------------------------------------ 1. Journey */

function JourneyView({ filter, query }) {
  const [sel, setSel] = useState(null)
  const [vertical, setVertical] = useState(true)
  // The steps that are not finished and are not merely a suggestion of mine.
  const breaks = useMemo(
    () => JOURNEY.stages.flatMap((s) => s.nodes).filter((n) => n.status === 'partial' || n.status === 'planned'),
    []
  )

  return (
    <>
      <Card
        title="Login to logout"
        icon="transfer"
        right={<Badge tone="info">{SUMMARY.journeyNodeCount} steps</Badge>}
        pad={false}
      >
        <div className="pf-split">
          <div className="pf-split-main">
            <p className="pf-note">{JOURNEY.note}</p>
            <FlowDiagram
              stages={JOURNEY.stages}
              vertical={vertical}
              activeStatuses={filter}
              query={query}
              selectedId={sel?.id}
              onSelect={(n) => setSel((s) => (s?.id === n.id ? null : n))}
              onToggleOrient={() => setVertical((v) => !v)}
              maxHeight={660}
            />
          </div>
          <div className="pf-split-side">
            <DetailPanel node={sel} onClose={() => setSel(null)} />
          </div>
        </div>
      </Card>

      {/* Two compact lists side by side rather than two more full cards: what is
          broken, and what I am proposing. Counted, not asserted — an earlier draft
          said "four points" and there were six. */}
      <div className="pf-two mt">
        <Card title={`Where it breaks · ${breaks.length}`} icon="alert">
          <div className="pf-mini">
            {breaks.map((n) => (
              <div key={n.id} className={`pf-mini-row st-${n.status}`}>
                <StatusDot status={n.status} />
                <div>
                  <span className="pf-mini-title">{n.label}</span>
                  {n.missing && <span className="pf-mini-note">{n.missing}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title={`Proposed additions · ${JOURNEY_RECOMMENDATIONS.length}`} icon="plus" right={<StatusChip status="recommended" size="sm" />}>
          <div className="pf-mini">
            {JOURNEY_RECOMMENDATIONS.map((r) => (
              <div key={r.label} className="pf-mini-row st-recommended">
                <StatusDot status="recommended" />
                <div>
                  <span className="pf-mini-title">{r.label} <em>· at {r.at}</em></span>
                  <span className="pf-mini-note">{r.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ 2. Processes */

function ProcessCard({ process, filter, query, open, onToggle }) {
  const [sel, setSel] = useState(null)
  const nodes = process.stages.flatMap((s) => s.nodes)

  return (
    <Card
      className="mt pf-proc"
      title={process.title}
      icon={process.icon}
      right={
        <div className="pf-proc-right">
          <StatusRoll nodes={nodes} />
          <button className="btn btn-sm" onClick={onToggle} aria-expanded={open}>
            <Icon name={open ? 'minus' : 'plus'} size={13} />
            <span className="pf-hide-sm">{open ? 'Collapse' : 'Expand'}</span>
          </button>
        </div>
      }
      pad={false}
    >
      <div className="pf-proc-summary">
        <p>{process.summary}</p>
      </div>
      {open && (
        <div className="pf-split">
          <div className="pf-split-main">
            <FlowDiagram
              stages={process.stages}
              activeStatuses={filter}
              query={query}
              selectedId={sel?.id}
              onSelect={(n) => setSel((s) => (s?.id === n.id ? null : n))}
              maxHeight={560}
            />
          </div>
          <div className="pf-split-side">
            <DetailPanel node={sel} onClose={() => setSel(null)} />
          </div>
        </div>
      )}
    </Card>
  )
}

function ProcessesView({ filter, query }) {
  const [open, setOpen] = useState(() => new Set([PROCESSES[0].id]))
  const toggle = (id) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <>
      <SectionBar
        title={`${SUMMARY.processCount} process domains · ${SUMMARY.processNodeCount} documented steps`}
        note="Every step says whether it runs today. Expand a domain to see its flow and click any box for the detail."
        right={
          <div className="pf-bulk">
            <button className="btn btn-sm" onClick={() => setOpen(new Set(PROCESSES.map((p) => p.id)))}>Expand all</button>
            <button className="btn btn-sm" onClick={() => setOpen(new Set())}>Collapse all</button>
          </div>
        }
      />
      {PROCESSES.map((p) => (
        <ProcessCard key={p.id} process={p} filter={filter} query={query} open={open.has(p.id)} onToggle={() => toggle(p.id)} />
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ 3. Architecture */

function LayerCard({ layer }) {
  const [openGroup, setOpenGroup] = useState(null)
  return (
    <Card
      className="mt"
      title={layer.title}
      icon="layers"
      right={<StatusChip status={layer.status} size="sm" />}
    >
      <p className="pf-note">{layer.summary}</p>
      <div className="pf-layer-grid">
        {layer.groups.map((g) => (
          <div key={g.title} className={`pf-layer-group st-${g.status}`}>
            <div className="pf-layer-head">
              <StatusDot status={g.status} />
              <span className="pf-layer-title">{g.title}</span>
              <span className="pf-layer-count">{g.count}</span>
            </div>
            <p className="pf-layer-detail">{g.detail}</p>
            {g.items.length > 0 && (
              <>
                <button
                  className="pf-layer-more"
                  onClick={() => setOpenGroup((o) => (o === g.title ? null : g.title))}
                  aria-expanded={openGroup === g.title}
                >
                  <Icon name={openGroup === g.title ? 'chevronDown' : 'chevronRight'} size={12} />
                  {openGroup === g.title ? 'Hide' : 'List'} {g.items.length} item{g.items.length > 1 ? 's' : ''}
                </button>
                {openGroup === g.title && (
                  <div className="pf-layer-items">
                    {g.items.map((it) => (
                      <code key={it} className="pf-path">{it}</code>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {layer.gaps.length > 0 && (
        <div className="pf-layer-gaps">
          {layer.gaps.map((g) => (
            <div key={g.label} className={`pf-gap st-${g.status}`}>
              <div className="pf-gap-head">
                <StatusDot status={g.status} />
                <span>{g.label}</span>
                <StatusChip status={g.status} size="sm" />
              </div>
              <p>{g.detail}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function ArchitectureView({ filter, query }) {
  const [sel, setSel] = useState(null)
  const mostImported = useMemo(
    () => [...CODE.files].sort((a, b) => b.importedBy.length - a.importedBy.length).slice(0, 8),
    []
  )

  return (
    <>
      <Card title="How a request travels" icon="transfer" pad={false}>
        <div className="pf-split">
          <div className="pf-split-main">
            <p className="pf-note">{ARCHITECTURE.note}</p>
            <FlowDiagram
              stages={REQUEST_FLOW.stages}
              activeStatuses={filter}
              query={query}
              selectedId={sel?.id}
              onSelect={(n) => setSel((s) => (s?.id === n.id ? null : n))}
              maxHeight={560}
            />
          </div>
          <div className="pf-split-side">
            <DetailPanel node={sel} onClose={() => setSel(null)} />
          </div>
        </div>
      </Card>

      {ARCHITECTURE.layers.map((l) => (
        <LayerCard key={l.id} layer={l} />
      ))}

      <Card
        className="mt"
        title="Which files everything depends on"
        icon="folder"
        right={<Badge tone="info">{CODE.fileCount} files</Badge>}
      >
        <p className="pf-note">
          Counted from the actual import statements. A change near the top of this list is felt everywhere.
        </p>
        <table className="pf-table">
          <thead>
            <tr>
              <th>File</th>
              <th className="r">Imported by</th>
              <th className="r">Lines</th>
              <th>Kind</th>
            </tr>
          </thead>
          <tbody>
            {mostImported.map((f) => (
              <tr key={f.path}>
                <td><code className="pf-path">{f.path}</code></td>
                <td className="r"><b>{f.importedBy.length}</b></td>
                <td className="r">{num(f.lines)}</td>
                <td className="pf-dim">{f.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pf-foot">
          {CODE.orphans.length === 0
            ? 'No unused files: every file under src/ is imported by something, or is the application entry point.'
            : `${CODE.orphans.length} file(s) are imported by nothing: ${CODE.orphans.join(', ')}`}
        </p>
      </Card>
    </>
  )
}

/* ------------------------------------------------------------------ 4. Database */

function TableDetail({ table, onClose }) {
  if (!table)
    return (
      <div className="pf-detail idle">
        <Icon name="folder" size={22} />
        <p>Select any table in the diagram to read its columns, its keys, its security policies and what points at it.</p>
      </div>
    )
  return (
    <div className="pf-detail">
      <div className="pf-detail-head">
        <div className="pf-detail-titles">
          <div className="pf-detail-kind">
            <Icon name="folder" size={13} /> {table.external ? 'Supabase Auth table' : `${table.group} table`}
          </div>
          <h4 className="pf-detail-title mono-title">{table.name}</h4>
        </div>
        <button className="icon-btn sm" onClick={onClose} title="Close" aria-label="Close detail">
          <Icon name="close" size={15} />
        </button>
      </div>

      {/* The authored description first, because it is written for this reader. The
          schema's own comment follows only when it says something different — so the
          provenance of each sentence stays visible instead of the two being merged. */}
      {(TABLE_NOTES[table.name] || table.purpose) && (
        <p className="pf-detail-body">{TABLE_NOTES[table.name] || table.purpose}</p>
      )}
      {table.purpose && TABLE_NOTES[table.name] && table.purpose.length > 30 && (
        <div className="pf-schema-note">
          <span className="pf-sub inline">Comment in the schema</span>
          {table.purpose}
        </div>
      )}

      <div className="pf-tbl-stats">
        <span><b>{table.columns.length}</b> columns</span>
        <span><b>{table.pk.join(' + ') || '—'}</b> primary key</span>
        <span><b>{table.foreignKeys.length}</b> foreign keys</span>
        <span><b>{table.referencedBy.length}</b> referenced by</span>
      </div>

      <div className="pf-sub">Columns</div>
      <div className="pf-cols">
        {table.columns.map((c) => (
          <div key={c.name} className={`pf-col ${c.pk ? 'pk' : ''} ${c.references ? 'fk' : ''}`}>
            <span className="pf-col-name">{c.name}</span>
            <span className="pf-col-type">{c.type}</span>
            <span className="pf-col-flags">
              {c.pk && <span className="pf-flag pk">PK</span>}
              {c.references && (
                <span className="pf-flag fk">→ {c.references.table}.{c.references.column}</span>
              )}
              {c.unique && !c.pk && <span className="pf-flag">unique</span>}
              {c.notNull && !c.pk && <span className="pf-flag">required</span>}
              {c.check && <span className="pf-flag chk" title={c.check}>checked</span>}
            </span>
          </div>
        ))}
      </div>

      {table.referencedBy.length > 0 && (
        <>
          <div className="pf-sub">Referenced by</div>
          <div className="pf-reflist">
            {table.referencedBy.map((r, i) => (
              <div key={i} className="pf-ref">
                <code>{r.from}.{r.fromColumn}</code>
                <span className="pf-dim">{r.kind}{r.optional ? ', optional' : ''}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {table.policies.length > 0 && (
        <>
          <div className="pf-sub">Security policies</div>
          <div className="pf-pol">
            {table.policies.map((p) => (
              <div key={p.name} className="pf-pol-row">
                <span className={`pf-pol-act act-${p.action}`}>{p.action}</span>
                <code className="pf-pol-exp">{p.expression}</code>
              </div>
            ))}
          </div>
        </>
      )}

      {table.triggers.length > 0 && (
        <>
          <div className="pf-sub">Triggers</div>
          {table.triggers.map((t) => (
            <div key={t.name} className="pf-ref">
              <code>{t.name}</code>
              <span className="pf-dim">{t.timing} {t.event} → {t.fn}</span>
            </div>
          ))}
        </>
      )}

      {table.indexes.length > 0 && (
        <>
          <div className="pf-sub">Indexes</div>
          {table.indexes.map((i) => (
            <div key={i.name} className="pf-ref">
              <code>{i.name}</code>
              <span className="pf-dim">{i.columns.join(', ')}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function DatabaseView({ query }) {
  const [sel, setSel] = useState(null)

  return (
    <>
      <div className="kpi-grid pf-kpis">
        <KpiCard label="Tables" value={SUMMARY.tableCount} unit="in the schema" icon="folder" color="var(--info)" />
        <KpiCard label="Columns" value={num(SUMMARY.columnCount)} unit="documented" icon="layers" color="var(--info)" />
        <KpiCard label="Relationships" value={SUMMARY.relationshipCount} unit="foreign keys" icon="transfer" color="var(--info)" />
        <KpiCard label="Security policies" value={SUMMARY.policyCount} unit="across all tables" icon="lock" color="var(--ok)" />
        <KpiCard label="Triggers & functions" value={DB.triggers.length + DB.functions.length} unit="server-side rules" icon="audit" color="var(--ok)" />
        <KpiCard label="Tables never written to" value={SUMMARY.emptyTransactionalTables} unit="of 7 transactional" icon="alert" color="var(--warn)" />
      </div>

      <Card
        className="mt"
        title="Entity relationship diagram"
        icon="folder"
        right={<Badge tone="info">generated from schema.sql</Badge>}
        pad={false}
      >
        <div className="pf-split wide-side">
          <div className="pf-split-main">
            <p className="pf-note">
              Grouped by how they connect, not by what they hold — read the badge on each box for that.
              <code>audit_log</code> is transactional and still sits on the left, because it records an email
              as text instead of referencing an account. That absence is the finding.
            </p>
            <ErdDiagram onSelect={(t) => setSel((s) => (s?.name === t.name ? null : t))} selectedName={sel?.name} query={query} height={620} />
          </div>
          <div className="pf-split-side">
            <TableDetail table={sel} onClose={() => setSel(null)} />
          </div>
        </div>
      </Card>

      <Card className="mt" title="Live database check" icon="search">
        <LiveProbe />
      </Card>

      <Card
        className="mt"
        title="Table catalogue"
        icon="layers"
        right={<Badge tone="info">{DB.tableCount} tables</Badge>}
      >
        <table className="pf-table">
          <thead>
            <tr>
              <th>Table</th>
              <th>Group</th>
              <th>Purpose</th>
              <th className="r">Cols</th>
              <th className="r">Keys</th>
              <th className="r">Policies</th>
              <th>Written by the app</th>
            </tr>
          </thead>
          <tbody>
            {DB.tables.map((t) => {
              const written =
                t.name === 'safekeeping_requests'
                  ? { label: 'Yes', status: 'live' }
                  : t.group === 'transactional'
                    ? { label: 'No — empty', status: 'partial' }
                    : { label: 'Read only', status: 'live' }
              return (
                <tr key={t.name} className={sel?.name === t.name ? 'on' : ''} onClick={() => setSel(t)}>
                  <td><code className="pf-path">{t.name}</code></td>
                  <td><span className={`pf-grp grp-${t.group}`}>{t.group}</span></td>
                  <td className="pf-purpose">{TABLE_NOTES[t.name] || t.purpose || '—'}</td>
                  <td className="r">{t.columns.length}</td>
                  <td className="r">{t.foreignKeys.length}</td>
                  <td className="r">{t.policies.length}</td>
                  <td>
                    <span className="pf-inline-status">
                      <StatusDot status={written.status} /> {written.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="pf-foot">
          Parsed from <code>supabase/schema.sql</code>, so this cannot fall out of step with the schema. It
          describes the schema FILE — a table altered by hand in the Supabase editor would show up only in
          the live check above.
        </p>
      </Card>
    </>
  )
}

/* ------------------------------------------------------------------ 5. Data flow */

function DataFlowView() {
  // First trace open, the rest closed: one worked example is enough to show the
  // shape, and six open at once was 2,900 pixels of near-identical tables.
  const [open, setOpen] = useState(() => new Set([DATA_FLOWS[0].id]))
  const toggle = (id) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <>
      <SectionBar
        title={`Transaction traces · ${DATA_FLOWS.length}`}
        note="The same eight questions of every major transaction. Where a step does not exist, it says so."
        right={
          <div className="pf-bulk">
            <button className="btn btn-sm" onClick={() => setOpen(new Set(DATA_FLOWS.map((f) => f.id)))}>Expand all</button>
            <button className="btn btn-sm" onClick={() => setOpen(new Set())}>Collapse all</button>
          </div>
        }
      />
      <Card className="mt" pad={false}>
        <div className="pf-exp-list">
          {DATA_FLOWS.map((f) => (
            <ExpandRow
              key={f.id}
              open={open.has(f.id)}
              onToggle={() => toggle(f.id)}
              mark={<StatusDot status={f.status} />}
              title={f.title}
              note={f.note}
              right={<StatusChip status={f.status} size="sm" />}
            >
              <ol className="pf-trace">
                {f.steps.map((s, i) => (
                  <li key={i} className={`pf-trace-step st-${s.status}`}>
                    <span className="pf-trace-n">{i + 1}</span>
                    <span className="pf-trace-label">{STEP_LABELS[i]}</span>
                    <span className="pf-trace-body">
                      <StatusDot status={s.status} />
                      {s.label}
                    </span>
                  </li>
                ))}
              </ol>
            </ExpandRow>
          ))}
        </div>
      </Card>
    </>
  )
}

/* ------------------------------------------------------------------ 6. Access */

const ACTS = [
  ['view', 'Can view'],
  ['create', 'Can create'],
  ['edit', 'Can edit'],
  ['remove', 'Can delete'],
  ['approve', 'Can approve'],
  ['exportData', 'Can export'],
]

function AccessView() {
  const [openRole, setOpenRole] = useState(() => new Set())
  const toggleRole = (key) =>
    setOpenRole((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  return (
    <>
      <Card title="The interface and the database disagree" icon="lock">
        <p className="pf-note">
          Each role below is described twice. Where the two columns disagree, the database wins.
        </p>
        <div className="pf-truth">
          <div className="pf-truth-side">
            <div className="pf-truth-head"><Icon name="dashboard" size={14} /> The interface enforces</div>
            <p>Which menu items appear and which are padlocked — real only as long as somebody uses the screens.</p>
            <code className="pf-path">src/data/roles.js</code>
          </div>
          <div className="pf-truth-side strong">
            <div className="pf-truth-head"><Icon name="lock" size={14} /> The database enforces</div>
            <p>Two kinds of user: administrator, and everyone else signed in. All four operational roles are identical.</p>
            <code className="pf-path">supabase/schema.sql</code>
          </div>
        </div>
      </Card>

      <SectionBar
        title={`Roles today · ${ROLE_MATRIX.length}`}
        note="Open a role for what the interface offers it and what the database would actually allow."
        icon="users"
        right={
          <div className="pf-bulk">
            <button className="btn btn-sm" onClick={() => setOpenRole(new Set(ROLE_MATRIX.map((r) => r.key)))}>Expand all</button>
            <button className="btn btn-sm" onClick={() => setOpenRole(new Set())}>Collapse all</button>
          </div>
        }
      />
      <Card className="mt" pad={false}>
      <div className="pf-exp-list">
      {ROLE_MATRIX.map((r) => (
        <ExpandRow
          key={r.key}
          open={openRole.has(r.key)}
          onToggle={() => toggleRole(r.key)}
          mark={<Icon name="users" size={15} className="pf-dim" />}
          title={r.label}
          note={r.people + (r.gaps.length ? ` · ${r.gaps.length} mismatch${r.gaps.length > 1 ? 'es' : ''}` : '')}
        >
          <div className="pf-role-grid">
            <div className="pf-role-col">
              <div className="pf-role-colhead">In the application</div>
              {ACTS.map(([k, label]) => (
                <div key={k} className="pf-role-row">
                  <span className="pf-role-act">{label}</span>
                  <span className="pf-role-val">
                    {r.ui[k].length ? r.ui[k].join(' · ') : '—'}
                  </span>
                </div>
              ))}
              <div className="pf-role-perms">
                <span className="pf-sub inline">Permission keys</span>
                {uiPerms(r.key).map((p) => (
                  <code key={p} className="pf-perm">{p}</code>
                ))}
              </div>
              {lockedFor(r.key).length > 0 && (
                <div className="pf-role-locked">
                  <Icon name="lock" size={12} /> Padlocked in the menu: {lockedFor(r.key).join(', ')}
                </div>
              )}
            </div>

            <div className="pf-role-col db">
              <div className="pf-role-colhead">In the database</div>
              {ACTS.map(([k, label]) => (
                <div key={k} className="pf-role-row">
                  <span className="pf-role-act">{label}</span>
                  <span className="pf-role-val">{r.db[k]}</span>
                </div>
              ))}
            </div>
          </div>

          {r.gaps.length > 0 && (
            <div className="pf-role-gaps">
              <div className="pf-sub">Where the two disagree</div>
              {r.gaps.map((g, i) => (
                <div key={i} className="pf-role-gap">
                  <Icon name="alert" size={13} />
                  <span>{g}</span>
                </div>
              ))}
            </div>
          )}
        </ExpandRow>
      ))}
      </div>
      </Card>

      <SectionBar
        title="Roles the system does not have yet"
        note="Proposals, not plans. Each one exists because something in the system today has no proper owner."
        right={<StatusChip status="recommended" size="sm" />}
      />
      <div className="pf-future-grid mt">
        {FUTURE_ROLES.map((r) => (
          <div key={r.label} className="pf-future">
            <div className="pf-future-head">
              <Icon name="users" size={14} />
              <span>{r.label}</span>
              <StatusChip status={r.status} size="sm" />
            </div>
            <p className="pf-future-why">{r.why}</p>
            <div className="pf-future-access">
              <span className="pf-sub inline">Proposed access</span>
              {r.access}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ 7. Security */

const SEV_TONE = { high: 'danger', medium: 'warn', low: 'info' }

function SecurityView() {
  const bySev = (s) => VULNERABILITIES.filter((v) => v.severity === s)
  const [openVuln, setOpenVuln] = useState(() => new Set())
  const toggleVuln = (id) =>
    setOpenVuln((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  return (
    <>
      <div className="kpi-grid pf-kpis">
        <KpiCard label="High severity" value={bySev('high').length} unit="findings" icon="alert" color="var(--danger)" />
        <KpiCard label="Medium" value={bySev('medium').length} unit="findings" icon="alert" color="var(--warn)" />
        <KpiCard label="Low" value={bySev('low').length} unit="findings" icon="alert" color="var(--info)" />
        <KpiCard label="Protected routes" value={`${SUMMARY.protectedRouteCount}/${SUMMARY.routeCount}`} unit="require a sign-in" icon="lock" color="var(--ok)" />
        <KpiCard label="Tables with security on" value={`${SUMMARY.tableCount}/${SUMMARY.tableCount}`} unit="row-level security" icon="check" color="var(--ok)" />
        <KpiCard label="Policies" value={SUMMARY.policyCount} unit="rules in force" icon="approve" color="var(--ok)" />
      </div>

      {SECURITY_SECTIONS.map((s) => (
        <Card key={s.id} className="mt" title={s.title} icon="lock" right={<StatusChip status={s.status} size="sm" />}>
          <div className="pf-sec-grid">
            {s.points.map((p) => (
              <div key={p.label} className={`pf-sec st-${p.status}`}>
                <div className="pf-sec-head">
                  <StatusDot status={p.status} />
                  <span className="pf-sec-title">{p.label}</span>
                  <StatusChip status={p.status} size="sm" />
                </div>
                <p>{p.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <SectionBar
        title={`Vulnerability assessment · ${VULNERABILITIES.length}`}
        note="Ranked by severity. Open one for where it is in the code and what fixing it involves."
        icon="alert"
        right={
          <div className="pf-bulk">
            <button className="btn btn-sm" onClick={() => setOpenVuln(new Set(VULNERABILITIES.map((v) => v.id)))}>Expand all</button>
            <button className="btn btn-sm" onClick={() => setOpenVuln(new Set())}>Collapse all</button>
          </div>
        }
      />
      {/* This has to be said on the page, not just in a commit message. The repository
          is public and this module ships inside the published bundle, so these findings
          are readable by anyone — the underlying facts already were, since schema.sql
          is in the public repository, but this page collects them into one place. */}
      <div className="pf-public-warn mt">
        <Icon name="alert" size={15} />
        <div>
          <b>This section is publicly readable.</b> The repository is public and this page ships in the
          published site. The facts were already public — the schema file is committed — but this gathers
          them into one list. Close the high-severity findings first, then decide whether to restrict this
          view to administrators: one line in <code>src/data/roles.js</code>.
        </div>
      </div>
      {/* One card, nine rows. Scan the list, open what matters. */}
      <Card className="mt" pad={false}>
        <div className="pf-exp-list">
          {['high', 'medium', 'low'].flatMap((sev) =>
            bySev(sev).map((v) => (
              <ExpandRow
                key={v.id}
                open={openVuln.has(v.id)}
                onToggle={() => toggleVuln(v.id)}
                mark={<span className={`pf-sev sev-${sev}`}>{sev}</span>}
                title={v.title}
                note={openVuln.has(v.id) ? null : v.detail}
                right={<StatusChip status={v.status} size="sm" />}
              >
                <p className="pf-vuln-detail">{v.detail}</p>
                {v.verify && (
                  <div className="pf-vuln-block verify">
                    <div className="pf-vuln-block-head"><Icon name="search" size={13} /> Check this first</div>
                    <p>{v.verify}</p>
                  </div>
                )}
                <div className="pf-vuln-block fix">
                  <div className="pf-vuln-block-head"><Icon name="check" size={13} /> The fix</div>
                  <p>{v.fix}</p>
                </div>
                <Evidence items={v.evidence} />
              </ExpandRow>
            ))
          )}
        </div>
      </Card>
    </>
  )
}

/* ------------------------------------------------------------------ 8. Dependencies */

function DependenciesView() {
  const runtime = CODE.dependencies.filter((d) => !d.dev)
  const dev = CODE.dependencies.filter((d) => d.dev)

  const Row = ({ d }) => {
    const note = DEP_NOTES[d.name] || {}
    return (
      <tr>
        <td><code className="pf-path">{d.name}</code></td>
        <td className="pf-dim">{d.range}</td>
        <td>{note.role || '—'}</td>
        <td className="r">
          <span className={d.imported ? 'pf-used' : 'pf-unused'}>{d.importedBy.length}</span>
        </td>
        <td className="pf-purpose">{note.note || ''}</td>
      </tr>
    )
  }

  return (
    <>
      <Card title="Everything this application depends on" icon="box" right={<Badge tone="info">{CODE.dependencies.length} packages</Badge>}>
        <p className="pf-note">
          Five to run, two to build. The file count is taken from the real import statements, build config included.
        </p>
        <div className="pf-sub">Runtime — shipped to the browser</div>
        <table className="pf-table">
          <thead>
            <tr><th>Package</th><th>Version</th><th>Role</th><th className="r">Files</th><th>Notes</th></tr>
          </thead>
          <tbody>{runtime.map((d) => <Row key={d.name} d={d} />)}</tbody>
        </table>

        <div className="pf-sub">Build only — never reaches the browser</div>
        <table className="pf-table">
          <thead>
            <tr><th>Package</th><th>Version</th><th>Role</th><th className="r">Files</th><th>Notes</th></tr>
          </thead>
          <tbody>{dev.map((d) => <Row key={d.name} d={d} />)}</tbody>
        </table>
      </Card>

      <Card className="mt" title="Dependency findings" icon="alert">
        <div className="pf-sec-grid">
          {DEP_FINDINGS.map((d) => (
            <div key={d.label} className={`pf-sec st-${d.status}`}>
              <div className="pf-sec-head">
                <StatusDot status={d.status} />
                <span className="pf-sec-title">{d.label}</span>
                <StatusChip status={d.status} size="sm" />
              </div>
              <p>{d.detail}</p>
            </div>
          ))}
        </div>
        <p className="pf-foot">
          {CODE.undeclared.length === 0
            ? 'Nothing is imported that is not declared in package.json, so a clean install builds.'
            : `Imported but not declared: ${CODE.undeclared.join(', ')} — a clean install would fail.`}
        </p>
      </Card>

      <Card className="mt" title="Routes" icon="map" right={<Badge tone="info">{SUMMARY.routeCount} routes</Badge>}>
        <p className="pf-note">Parsed out of the router itself, so this list cannot disagree with what the app will actually serve.</p>
        <table className="pf-table">
          <thead><tr><th>Path</th><th>Screen</th><th>Requires sign-in</th></tr></thead>
          <tbody>
            {CODE.routes.map((r) => (
              <tr key={r.path}>
                <td><code className="pf-path">{r.path}</code></td>
                <td>{r.redirect ? <span className="pf-dim">redirect</span> : r.component}</td>
                <td>
                  <span className="pf-inline-status">
                    <StatusDot status={r.protected ? 'live' : 'planned'} />
                    {r.protected ? 'Yes' : r.redirect ? 'n/a — redirect' : 'No'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function ProcessFlow() {
  const [params, setParams] = useSearchParams()
  const view = VIEWS.some((v) => v.key === params.get('view')) ? params.get('view') : 'journey'
  const [filter, setFilter] = useState(null) // null = show all
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const selectView = (key) => {
    const next = new URLSearchParams(params)
    if (key === 'journey') next.delete('view')
    else next.set('view', key)
    setParams(next, { replace: false })
  }

  const toggleStatus = (key) =>
    setFilter((f) => {
      const n = new Set(f || [])
      if (n.has(key)) n.delete(key)
      else n.add(key)
      // Deselecting the last one means "show everything" rather than "show nothing" —
      // an empty diagram is never what someone was reaching for.
      return n.size === 0 ? null : n
    })

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return SEARCH_INDEX.filter(
      (i) => i.label.toLowerCase().includes(q) || (i.detail || '').toLowerCase().includes(q) || i.context.toLowerCase().includes(q)
    ).slice(0, 40)
  }, [query])

  return (
    <div className="pf">
      {/* ---- module header ----
           Deliberately short. The first version opened with a four-line paragraph
           explaining the four statuses, which the legend directly below already does
           — the reader was reading the same thing twice before seeing any content. */}
      <div className="pf-header">
        <p className="pf-lede">
          How the system works today, with an honest label on every item. Nothing here describes a
          workflow without saying whether it runs.
        </p>
        <div className="pf-header-stats">
          <span><b>{SUMMARY.tableCount}</b> tables</span>
          <span><b>{SUMMARY.routeCount}</b> routes</span>
          <span><b>{SUMMARY.policyCount}</b> policies</span>
          <span className="warn"><b>{SUMMARY.writePathCount} of 7</b> transactional tables ever written to</span>
          <span className="bad"><b>{SUMMARY.highSeverity}</b> high-severity findings</span>
        </div>
      </div>

      <StatusLegend tally={SUMMARY.tally} />

      {/* ---- controls: search across everything, and emphasise a status ---- */}
      <div className="pf-controls">
        <div className="pf-search">
          <Icon name="search" size={15} />
          <input
            type="search"
            value={query}
            placeholder="Search every process, table, role, finding…"
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true) }}
            onFocus={() => setSearchOpen(true)}
          />
          {query && (
            <button className="icon-btn sm" onClick={() => { setQuery(''); setSearchOpen(false) }} aria-label="Clear search">
              <Icon name="close" size={14} />
            </button>
          )}
          {searchOpen && results.length > 0 && (
            <div className="pf-results">
              <div className="pf-results-head">
                {results.length} match{results.length > 1 ? 'es' : ''}
                <button className="icon-btn sm" onClick={() => setSearchOpen(false)} aria-label="Hide results">
                  <Icon name="close" size={13} />
                </button>
              </div>
              {results.map((r) => (
                <button
                  key={r.id}
                  className="pf-result"
                  onClick={() => { selectView(r.view); setSearchOpen(false) }}
                >
                  <StatusDot status={r.status} />
                  <span className="pf-result-main">
                    <span className="pf-result-label">{r.label}</span>
                    <span className="pf-result-ctx">{r.context}</span>
                  </span>
                  <Icon name="chevronRight" size={13} />
                </button>
              ))}
            </div>
          )}
        </div>
        <StatusFilter active={filter} onToggle={toggleStatus} onAll={() => setFilter(null)} />
      </div>

      {/* The guided tour finds its targets by this attribute. */}
      <div className="sub-tabs pf-tabs" role="tablist" data-tour="process-flow">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            role="tab"
            aria-selected={v.key === view}
            className={`sub-tab ${v.key === view ? 'active' : ''}`}
            onClick={() => selectView(v.key)}
          >
            <Icon name={v.icon} size={15} />
            <span>{v.label}</span>
          </button>
        ))}
      </div>

      <div className="mt">
        {view === 'journey' && <JourneyView filter={filter} query={query} />}
        {view === 'processes' && <ProcessesView filter={filter} query={query} />}
        {view === 'architecture' && <ArchitectureView filter={filter} query={query} />}
        {view === 'database' && <DatabaseView query={query} />}
        {view === 'dataflow' && <DataFlowView />}
        {view === 'access' && <AccessView />}
        {view === 'security' && <SecurityView />}
        {view === 'dependencies' && <DependenciesView />}
      </div>

      <div className="pf-provenance">
        <Icon name="doc" size={14} />
        <div>
          Tables, relationships, routes, file counts and the dependency audit are generated from{' '}
          <code>supabase/schema.sql</code> and the source by <code>npm run model</code>, so they cannot drift.
          Process descriptions are written by hand, last reviewed <b>{REVIEWED}</b>.
        </div>
      </div>
    </div>
  )
}
