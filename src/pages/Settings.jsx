import { useTheme } from '../context/ThemeContext'
import { TRADE_L1 } from '../data/trades'
import { byTradeL2 } from '../data/insights'
import { Card, Badge } from '../components/ui'
import { hydrationStatus } from '../lib/hydrate'
import Icon from '../lib/icons'

const ROW_LABELS = {
  inventory: 'Inventory line items',
  ledger: 'Movement ledger rows',
  safekeeping: 'Safekeeping sheet rows',
  delivery: 'Delivery tracker rows',
  movements: 'Recorded movements',
  reservations: 'Reservations',
}

export default function Settings() {
  const { theme, toggle } = useTheme()
  const subs = byTradeL2()
  const live = hydrationStatus.source === 'postgres'

  return (
    <>
      <div className="section-note">Configuration & master data management</div>

      {/* Where the numbers on every other page actually came from this session. */}
      <Card className="mt" title="Data source">
        <div className="spread">
          <div>
            <b>{live ? 'Supabase Postgres' : 'No data loaded'}</b>
            <div className="muted" style={{ fontSize: 12 }}>
              {live
                ? <>
                    Loaded from the database at sign-in.
                    {/* Which workbook the figures are, as the database itself reports it.
                        Worth stating here because an administrator can replace it from
                        Import Data, so it is no longer a constant anyone can read off a
                        source file. */}
                    {hydrationStatus.snapshotDate && <> Snapshot <b>{hydrationStatus.snapshotDate}</b>
                      {hydrationStatus.snapshotSource && <>, from {hydrationStatus.snapshotSource}</>}.</>}
                  </>
                : `The app carries no built-in dataset — everything comes from the database${hydrationStatus.error ? `. Reason: ${hydrationStatus.error}` : ''}.`}
            </div>
          </div>
          <Badge tone={live ? 'ok' : 'danger'}>{live ? 'Live' : 'Not loaded'}</Badge>
        </div>
        {live && (
          <>
            <div className="divider" />
            <div className="wrap-gap">
              {Object.entries(hydrationStatus.counts).map(([k, v]) => (
                <span key={k} className="chip">{ROW_LABELS[k] || k} <b className="faint">{v}</b></span>
              ))}
            </div>
          </>
        )}
      </Card>

      <div className="grid grid-2 mt">
        <Card title="Appearance">
          <div className="spread">
            <div><b>Theme</b><div className="muted">Light / Dark mode</div></div>
            <button className="btn" onClick={toggle}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} /> {theme === 'light' ? 'Dark' : 'Light'} Mode</button>
          </div>
          <div className="divider" />
          <div className="spread"><div><b>Warehouse</b><div className="muted">Active warehouse</div></div><span className="chip">Central Warehouse Taytay</span></div>
          <div className="divider" />
          <div className="spread"><div><b>Currency</b><div className="muted">Display currency</div></div><span className="chip">PHP (₱)</span></div>
        </Card>

        <Card title="Approval Workflows">
          {[
            ['Incoming Material Acceptance', 'Warehouse → Supervisor approval'],
            ['Outgoing / Release', 'Site request → Warehouse release'],
            ['Excess Material Return', 'Site → Inspection → Supervisor'],
            ['Damaged / Disposal (Class D)', 'Warehouse → Supervisor review'],
          ].map(([t, d]) => (
            <div className="spread" key={t} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div><b>{t}</b><div className="muted" style={{ fontSize: 12 }}>{d}</div></div>
              <Badge tone="ok">Enabled</Badge>
            </div>
          ))}
        </Card>
      </div>

      <div className="grid grid-2 mt">
        <Card title="Trades" sub={`${TRADE_L1.length} trades`}>
          <div className="wrap-gap">{TRADE_L1.map((c) => <span key={c} className="chip">{c}</span>)}</div>
        </Card>
        <Card title="Item Groups" sub={`${subs.length} in use`}>
          <div className="wrap-gap">{subs.map((s) => <span key={s.name} className="chip">{s.name} <b className="faint">{s.count}</b></span>)}</div>
        </Card>
      </div>

      <Card className="mt" title="Warehouse Locations">
        <div className="wrap-gap">
          {['A', 'B', 'C', 'D', 'E'].map((z) => <span key={z} className="chip"><Icon name="location" size={13} /> Zone {z}</span>)}
        </div>
        <div className="muted mt-sm" style={{ fontSize: 12 }}>Structure: Warehouse → Zone → Rack → Shelf → Bin</div>
      </Card>
    </>
  )
}
