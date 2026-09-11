import { useMemo, useState, useEffect } from 'react'
import { deliveryMonths } from '../data/deliveryGantt'
import { Card, Toggle, NoData } from './ui'
import { DistributionDonut } from './charts'
import { num } from '../lib/format'
import Icon from '../lib/icons'
import '../styles/gantt.css'

// ---------------------------------------------------------------------------
// DELIVERY MONTH BREAKDOWN — one month at a time, stepped with the arrows.
//
// IT COUNTS QUANTITY, NOT PESOS, and every label on it says so. The delivery workbook
// records a quantity and a unit of measure and carries no price on any sheet, and the
// tracker no longer reads the stock workbook that had one. A peso figure here would have
// to come from multiplying by a unit cost nobody quoted for these deliveries — it would
// look authoritative and be invented. Quantity is what the source actually supports.
//
// The mix is worth seeing even so: it answers "what is this month mostly made of", and
// for a warehouse planning floor space that is the operative question anyway, since
// space is taken by volume rather than by value.
//
// Materials are the default cut; the toggle offers Projects, which answers "whose
// material is arriving" instead. Both come off the same month.

const CUTS = [
  { value: 'materials', label: 'Material', icon: 'layers' },
  { value: 'projects', label: 'Project', icon: 'location' },
]

export default function DeliveryMonthPie() {
  const { months, undated, undatedQty } = useMemo(() => deliveryMonths(), [])
  const [cut, setCut] = useState('materials')

  // Open on the month nearest TODAY rather than on the first month in the file: the
  // schedule runs into 2028, and a card that opens two years in the past would look
  // broken. Falls back to the first month when every delivery is in the future.
  const initial = useMemo(() => {
    if (!months.length) return 0
    const at = months.findIndex((m) => m.date.getTime() >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime())
    return at >= 0 ? at : months.length - 1
  }, [months])
  const [i, setI] = useState(initial)
  useEffect(() => { setI(initial) }, [initial])

  if (!months.length) {
    return (
      <Card title="Deliveries by Month" icon="donutSingle" pad={false}>
        <div className="dmp-empty">
          <NoData
            what="No dated deliveries to break down"
            why="Every delivery on the schedule is missing a target date, so none can be placed in a month."
          />
        </div>
      </Card>
    )
  }

  const m = months[Math.min(Math.max(i, 0), months.length - 1)]
  const slices = m[cut] || []
  // Same unit either way: both cuts divide the same month up by quantity.
  const unit = "units scheduled"

  const step = (d) => setI((n) => Math.min(Math.max(n + d, 0), months.length - 1))

  return (
    <Card
      pad={false}
      title="Deliveries by Month"
      icon="donutSingle"
      sub={`${months.length} months scheduled`}
      right={<Toggle options={CUTS} value={cut} onChange={setCut} size="sm" />}
    >
      <div className="dmp-bar">
        <button type="button" className="dmp-nav" onClick={() => step(-1)} disabled={i === 0}
          aria-label="Previous month">
          <Icon name="chevronRight" size={15} className="rot180" />
        </button>
        <div className="dmp-month">
          <strong>{m.label}</strong>
          <span>
            {num(m.total)} units · {m.lines} deliver{m.lines === 1 ? 'y' : 'ies'}
            {m.tbc > 0 && <em className="dmp-tbc"> · {m.tbc} without a quantity</em>}
          </span>
        </div>
        <button type="button" className="dmp-nav" onClick={() => step(1)} disabled={i === months.length - 1}
          aria-label="Next month">
          <Icon name="chevronRight" size={15} />
        </button>
      </div>

      {/* A month whose every delivery is TBC has lines but no quantity — an empty ring
          would read as "nothing due", which is the opposite of what it means. */}
      {m.total <= 0 ? (
        <div className="dmp-empty">
          <NoData
            what={`No agreed quantities in ${m.label}`}
            why={`${m.lines} deliver${m.lines === 1 ? 'y is' : 'ies are'} scheduled this month, but the source records every one of their quantities as TBC, so there is nothing to divide up.`}
          />
        </div>
      ) : (
        <div className="dmp-chart">
          <DistributionDonut
            data={slices}
            metric="qty"
            unit={unit}
            leaderLines
            wide
            hideLegend={false}
            innerRadius={64}
            outerRadius={98}
          />
        </div>
      )}

      <p className="dmp-note">
        <Icon name="alert" size={12} />
        <span>
          <strong>This is quantity, not peso value.</strong> The delivery workbook records a
          quantity and a unit of measure for each line and carries no price, so the ring divides
          up units scheduled to arrive — mixing units of measure across materials, which is why
          the share is more useful than the total. A delivery counts in the month its target
          falls in; an estimate like “August 2026” counts in that month.
          {undated > 0 && <> {undated} deliver{undated === 1 ? 'y' : 'ies'}
            {undatedQty > 0 ? ` totalling ${num(undatedQty)} units` : ''} carry no target date at all
            and appear in no month.</>}
        </span>
      </p>
    </Card>
  )
}
