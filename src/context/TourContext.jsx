import { createContext, useContext, useState, useCallback } from 'react'

const TourContext = createContext()

// Each step targets an element by [data-tour="key"]. `route` navigates there first,
// and `search` carries the query string a step needs — the Inventory dashboard keeps
// its sub-view in ?view=, so a step pointing at an Insights or Activity card has to
// ask for that view or its target will not be mounted when the tour looks for it.
export const TOUR_STEPS = [
  { key: 'header', route: '/dashboard', title: 'Welcome to Megawide WMS', body: 'This is your Warehouse Insights dashboard — the same view for every role, with actions locked based on your permissions. Let’s walk through the key functions.' },
  { key: 'dash-tabs', route: '/dashboard', title: 'Four Dashboards', body: 'Warehouse covers warehouse-owned stock; Safekeeping covers project-owned materials stored here as a service. Excess and Scrap — surplus and unusable material recovered from completed projects — arrive in a later phase and are locked 🔒 for now.' },
  { key: 'inv-views', route: '/dashboard', title: 'Three Warehouse Views', body: 'Overview is what you hold and what it is worth. Insights is which materials need attention. Activity is what has actually moved. Each view is linkable — the address bar remembers which one you are on.' },
  { key: 'kpis', route: '/dashboard', title: 'Inventory Composition', body: 'The gauge splits stock on hand into available and reserved. Beside it sit the six quantity figures — total, available, reserved, incoming, outgoing and damaged. Hover any tile for its definition, or click it to list the materials behind the number.' },
  { key: 'charts', route: '/dashboard', title: 'Inventory Distribution', body: 'Where the stock sits by trade — or drill into item groups — measured in quantity or in pesos. Each slice is labelled on the ring itself, so there is no colour key to decode.' },
  { key: 'insights', route: '/dashboard', search: '?view=insights', title: 'Insights', body: 'ABC analysis ranks lines by value to show which few carry most of the money; aging shows how long stock has sat unmoved. Beneath them are the ranked lists — high stock, high value, low stock, fast moving and dead stock. Click any row to open that material’s profile.' },
  { key: 'activity', route: '/dashboard', search: '?view=activity', title: 'Activity', body: 'Everything here is recorded movement: history over time, net change per period with a running total, and the materials most received and most issued. Periods the ledger does not cover are drawn hollow rather than as zero.' },
  { key: 'add-btn', route: '/dashboard', title: 'New Transaction', body: 'Every creation flow starts here: Receipt, Issuance, Transfer, Return and Reservation. Receipt captures materials with SAP-format item codes (DD-DD-DDD); Transfer → Safekeeping raises a safekeeping request. Entries your role can’t create are locked 🔒.' },
  { key: 'nav', route: '/dashboard', title: 'Navigation', body: 'Your menu adapts to your role. Warehouse handles movement & storage; Procurement sees replenishment; Site requests materials; Management approves.' },
  { key: 'topbar-tools', route: '/dashboard', title: 'Tools & Theme', body: 'Switch roles to preview access levels, toggle light/dark mode, and check notifications for low stock and pending approvals.' },
  { key: 'qty-dropdown', route: '/inventory', title: 'Quantity Status View', body: 'On the inventory master list, switch the prioritized quantity column — Total, Available, Reserved, Incoming, Outgoing or Damaged — plus filters and search.' },
  { key: 'floor', route: '/storage', title: 'Warehouse Floor Plan', body: 'Three levels, drawn from the CW Taytay warehouse plan. Site shows the shed and the outdoor rebar, tiles and recovery areas; the warehouse shows the five material areas and eleven rack runs; racking opens one rack bay by bay. Click anything to see what is stored there.' },
  { key: 'process-flow', route: '/process-flow', title: 'Process Flow', body: 'A map of the system itself — the journey from login to logout, every business process, the database and its relationships, who may do what, and the security findings. Every item is labelled Implemented, In Development, Planned or Recommendation, so nothing here describes a workflow without saying whether it actually runs yet.' },
  { key: 'done', route: '/dashboard', title: 'You’re all set', body: 'That’s the Phase 1 walkthrough. Phase 2 will add QR-code tagging for scan-based movement and location updates. Explore freely — you can restart this tour anytime.' },
]

export function TourProvider({ children }) {
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)

  const startTour = useCallback(() => { setStep(0); setActive(true) }, [])
  const stop = useCallback(() => setActive(false), [])
  const next = useCallback(() => setStep((s) => Math.min(s + 1, TOUR_STEPS.length - 1)), [])
  const prev = useCallback(() => setStep((s) => Math.max(s - 1, 0)), [])

  return (
    <TourContext.Provider value={{ active, step, steps: TOUR_STEPS, startTour, stop, next, prev, isLast: step === TOUR_STEPS.length - 1 }}>
      {children}
    </TourContext.Provider>
  )
}

export const useTour = () => useContext(TourContext)
