// Lightweight inline icon set (stroke-based, inherits currentColor).
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

const paths = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  inventory: <><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>,
  incoming: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 21h16" /></>,
  outgoing: <><path d="M12 15V3" /><path d="M7 8l5-5 5 5" /><path d="M4 21h16" /></>,
  reserve: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6M9 13h6M9 17h3" /></>,
  map: <><path d="M9 3L4 5v16l5-2 6 2 5-2V3l-5 2-6-2z" /><path d="M9 3v16M15 5v16" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0111 0" /><path d="M16 5.2a3.2 3.2 0 010 6M21 20a5.5 5.5 0 00-4-5.3" /></>,
  reports: <><path d="M6 3h9l5 5v13H6z" /><path d="M15 3v5h5" /><path d="M9 13h6M9 17h6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1l-.4-2.5H9.6L9.2 5a7 7 0 00-1.7 1l-2.4-1-2 3.4L5 11a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.4 2.5h4.8l.4-2.5a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6a7 7 0 00.1-1z" /></>,
  audit: <><path d="M9 3h6l1 2h3v16H5V5h3l1-2z" /><path d="M9 12l2 2 4-4" /></>,
  alert: <><path d="M12 3l9 16H3l9-16z" /><path d="M12 10v4M12 17h.01" /></>,
  approve: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  request: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  truck: <><rect x="1" y="6" width="13" height="10" rx="1" /><path d="M14 9h4l3 3v4h-7z" /><circle cx="5.5" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></>,
  analytics: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16l3-4 3 2 4-6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
  bell: <><path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 19a2 2 0 004 0" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>,
  moon: <><path d="M20 14A8 8 0 019 3a8 8 0 1011 11z" /></>,
  logout: <><path d="M15 3h4a1 1 0 011 1v16a1 1 0 01-1 1h-4" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  chevronDown: <><path d="M6 9l6 6 6-6" /></>,
  chevronRight: <><path d="M9 6l6 6-6 6" /></>,
  arrowUp: <><path d="M12 19V5M5 12l7-7 7 7" /></>,
  arrowDown: <><path d="M12 5v14M5 12l7 7 7-7" /></>,
  box: <><path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" /><path d="M3 7l9 4 9-4M12 11v10" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 018 0v3.5" /></>,
  // Filter-token glyphs — deliberately different silhouettes so Trade, Item Group,
  // Material and Brand stay tellable apart at 13px.
  layers: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>,
  folder: <><path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></>,
  tag: <><path d="M3 12.5V4a1 1 0 011-1h8.5L21 11.5 12.5 20 3 12.5z" /><circle cx="7.5" cy="7.5" r="1.4" /></>,
  location: <><path d="M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  doc: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5-5-9 9" /></>,
  filter: <><path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" /></>,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  warehouse: <><path d="M3 21V8l9-4 9 4v13" /><path d="M7 21v-7h10v7" /><path d="M7 17h10" /></>,
  check: <><path d="M20 6L9 17l-5-5" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h3" /></>,
  // Class A/B/C tiers — three bars of decreasing length, so it reads as a grading
  // scale rather than as another kind of grouping (layers/tag already carry those).
  grade: <><path d="M4 6h16M4 12h11M4 18h6" /></>,
  vault: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="4.5" /><path d="M12 9v1.5M12 13.5V15M9 12h1.5M13.5 12H15" /><path d="M6.5 6.5v.01M17.5 6.5v.01M6.5 17.5v.01M17.5 17.5v.01" /></>,
  // Transaction-type glyphs for the + New Transaction menu. Each silhouette is
  // deliberately distinct so the five entries stay tellable apart at 16px:
  // a docket for Receipt, a hand-off for Issuance, opposed arrows for Transfer,
  // a curved arrow for Return, a bookmarked slot for Reservation.
  receipt: <><path d="M6 2.5h12v19l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4v-19z" /><path d="M9 7.5h6M9 11.5h6M9 15.5h3" /></>,
  issue: <><path d="M3 12h11" /><path d="M10 8l4 4-4 4" /><path d="M17 3h4v18h-4" /></>,
  transfer: <><path d="M4 8h13" /><path d="M13 4l4 4-4 4" /><path d="M20 16H7" /><path d="M11 12l-4 4 4 4" /></>,
  return: <><path d="M3 10h11a5 5 0 010 10H8" /><path d="M7 6l-4 4 4 4" /></>,
  excess: <><path d="M4 20h4V10H4v10zM10 20h4V4h-4v16zM16 20h4v-6h-4v6z" /></>,
  borrow: <><path d="M14 4h6v6" /><path d="M20 4l-8 8" /><path d="M10 6H4v14h14v-6" /></>,
  reorganize: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><path d="M14 6.5h5.5V12" /><path d="M17.5 9.5L19.5 12l2-2.5" /><path d="M10 17.5H4.5V12" /><path d="M6.5 14.5L4.5 12l-2 2.5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.2 9.3a2.8 2.8 0 015.4.9c0 1.9-2.6 2-2.6 3.8" /><path d="M12 17.2v.01" /></>,
  // Scrap: a bin with a crack down the lid — tells it apart from `excess` (stacked
  // bars, a surplus-of-good-stock glyph) at a glance.
  scrap: <><path d="M5 7h14l-1.2 13.2a1.8 1.8 0 01-1.8 1.6H8a1.8 1.8 0 01-1.8-1.6L5 7z" /><path d="M3 7h18M9 7V4.6A1.6 1.6 0 0110.6 3h2.8A1.6 1.6 0 0115 4.6V7" /><path d="M10.5 10.5L13.5 17M13.5 10.5l-3 6.5" /></>,
  // Deformed reinforcing bar: three bars on the diagonal with their ribs showing,
  // which is what tells rebar apart from any other bundled long stock.
  // Drawn to fill x 3..21 and y 3.4..20.9 so its INK is centred in the 24 box — an
  // icon whose artwork sits off-centre throws off the gap to the label beneath it.
  // Two inputs joining into one output — a flow diagram in miniature. Drawn rather
  // than borrowed: `layers` reads as stacked data and `reorganize` as moving stock,
  // and the Process Flow module is about neither.
  flow: <><rect x="2.5" y="3" width="6.5" height="5" rx="1.5" /><rect x="2.5" y="16" width="6.5" height="5" rx="1.5" /><rect x="15" y="9.5" width="6.5" height="5" rx="1.5" /><path d="M9 5.5h3v6.5h3" /><path d="M9 18.5h3V12" /></>,
  rebar: <>
    <path d="M3 9L21 4.5" /><path d="M6.5 6.4v3.4M10.5 5.4v3.4M14.5 4.4v3.4M18.5 3.4v3.4" />
    <path d="M3 14.5L21 10" /><path d="M6.5 11.9v3.4M10.5 10.9v3.4M14.5 9.9v3.4M18.5 8.9v3.4" />
    <path d="M3 20L21 15.5" /><path d="M6.5 17.4v3.4M10.5 16.4v3.4M14.5 15.4v3.4M18.5 14.4v3.4" />
  </>,
  // Distribution toggle glyphs: a single ring vs two concentric rings (quantity inner,
  // value outer) for the double-donut mode.
  donutSingle: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" /></>,
  donutDouble: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.6" /><circle cx="12" cy="12" r="2.2" /></>,
}

export default function Icon({ name, size = 20, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} {...P}>
      {paths[name] || paths.box}
    </svg>
  )
}
