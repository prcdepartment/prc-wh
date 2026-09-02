import { facilityCapacity, WH_AREAS, areaCapacity } from '../data/warehouseMap'
import CapacityCylinder from './floorplan/CapacityCylinder'
import { num } from '../lib/format'

// A SPACE reading (pallet/shelf positions occupied), not a stock reading, so it lives on
// the floor plan that defines those positions. See facilityCapacity() and
// areaCapacity() in warehouseMap.js for the numbers behind both variants.
//
// `scope` picks what the cylinder stacks:
//   'facility'  warehouse-owned racking, then Safekeeping, then free space
//   'areas'     the five material areas in their own colours, then free space
// Both end with the remainder, which the cylinder draws as clear glass.

export default function FacilityCapacityGauge({ scope = 'facility', onPick }) {
  if (scope === 'areas') {
    const per = WH_AREAS.map((a) => ({ area: a, cap: areaCapacity(a.id) }))
    const positions = per.reduce((s, p) => s + p.cap.positions, 0)
    const used = per.reduce((s, p) => s + p.cap.used, 0)
    const free = Math.max(0, positions - used)
    const pct = (n) => (positions > 0 ? (n / positions) * 100 : 0)

    const segments = [
      ...per.map(({ area, cap }) => ({
        key: area.id,
        label: area.short || area.name,
        icon: area.icon,
        colour: `var(--fp-${area.role})`,
        pct: pct(cap.used),
        used: cap.used,
        onClick: onPick ? () => onPick(area.id) : undefined,
      })),
      { key: 'free', label: 'Free space', icon: 'box', colour: 'var(--cap-av)', pct: pct(free), used: free },
    ]

    return (
      <CapacityCylinder
        segments={segments}
        positions={positions}
        subtitle={`Space in use across ${num(positions)} pallet and shelf positions, by material area`}
      />
    )
  }

  const cap = facilityCapacity()
  const segments = [
    { key: 'warehouse', label: 'Warehouse', icon: 'warehouse', colour: 'var(--cap-wh)', pct: cap.warehousePct, used: cap.warehouseUsed },
    { key: 'safekeeping', label: 'Safekeeping', icon: 'vault', colour: 'var(--cap-sk)', pct: cap.safekeepingPct, used: cap.safekeepingUsed },
    { key: 'available', label: 'Available', icon: 'box', colour: 'var(--cap-av)', pct: cap.availablePct, used: cap.available },
  ]

  return (
    <CapacityCylinder
      segments={segments}
      positions={cap.positions}
      subtitle={`Space occupancy across ${num(cap.positions)} pallet and shelf positions`}
    />
  )
}
