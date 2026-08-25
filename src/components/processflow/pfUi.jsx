import Icon from '../../lib/icons'
import { KIND, STATUS, STATUS_LIST } from '../../data/processFlow'

// Shared pieces of the Process Flow module: the status vocabulary made visible, the
// filter that drives every diagram, and the detail panel a clicked node opens.
//
// The legend is not optional decoration. Every diagram in this module mixes what
// exists with what does not, so a reader who has not been told what the colours mean
// is being actively misled. It is therefore rendered at the top of the module rather
// than tucked at the bottom of a card.

export function StatusChip({ status, size }) {
  const st = STATUS[status] || STATUS.planned
  return (
    <span className={`pf-chip tone-${st.tone} ${size === 'sm' ? 'sm' : ''}`}>
      <span className="pf-chip-dot" aria-hidden="true" />
      {st.label}
    </span>
  )
}

export function StatusLegend({ tally }) {
  return (
    <div className="pf-legend">
      {STATUS_LIST.map((s) => (
        <div key={s.key} className={`pf-legend-item tone-${s.tone}`}>
          <div className="pf-legend-head">
            <span className="pf-legend-swatch" aria-hidden="true" />
            <span className="pf-legend-label">{s.label}</span>
            {tally && <span className="pf-legend-count">{tally[s.key]}</span>}
          </div>
          <p className="pf-legend-desc">{s.desc}</p>
        </div>
      ))}
    </div>
  )
}

// The filter is a set of statuses to EMPHASISE. Nothing is ever removed from a
// diagram by filtering — see the note in FlowDiagram — so the control says "show"
// rather than pretending to be a hard filter.
export function StatusFilter({ active, onToggle, onAll }) {
  const all = active === null
  return (
    <div className="pf-filter">
      <button className={`pf-filter-btn ${all ? 'on' : ''}`} onClick={onAll}>
        All
      </button>
      {STATUS_LIST.map((s) => (
        <button
          key={s.key}
          className={`pf-filter-btn tone-${s.tone} ${!all && active.has(s.key) ? 'on' : ''}`}
          onClick={() => onToggle(s.key)}
          title={s.desc}
        >
          <span className="pf-filter-dot" aria-hidden="true" />
          {s.short}
        </button>
      ))}
    </div>
  )
}

export function Evidence({ items, label = 'In the code' }) {
  if (!items || !items.length) return null
  return (
    <div className="pf-evidence">
      <div className="pf-evidence-head">
        <Icon name="doc" size={13} /> {label}
      </div>
      {items.map((e, i) => (
        <div key={i} className="pf-evidence-row">
          <code className="pf-path">{e.file}</code>
          {e.note && <span className="pf-evidence-note">{e.note}</span>}
        </div>
      ))}
    </div>
  )
}

// What a clicked node opens. Deliberately a panel beside the diagram rather than a
// modal over it: the reader is comparing the box to its neighbours, and a modal hides
// the very thing that gives the detail its meaning.
export function DetailPanel({ node, onClose, emptyHint }) {
  if (!node)
    return (
      <div className="pf-detail idle">
        <Icon name="filter" size={22} />
        <p>{emptyHint || 'Select any box in the diagram to read what it does, how far along it is, and which file does the work.'}</p>
      </div>
    )

  const st = STATUS[node.status] || STATUS.planned
  const kind = KIND[node.kind] || KIND.logic
  return (
    <div className="pf-detail">
      <div className="pf-detail-head">
        <div className="pf-detail-titles">
          <div className="pf-detail-kind">
            <Icon name={kind.icon} size={13} /> {kind.label}
            {node.stageTitle ? <span className="pf-detail-stage"> · {node.stageTitle}</span> : null}
          </div>
          <h4 className="pf-detail-title">{node.label}</h4>
        </div>
        <button className="icon-btn sm" onClick={onClose} title="Close" aria-label="Close detail">
          <Icon name="close" size={15} />
        </button>
      </div>

      <StatusChip status={node.status} />
      <p className="pf-detail-body">{node.detail}</p>

      {node.missing && (
        <div className={`pf-missing tone-${st.tone}`}>
          <div className="pf-missing-head">
            <Icon name="alert" size={13} /> What is missing
          </div>
          <p>{node.missing}</p>
        </div>
      )}

      <Evidence items={node.evidence} />
    </div>
  )
}

// A plain heading row used between sections inside a view. The app's Card component
// carries a border and a background; several of these sections are lists of cards, so
// they need a label without a second frame around it.
export function SectionBar({ title, note, right, icon }) {
  return (
    <div className="pf-sectionbar">
      <div className="pf-sectionbar-main">
        <div className="pf-sectionbar-title">
          {icon && <Icon name={icon} size={15} />}
          {title}
        </div>
        {note && <p className="pf-sectionbar-note">{note}</p>}
      </div>
      {right}
    </div>
  )
}
