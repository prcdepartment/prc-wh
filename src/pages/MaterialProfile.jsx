import { useParams, useNavigate } from 'react-router-dom'
import { findById } from '../data/insights'
import { locationOf } from '../data/warehouseMap'
import { movements, reservations } from '../data/transactions'
import { Card, Badge, KpiCard, DataTable } from '../components/ui'
import { num, peso, fmtDate } from '../lib/format'
import { seriesFor } from '../lib/colors'
import { useTheme } from '../context/ThemeContext'
import Icon from '../lib/icons'

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  )
}

export default function MaterialProfile() {
  const { id } = useParams()
  const nav = useNavigate()
  const item = findById(id)
  // Resolved per theme, same map the dashboard uses, so Incoming/Outgoing/etc. carry
  // one consistent colour across every page rather than each screen hardcoding its
  // own (light-only) hexes.
  const { theme } = useTheme()
  const S = seriesFor(theme)

  if (!item)
    return (
      <div className="empty">
        Material not found. <button className="link" onClick={() => nav('/inventory')}>Back to inventory</button>
      </div>
    )

  const moves = movements.filter((m) => m.itemId === item.id)
  const resv = reservations.filter((r) => r.itemId === item.id)

  const statusCards = [
    { label: 'Total Qty', value: item.totalQty, color: S.total },
    { label: 'Available', value: item.availableQty, color: S.available },
    { label: 'Reserved', value: item.reservedQty, color: S.reserved },
    { label: 'Incoming', value: item.incomingQty, color: S.incoming },
    { label: 'Outgoing', value: item.outgoingQty, color: S.outgoing },
    { label: 'Damaged', value: item.damagedQty, color: S.damaged },
  ]

  // Location follows the real facility from the CW Taytay Warehouse Plan — site area,
  // then material area, then rack / bay / level — instead of the old synthetic
  // Zone-Rack-Shelf-Bin columns, which described no building that exists. Since the
  // 2026-09-02 snapshot the address itself is usually the warehouse's own bin record;
  // `place.recorded` says whether this particular line's is, because "go to MEPF R1
  // bay 7" is worth acting on only if somebody actually put it there.
  const place = locationOf(item)
  const loc = place
    ? place.level === 'site'
      ? [{ l: 'Site', v: 'CW Taytay' }, { l: 'Area', v: place.area }, { l: 'Storage', v: 'Outdoor yard' }]
      : [
          { l: 'Building', v: 'Central Warehouse' },
          { l: 'Area', v: place.area },
          ...place.detail.split(' · ').map((seg) => {
            const [l, ...rest] = seg.split(' ')
            return rest.length ? { l, v: rest.join(' ') } : { l: 'Storage', v: seg }
          }),
        ]
    : [{ l: 'Site', v: 'CW Taytay' }, { l: 'Location', v: 'Not assigned' }]

  const docs = [
    { name: `PO-2026-${item.id}.pdf`, type: 'Purchase Order', icon: 'doc' },
    { name: `DR-2026-${1000 + item.id}.pdf`, type: 'Delivery Receipt', icon: 'doc' },
    { name: `${item.itemCode}-datasheet.pdf`, type: 'Datasheet', icon: 'doc' },
    { name: `inspection-${item.id}.pdf`, type: 'Inspection Report', icon: 'doc' },
    { name: `${item.itemCode}-photo.jpg`, type: 'Reference Photo', icon: 'image' },
  ]

  return (
    <>
      <button className="btn btn-sm btn-ghost" onClick={() => nav('/inventory')}>
        <Icon name="arrowUp" size={14} style={{ transform: 'rotate(-90deg)' }} /> Back to Inventory
      </button>

      <div className="spread mt-sm">
        <div>
          <div className="section-title">{item.description}</div>
          <div className="section-note"><span className="mono">{item.itemCode}</span> · {item.detailedDescription}</div>
        </div>
        <div className="wrap-gap">
          <Badge>{item.stockStatus}</Badge>
          <span className="chip">Class {item.conditionClass}</span>
          <span className="chip">{item.materialType}</span>
          {item.isHighValue && <span className="chip" style={{ color: '#2b2c2b' }}>🔒 High-Value Cage</span>}
          <span className="chip faint" title="QR-code tagging arrives in Phase 2">▦ QR Tag — Phase 2</span>
        </div>
      </div>

      {/* Inventory status */}
      <div className="kpi-grid mt">
        {statusCards.map((c) => (
          <KpiCard key={c.label} label={c.label} value={num(c.value)} unit={item.uom} color={c.color} />
        ))}
      </div>

      <div className="grid grid-3 mt">
        {/* Material information */}
        <Card title="Material Information">
          <InfoRow label="Item Code" value={item.itemCode} />
          <InfoRow label="Material Description" value={item.description} />
          <InfoRow label="Detailed Description" value={item.detailedDescription} />
          <InfoRow label="Trade" value={item.tradeL1} />
          <InfoRow label="Item Group" value={item.tradeL2} />
          <InfoRow label="Brand" value={item.brand} />
          <InfoRow label="Model" value={item.model} />
          <InfoRow label="UOM" value={item.uom} />
          <InfoRow label="Material Type" value={item.materialType} />
          <InfoRow label="Condition" value={`Class ${item.conditionClass} — Good Condition`} />
        </Card>

        {/* Specifications */}
        <Card title="Material Specifications">
          <InfoRow label="Unit Price" value={peso(item.unitPrice, { decimals: 2 })} />
          <InfoRow label="Discounted Price" value={peso(item.discountedPrice, { decimals: 2 })} />
          <InfoRow label="Inventory Value" value={peso(item.inventoryValue)} />
          <InfoRow label="Minimum Stock Level" value={`${num(item.minLevel)} ${item.uom}`} />
          <InfoRow label="Issue Frequency" value={`${item.issueFrequency} / month`} />
          <InfoRow label="Last Movement" value={fmtDate(item.lastMovement)} />
          <InfoRow label="Project Source" value="Central Warehouse Taytay" />
          <div className="mt-sm faint" style={{ fontSize: 12 }}>Technical dimensions & manufacturer attributes populated from the material master.</div>
        </Card>

        {/* Reference image + location */}
        <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
          <Card title="Reference Image">
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, height: 150, display: 'grid', placeItems: 'center', color: 'var(--text-faint)' }}>
              <div style={{ textAlign: 'center' }}>
                <Icon name="image" size={40} />
                <div style={{ fontSize: 12, marginTop: 6 }}>{item.itemCode}</div>
              </div>
            </div>
          </Card>
          <Card
            title="Warehouse Location"
            sub={place ? (place.recorded ? 'Recorded bin' : place.recordedArea ? 'Recorded area' : 'Inferred') : undefined}
          >
            <div className="location-crumb">
              {loc.map((s, i) => (
                <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="seg"><div className="l">{s.l}</div><div className="v">{s.v}</div></div>
                  {i < loc.length - 1 && <Icon name="chevronDown" size={16} className="arrow" style={{ transform: 'rotate(-90deg)' }} />}
                </div>
              ))}
            </div>
            <div className="card-note">
              {place?.recorded
                ? 'Read from the warehouse’s own bin list in the current stock snapshot.'
                : place?.recordedArea
                ? 'The warehouse recorded the area but not the bay, so the bay shown is inferred.'
                : 'No bin was recorded for this line, so its position is inferred from item group, value and trade.'}
            </div>
          </Card>
        </div>
      </div>

      {/* Movement history */}
      <Card title="Movement History" sub={`${moves.length} transactions`} className="mt" pad={false}>
        <DataTable
          pageSize={6}
          columns={[
            { key: 'date', label: 'Date', render: (r) => fmtDate(r.date), sortValue: (r) => r.date },
            { key: 'type', label: 'Transaction Type', render: (r) => <Badge tone={r.type === 'Incoming' ? 'ok' : r.type === 'Outgoing' ? 'info' : 'neutral'}>{r.type}</Badge> },
            { key: 'qty', label: 'Quantity', num: true, render: (r) => `${num(r.qty)} ${r.uom}` },
            { key: 'project', label: 'Project' },
            { key: 'user', label: 'User' },
            { key: 'ref', label: 'Reference No.', render: (r) => <span className="mono">{r.ref}</span> },
            { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
          ]}
          rows={moves}
        />
      </Card>

      <div className="grid grid-2 mt">
        <Card title="Current Reservations" sub={`${resv.length} active`} pad={false}>
          <DataTable
            pageSize={5}
            columns={[
              { key: 'project', label: 'Project' },
              { key: 'qty', label: 'Reserved', num: true, render: (r) => `${num(r.qty)} ${r.uom}` },
              { key: 'date', label: 'Reserved Date', render: (r) => fmtDate(r.date), sortValue: (r) => r.date },
              { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
            ]}
            rows={resv.length ? resv : []}
          />
        </Card>

        <Card title="Attached Documents">
          {docs.map((d) => (
            <div className="insight-row" key={d.name}>
              <span className="badge badge-neutral" style={{ padding: 7 }}><Icon name={d.icon} size={15} /></span>
              <div className="insight-main">
                <div className="t">{d.name}</div>
                <div className="s">{d.type}</div>
              </div>
              <button className="btn btn-sm btn-ghost">View</button>
            </div>
          ))}
        </Card>
      </div>
    </>
  )
}
