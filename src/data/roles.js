// Role definitions: navigation menus, permissions, and demo accounts.
// Menu items reference route paths declared in App.jsx.

export const ROLES = {
  admin: {
    key: 'admin',
    label: 'System Administrator',
    short: 'Admin',
    desc: 'Full system, users & configuration',
    dashboard: 'admin',
    menu: [
      { section: 'Overview', items: [{ to: '/dashboard', icon: 'dashboard', label: 'Dashboard' }] },
      {
        section: 'Operations',
        items: [
          { to: '/inventory', icon: 'inventory', label: 'Inventory' },
          { to: '/safekeeping', icon: 'vault', label: 'Safekeeping' },
          { to: '/storage', icon: 'map', label: 'Floor Plan' },
          { to: '/reports', icon: 'reports', label: 'Reports' },
        ],
      },
      {
        section: 'Administration',
        items: [
          { to: '/users', icon: 'users', label: 'Users' },
          { to: '/audit', icon: 'audit', label: 'Audit Logs' },
          { to: '/settings', icon: 'settings', label: 'Settings' },
        ],
      },
    ],
    can: ['manageUsers', 'viewInventory', 'viewValue', 'viewAudit', 'settings', 'approve', 'viewAll', 'export'],
  },
  warehouse: {
    key: 'warehouse',
    label: 'Warehouse Personnel',
    short: 'Warehouse',
    desc: 'Physical operations & movement',
    dashboard: 'warehouse',
    menu: [
      { section: 'Overview', items: [{ to: '/dashboard', icon: 'dashboard', label: 'Dashboard' }] },
      {
        section: 'Warehouse',
        items: [
          { to: '/inventory', icon: 'inventory', label: 'Inventory' },
          { to: '/movement?type=incoming', icon: 'incoming', label: 'Incoming', match: '/movement' },
          { to: '/movement?type=outgoing', icon: 'outgoing', label: 'Outgoing' },
          { to: '/reservations', icon: 'reserve', label: 'Reservations', badge: 'reservations' },
          { to: '/safekeeping', icon: 'vault', label: 'Safekeeping' },
          { to: '/storage', icon: 'map', label: 'Floor Plan' },
        ],
      },
    ],
    can: ['viewInventory', 'createMovement', 'updateCondition', 'updateLocation', 'fulfillReservation'],
  },
  procurement: {
    key: 'procurement',
    label: 'Procurement Personnel',
    short: 'Procurement',
    desc: 'Replenishment & demand',
    dashboard: 'procurement',
    menu: [
      { section: 'Overview', items: [{ to: '/dashboard', icon: 'dashboard', label: 'Dashboard' }] },
      {
        section: 'Procurement',
        items: [
          { to: '/inventory', icon: 'inventory', label: 'Inventory Monitoring' },
          { to: '/low-stock', icon: 'alert', label: 'Low Stock Alerts', badge: 'lowStock' },
          { to: '/purchase-requests', icon: 'request', label: 'Purchase Requirements' },
          { to: '/safekeeping', icon: 'vault', label: 'Safekeeping' },
          { to: '/storage', icon: 'map', label: 'Floor Plan' },
          { to: '/reports', icon: 'reports', label: 'Reports' },
        ],
      },
    ],
    can: ['viewInventory', 'viewValue', 'createPurchaseRequest', 'createSafekeepingRequest', 'viewTrends'],
  },
  site: {
    key: 'site',
    label: 'Project Site Personnel',
    short: 'Project Site',
    desc: 'Requests & reservations',
    dashboard: 'site',
    menu: [
      { section: 'Overview', items: [{ to: '/dashboard', icon: 'dashboard', label: 'Dashboard' }] },
      {
        section: 'Project Site',
        items: [
          { to: '/request-materials', icon: 'request', label: 'Request Materials' },
          { to: '/reservations', icon: 'reserve', label: 'My Reservations', badge: 'reservations' },
          { to: '/delivery', icon: 'truck', label: 'Delivery Tracking' },
          { to: '/inventory', icon: 'inventory', label: 'Available Stock' },
          { to: '/storage', icon: 'map', label: 'Floor Plan' },
        ],
      },
    ],
    can: ['viewInventory', 'createMaterialRequest', 'viewReservations'],
  },
  management: {
    key: 'management',
    label: 'Management / Supervisor',
    short: 'Management',
    desc: 'Executive analytics & approvals',
    dashboard: 'management',
    menu: [
      { section: 'Overview', items: [{ to: '/dashboard', icon: 'analytics', label: 'Executive Dashboard' }] },
      {
        section: 'Management',
        items: [
          { to: '/approvals', icon: 'approve', label: 'Approvals', badge: 'approvals' },
          { to: '/inventory', icon: 'inventory', label: 'Inventory' },
          { to: '/safekeeping', icon: 'vault', label: 'Safekeeping' },
          { to: '/storage', icon: 'map', label: 'Floor Plan' },
          { to: '/reports', icon: 'reports', label: 'Reports' },
          { to: '/analytics', icon: 'trend', label: 'Analytics' },
        ],
      },
    ],
    can: ['viewInventory', 'viewValue', 'approve', 'viewAll', 'viewReservations', 'export'],
  },
}

export const ROLE_LIST = Object.values(ROLES)

// Shared navigation — the SAME items are visible to every role; `lockedFor`
// lists roles for which the item is shown but disabled (🔒).
export const NAV = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/inventory', icon: 'inventory', label: 'Inventory Masterlist' },
  // Safekeeping used to sit here; it is now the Safekeeping tab on the Dashboard.
  { to: '/storage', icon: 'map', label: 'Floor Plan' },
  { to: '/movement', icon: 'incoming', label: 'Movement History', lockedFor: ['procurement', 'site'] },
  // Deliberately not locked for anyone: the Process Flow module documents how the
  // system works and who may do what, and every audience named for it — management,
  // procurement, warehouse, developers, future administrators — needs to read it.
  { to: '/process-flow', icon: 'flow', label: 'Process Flow' },
  { to: '/users', icon: 'users', label: 'Users', lockedFor: ['warehouse', 'procurement', 'site', 'management'] },
  { to: '/settings', icon: 'settings', label: 'Settings', lockedFor: ['warehouse', 'procurement', 'site', 'management'] },
]
export const isLocked = (item, role) => Boolean(item.lockedFor?.includes(role))

export const can = (role, perm) => Boolean(ROLES[role]?.can.includes(perm))

// Demo accounts (used to auto-provision + quick sign-in on the login page).
export const DEMO_USERS = [
  { email: 'admin@megawide.com.ph', name: 'Ramon Alonzo', role: 'admin', department: 'IT / Systems', accessLevel: 'Full' },
  { email: 'warehouse@megawide.com.ph', name: 'Jestoni Cruz', role: 'warehouse', department: 'Central Warehouse', accessLevel: 'Operational' },
  { email: 'procurement@megawide.com.ph', name: 'Maria Santos', role: 'procurement', department: 'Procurement', accessLevel: 'Standard' },
  { email: 'site@megawide.com.ph', name: 'Paolo Reyes', role: 'site', department: 'Project Site — MRT7', accessLevel: 'Project' },
  { email: 'management@megawide.com.ph', name: 'Engr. Liza Tan', role: 'management', department: 'Operations Management', accessLevel: 'Executive' },
]
export const DEMO_PASSWORD = 'megawide2026'
