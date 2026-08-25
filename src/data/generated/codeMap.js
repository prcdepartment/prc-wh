// GENERATED FILE — DO NOT EDIT BY HAND.
// Produced by scripts/generate-code-model.mjs by walking src/.
// Regenerate with:  npm run model
//
// A STATIC read of import statements and Supabase call-site text — not a runtime
// trace. It records what the source declares, which is what the Process Flow
// architecture view reports.

export const CODE = {
  "generatedFrom": "src/**",
  "fileCount": 77,
  "totalLines": 18124,
  "counts": {
    "entry": 2,
    "component": 17,
    "floorplan": 7,
    "processflow": 4,
    "context": 4,
    "data": 14,
    "lib": 5,
    "page": 18,
    "dashboard-tab": 3,
    "style": 3
  },
  "routes": [
    {
      "path": "/login",
      "protected": false,
      "redirect": true,
      "component": "Login"
    },
    {
      "path": "/dashboard",
      "protected": true,
      "redirect": false,
      "component": "Dashboard"
    },
    {
      "path": "/inventory",
      "protected": true,
      "redirect": false,
      "component": "Inventory"
    },
    {
      "path": "/inventory/:id",
      "protected": true,
      "redirect": false,
      "component": "MaterialProfile"
    },
    {
      "path": "/movement",
      "protected": true,
      "redirect": false,
      "component": "Movement"
    },
    {
      "path": "/reservations",
      "protected": true,
      "redirect": false,
      "component": "Reservations"
    },
    {
      "path": "/approvals",
      "protected": true,
      "redirect": false,
      "component": "Approvals"
    },
    {
      "path": "/users",
      "protected": true,
      "redirect": false,
      "component": "Users"
    },
    {
      "path": "/audit",
      "protected": true,
      "redirect": false,
      "component": "AuditLogs"
    },
    {
      "path": "/reports",
      "protected": true,
      "redirect": false,
      "component": "Reports"
    },
    {
      "path": "/analytics",
      "protected": true,
      "redirect": false,
      "component": "Analytics"
    },
    {
      "path": "/storage",
      "protected": true,
      "redirect": false,
      "component": "StorageMap"
    },
    {
      "path": "/settings",
      "protected": true,
      "redirect": false,
      "component": "Settings"
    },
    {
      "path": "/low-stock",
      "protected": true,
      "redirect": false,
      "component": "LowStock"
    },
    {
      "path": "/purchase-requests",
      "protected": true,
      "redirect": false,
      "component": "PurchaseRequests"
    },
    {
      "path": "/request-materials",
      "protected": true,
      "redirect": false,
      "component": "RequestMaterials"
    },
    {
      "path": "/delivery",
      "protected": true,
      "redirect": false,
      "component": "DeliveryTracking"
    },
    {
      "path": "/process-flow",
      "protected": true,
      "redirect": false,
      "component": "ProcessFlow"
    },
    {
      "path": "/safekeeping",
      "protected": false,
      "redirect": true,
      "component": "<Navigate to=\"/dashboard?tab=safekeeping\" replace />"
    },
    {
      "path": "*",
      "protected": false,
      "redirect": true,
      "component": "<Navigate to={user ? '/dashboard' : '/login'} replace />"
    }
  ],
  "orphans": [],
  "dependencies": [
    {
      "name": "@supabase/supabase-js",
      "range": "^2.45.4",
      "dev": false,
      "imported": true,
      "importedBy": [
        "src/lib/supabase.js"
      ]
    },
    {
      "name": "react",
      "range": "^18.3.1",
      "dev": false,
      "imported": true,
      "importedBy": [
        "src/App.jsx",
        "src/components/AddMaterialModal.jsx",
        "src/components/AddSafekeepingRequestModal.jsx",
        "src/components/DataSheet.jsx",
        "src/components/DateTimeField.jsx",
        "src/components/DeliveryTracker.jsx",
        "src/components/FacilityCapacityGauge.jsx",
        "src/components/FilterSearch.jsx",
        "src/components/InventoryComposition.jsx",
        "src/components/ItemLookup.jsx",
        "src/components/Layout.jsx",
        "src/components/NewTransactionMenu.jsx",
        "src/components/Select.jsx",
        "src/components/Tour.jsx",
        "src/components/charts.jsx",
        "src/components/floorplan/LocationPanel.jsx",
        "src/components/processflow/ErdDiagram.jsx",
        "src/components/processflow/FlowDiagram.jsx",
        "src/components/processflow/LiveProbe.jsx",
        "src/components/ui.jsx",
        "src/context/AuthContext.jsx",
        "src/context/SafekeepingContext.jsx",
        "src/context/ThemeContext.jsx",
        "src/context/TourContext.jsx",
        "src/main.jsx",
        "src/pages/Analytics.jsx",
        "src/pages/Approvals.jsx",
        "src/pages/AuditLogs.jsx",
        "src/pages/Dashboard.jsx",
        "src/pages/Inventory.jsx",
        "src/pages/Login.jsx",
        "src/pages/Movement.jsx",
        "src/pages/ProcessFlow.jsx",
        "src/pages/PurchaseRequests.jsx",
        "src/pages/RequestMaterials.jsx",
        "src/pages/Reservations.jsx",
        "src/pages/StorageMap.jsx",
        "src/pages/Users.jsx",
        "src/pages/dashboard/InventoryTab.jsx",
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "name": "react-dom",
      "range": "^18.3.1",
      "dev": false,
      "imported": true,
      "importedBy": [
        "src/main.jsx"
      ]
    },
    {
      "name": "react-router-dom",
      "range": "^6.26.2",
      "dev": false,
      "imported": true,
      "importedBy": [
        "src/App.jsx",
        "src/components/InventoryComposition.jsx",
        "src/components/Layout.jsx",
        "src/components/MaterialList.jsx",
        "src/components/Tour.jsx",
        "src/components/floorplan/LocationPanel.jsx",
        "src/main.jsx",
        "src/pages/Approvals.jsx",
        "src/pages/Dashboard.jsx",
        "src/pages/Inventory.jsx",
        "src/pages/Login.jsx",
        "src/pages/LowStock.jsx",
        "src/pages/MaterialProfile.jsx",
        "src/pages/Movement.jsx",
        "src/pages/ProcessFlow.jsx",
        "src/pages/Reservations.jsx",
        "src/pages/StorageMap.jsx",
        "src/pages/dashboard/InventoryTab.jsx",
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "name": "recharts",
      "range": "^2.12.7",
      "dev": false,
      "imported": true,
      "importedBy": [
        "src/components/charts.jsx"
      ]
    },
    {
      "name": "@vitejs/plugin-react",
      "range": "^4.3.1",
      "dev": true,
      "imported": true,
      "importedBy": [
        "vite.config.js"
      ]
    },
    {
      "name": "vite",
      "range": "^5.4.8",
      "dev": true,
      "imported": true,
      "importedBy": [
        "vite.config.js"
      ]
    }
  ],
  "undeclared": [],
  "files": [
    {
      "path": "src/App.jsx",
      "name": "App.jsx",
      "kind": "entry",
      "lines": 77,
      "bytes": 4251,
      "imports": [
        "src/components/Layout.jsx",
        "src/context/AuthContext.jsx",
        "src/pages/Analytics.jsx",
        "src/pages/Approvals.jsx",
        "src/pages/AuditLogs.jsx",
        "src/pages/Dashboard.jsx",
        "src/pages/DeliveryTracking.jsx",
        "src/pages/Inventory.jsx",
        "src/pages/Login.jsx",
        "src/pages/LowStock.jsx",
        "src/pages/MaterialProfile.jsx",
        "src/pages/Movement.jsx",
        "src/pages/ProcessFlow.jsx",
        "src/pages/PurchaseRequests.jsx",
        "src/pages/Reports.jsx",
        "src/pages/RequestMaterials.jsx",
        "src/pages/Reservations.jsx",
        "src/pages/Settings.jsx",
        "src/pages/StorageMap.jsx",
        "src/pages/Users.jsx"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": true,
      "importedBy": [
        "src/main.jsx"
      ]
    },
    {
      "path": "src/components/AddMaterialModal.jsx",
      "name": "AddMaterialModal.jsx",
      "kind": "component",
      "lines": 256,
      "bytes": 12333,
      "imports": [
        "src/components/ItemLookup.jsx",
        "src/components/Select.jsx",
        "src/components/ui.jsx",
        "src/data/insights.js",
        "src/data/trades.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/Dashboard.jsx",
        "src/pages/Inventory.jsx"
      ]
    },
    {
      "path": "src/components/AddSafekeepingRequestModal.jsx",
      "name": "AddSafekeepingRequestModal.jsx",
      "kind": "component",
      "lines": 594,
      "bytes": 32331,
      "imports": [
        "src/components/DateTimeField.jsx",
        "src/components/ItemLookup.jsx",
        "src/components/Select.jsx",
        "src/components/ui.jsx",
        "src/context/SafekeepingContext.jsx",
        "src/data/projects.js",
        "src/data/safekeeping.js",
        "src/data/trades.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/Dashboard.jsx"
      ]
    },
    {
      "path": "src/components/DataSheet.jsx",
      "name": "DataSheet.jsx",
      "kind": "component",
      "lines": 290,
      "bytes": 13888,
      "imports": [
        "src/components/ui.jsx",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/DeliveryTracker.jsx",
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "path": "src/components/DateTimeField.jsx",
      "name": "DateTimeField.jsx",
      "kind": "component",
      "lines": 174,
      "bytes": 8041,
      "imports": [
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/AddSafekeepingRequestModal.jsx"
      ]
    },
    {
      "path": "src/components/DeliveryTracker.jsx",
      "name": "DeliveryTracker.jsx",
      "kind": "component",
      "lines": 194,
      "bytes": 9146,
      "imports": [
        "src/components/DataSheet.jsx",
        "src/components/ItemLookup.jsx",
        "src/components/Select.jsx",
        "src/components/ui.jsx",
        "src/context/ThemeContext.jsx",
        "src/data/deliveryTracker.js",
        "src/lib/colors.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "path": "src/components/FacilityCapacityGauge.jsx",
      "name": "FacilityCapacityGauge.jsx",
      "kind": "component",
      "lines": 172,
      "bytes": 8130,
      "imports": [
        "src/data/warehouseMap.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/StorageMap.jsx"
      ]
    },
    {
      "path": "src/components/FilterSearch.jsx",
      "name": "FilterSearch.jsx",
      "kind": "component",
      "lines": 192,
      "bytes": 8048,
      "imports": [
        "src/data/insights.js",
        "src/data/trades.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/Dashboard.jsx"
      ]
    },
    {
      "path": "src/components/InventoryComposition.jsx",
      "name": "InventoryComposition.jsx",
      "kind": "component",
      "lines": 150,
      "bytes": 7603,
      "imports": [
        "src/components/ui.jsx",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/dashboard/InventoryTab.jsx"
      ]
    },
    {
      "path": "src/components/ItemLookup.jsx",
      "name": "ItemLookup.jsx",
      "kind": "component",
      "lines": 112,
      "bytes": 4740,
      "imports": [
        "src/components/Select.jsx",
        "src/lib/hydrate.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [
        {
          "op": "select",
          "table": "item_master"
        }
      ],
      "lazy": false,
      "importedBy": [
        "src/components/AddMaterialModal.jsx",
        "src/components/AddSafekeepingRequestModal.jsx",
        "src/components/DeliveryTracker.jsx"
      ]
    },
    {
      "path": "src/components/Layout.jsx",
      "name": "Layout.jsx",
      "kind": "component",
      "lines": 266,
      "bytes": 12116,
      "imports": [
        "src/components/Logo.jsx",
        "src/components/Tour.jsx",
        "src/context/AuthContext.jsx",
        "src/context/ThemeContext.jsx",
        "src/context/TourContext.jsx",
        "src/data/roles.js",
        "src/data/transactions.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/components/Logo.jsx",
      "name": "Logo.jsx",
      "kind": "component",
      "lines": 41,
      "bytes": 1768,
      "imports": [
        "src/context/ThemeContext.jsx"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/Layout.jsx",
        "src/pages/Login.jsx"
      ]
    },
    {
      "path": "src/components/MaterialList.jsx",
      "name": "MaterialList.jsx",
      "kind": "component",
      "lines": 132,
      "bytes": 5984,
      "imports": [
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/dashboard/InventoryTab.jsx",
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "path": "src/components/NewTransactionMenu.jsx",
      "name": "NewTransactionMenu.jsx",
      "kind": "component",
      "lines": 145,
      "bytes": 5791,
      "imports": [
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/Dashboard.jsx"
      ]
    },
    {
      "path": "src/components/Select.jsx",
      "name": "Select.jsx",
      "kind": "component",
      "lines": 68,
      "bytes": 3189,
      "imports": [
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/AddMaterialModal.jsx",
        "src/components/AddSafekeepingRequestModal.jsx",
        "src/components/DeliveryTracker.jsx",
        "src/components/ItemLookup.jsx",
        "src/pages/Inventory.jsx",
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "path": "src/components/Tour.jsx",
      "name": "Tour.jsx",
      "kind": "component",
      "lines": 100,
      "bytes": 4201,
      "imports": [
        "src/context/TourContext.jsx",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/Layout.jsx"
      ]
    },
    {
      "path": "src/components/charts.jsx",
      "name": "charts.jsx",
      "kind": "component",
      "lines": 879,
      "bytes": 49562,
      "imports": [
        "src/context/ThemeContext.jsx",
        "src/lib/colors.js",
        "src/lib/format.js"
      ],
      "packages": [
        "react",
        "recharts"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/Analytics.jsx",
        "src/pages/Reports.jsx",
        "src/pages/dashboard/InventoryTab.jsx",
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "path": "src/components/floorplan/LocationPanel.jsx",
      "name": "LocationPanel.jsx",
      "kind": "floorplan",
      "lines": 103,
      "bytes": 4804,
      "imports": [
        "src/data/warehouseMap.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/StorageMap.jsx"
      ]
    },
    {
      "path": "src/components/floorplan/RackElevation.jsx",
      "name": "RackElevation.jsx",
      "kind": "floorplan",
      "lines": 250,
      "bytes": 11530,
      "imports": [
        "src/data/warehouseMap.js"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/StorageMap.jsx"
      ]
    },
    {
      "path": "src/components/floorplan/SitePlan.jsx",
      "name": "SitePlan.jsx",
      "kind": "floorplan",
      "lines": 121,
      "bytes": 5164,
      "imports": [
        "src/components/floorplan/planDefs.jsx",
        "src/components/floorplan/planIdCard.jsx",
        "src/components/floorplan/planText.jsx",
        "src/data/warehouseMap.js"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/StorageMap.jsx"
      ]
    },
    {
      "path": "src/components/floorplan/WarehousePlan.jsx",
      "name": "WarehousePlan.jsx",
      "kind": "floorplan",
      "lines": 229,
      "bytes": 11136,
      "imports": [
        "src/components/floorplan/planDefs.jsx",
        "src/components/floorplan/planIdCard.jsx",
        "src/components/floorplan/planText.jsx",
        "src/data/warehouseMap.js"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/StorageMap.jsx"
      ]
    },
    {
      "path": "src/components/floorplan/planDefs.jsx",
      "name": "planDefs.jsx",
      "kind": "floorplan",
      "lines": 58,
      "bytes": 2761,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/floorplan/SitePlan.jsx",
        "src/components/floorplan/WarehousePlan.jsx"
      ]
    },
    {
      "path": "src/components/floorplan/planIdCard.jsx",
      "name": "planIdCard.jsx",
      "kind": "floorplan",
      "lines": 78,
      "bytes": 3289,
      "imports": [
        "src/components/floorplan/planText.jsx",
        "src/lib/icons.jsx"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/floorplan/SitePlan.jsx",
        "src/components/floorplan/WarehousePlan.jsx"
      ]
    },
    {
      "path": "src/components/floorplan/planText.jsx",
      "name": "planText.jsx",
      "kind": "floorplan",
      "lines": 93,
      "bytes": 3634,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/floorplan/SitePlan.jsx",
        "src/components/floorplan/WarehousePlan.jsx",
        "src/components/floorplan/planIdCard.jsx"
      ]
    },
    {
      "path": "src/components/processflow/ErdDiagram.jsx",
      "name": "ErdDiagram.jsx",
      "kind": "processflow",
      "lines": 264,
      "bytes": 10672,
      "imports": [
        "src/components/processflow/FlowDiagram.jsx",
        "src/data/processFlow.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/ProcessFlow.jsx"
      ]
    },
    {
      "path": "src/components/processflow/FlowDiagram.jsx",
      "name": "FlowDiagram.jsx",
      "kind": "processflow",
      "lines": 359,
      "bytes": 14268,
      "imports": [
        "src/data/processFlow.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/processflow/ErdDiagram.jsx",
        "src/pages/ProcessFlow.jsx"
      ]
    },
    {
      "path": "src/components/processflow/LiveProbe.jsx",
      "name": "LiveProbe.jsx",
      "kind": "processflow",
      "lines": 182,
      "bytes": 8176,
      "imports": [
        "src/components/ui.jsx",
        "src/data/processFlow.js",
        "src/lib/hydrate.js",
        "src/lib/icons.jsx",
        "src/lib/supabase.js"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/ProcessFlow.jsx"
      ]
    },
    {
      "path": "src/components/processflow/pfUi.jsx",
      "name": "pfUi.jsx",
      "kind": "processflow",
      "lines": 144,
      "bytes": 4980,
      "imports": [
        "src/data/processFlow.js",
        "src/lib/icons.jsx"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/ProcessFlow.jsx"
      ]
    },
    {
      "path": "src/components/ui.jsx",
      "name": "ui.jsx",
      "kind": "component",
      "lines": 284,
      "bytes": 11362,
      "imports": [
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/AddMaterialModal.jsx",
        "src/components/AddSafekeepingRequestModal.jsx",
        "src/components/DataSheet.jsx",
        "src/components/DeliveryTracker.jsx",
        "src/components/InventoryComposition.jsx",
        "src/components/processflow/LiveProbe.jsx",
        "src/pages/Analytics.jsx",
        "src/pages/Approvals.jsx",
        "src/pages/AuditLogs.jsx",
        "src/pages/DeliveryTracking.jsx",
        "src/pages/Inventory.jsx",
        "src/pages/LowStock.jsx",
        "src/pages/MaterialProfile.jsx",
        "src/pages/Movement.jsx",
        "src/pages/ProcessFlow.jsx",
        "src/pages/PurchaseRequests.jsx",
        "src/pages/Reports.jsx",
        "src/pages/RequestMaterials.jsx",
        "src/pages/Reservations.jsx",
        "src/pages/Settings.jsx",
        "src/pages/StorageMap.jsx",
        "src/pages/Users.jsx",
        "src/pages/dashboard/InventoryTab.jsx",
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "path": "src/context/AuthContext.jsx",
      "name": "AuthContext.jsx",
      "kind": "context",
      "lines": 126,
      "bytes": 4598,
      "imports": [
        "src/data/roles.js",
        "src/lib/hydrate.js",
        "src/lib/supabase.js"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [
        {
          "op": "from",
          "table": "profiles"
        },
        {
          "op": "select",
          "table": "profiles"
        },
        {
          "op": "auth.signIn",
          "table": null
        },
        {
          "op": "auth.signOut",
          "table": null
        },
        {
          "op": "auth.getSession",
          "table": null
        },
        {
          "op": "auth.onStateChange",
          "table": null
        }
      ],
      "lazy": false,
      "importedBy": [
        "src/App.jsx",
        "src/components/Layout.jsx",
        "src/main.jsx",
        "src/pages/Dashboard.jsx",
        "src/pages/Inventory.jsx",
        "src/pages/Login.jsx"
      ]
    },
    {
      "path": "src/context/SafekeepingContext.jsx",
      "name": "SafekeepingContext.jsx",
      "kind": "context",
      "lines": 79,
      "bytes": 3065,
      "imports": [
        "src/lib/supabase.js"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [
        {
          "op": "from",
          "table": "safekeeping_requests"
        },
        {
          "op": "select",
          "table": "safekeeping_requests"
        },
        {
          "op": "insert",
          "table": null
        },
        {
          "op": "auth.getSession",
          "table": null
        },
        {
          "op": "auth.onStateChange",
          "table": null
        }
      ],
      "lazy": false,
      "importedBy": [
        "src/components/AddSafekeepingRequestModal.jsx",
        "src/main.jsx"
      ]
    },
    {
      "path": "src/context/ThemeContext.jsx",
      "name": "ThemeContext.jsx",
      "kind": "context",
      "lines": 19,
      "bytes": 616,
      "imports": [],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/DeliveryTracker.jsx",
        "src/components/Layout.jsx",
        "src/components/Logo.jsx",
        "src/components/charts.jsx",
        "src/main.jsx",
        "src/pages/Login.jsx",
        "src/pages/MaterialProfile.jsx",
        "src/pages/Settings.jsx",
        "src/pages/dashboard/InventoryTab.jsx",
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "path": "src/context/TourContext.jsx",
      "name": "TourContext.jsx",
      "kind": "context",
      "lines": 43,
      "bytes": 5326,
      "imports": [],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/Layout.jsx",
        "src/components/Tour.jsx",
        "src/main.jsx"
      ]
    },
    {
      "path": "src/data/deliveryTracker.js",
      "name": "deliveryTracker.js",
      "kind": "data",
      "lines": 88,
      "bytes": 4473,
      "imports": [
        "src/data/deliveryTrackerSheet.js"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/DeliveryTracker.jsx",
        "src/lib/hydrate.js"
      ]
    },
    {
      "path": "src/data/deliveryTrackerSheet.js",
      "name": "deliveryTrackerSheet.js",
      "kind": "data",
      "lines": 5,
      "bytes": 292,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/data/deliveryTracker.js",
        "src/lib/hydrate.js"
      ]
    },
    {
      "path": "src/data/insights.js",
      "name": "insights.js",
      "kind": "data",
      "lines": 550,
      "bytes": 25897,
      "imports": [
        "src/data/inventory.js",
        "src/data/ledger.js",
        "src/data/trades.js",
        "src/lib/format.js"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/AddMaterialModal.jsx",
        "src/components/FilterSearch.jsx",
        "src/data/transactions.js",
        "src/data/warehouseMap.js",
        "src/lib/hydrate.js",
        "src/pages/Analytics.jsx",
        "src/pages/Dashboard.jsx",
        "src/pages/Inventory.jsx",
        "src/pages/Login.jsx",
        "src/pages/LowStock.jsx",
        "src/pages/MaterialProfile.jsx",
        "src/pages/Movement.jsx",
        "src/pages/Reports.jsx",
        "src/pages/RequestMaterials.jsx",
        "src/pages/Settings.jsx",
        "src/pages/StorageMap.jsx",
        "src/pages/dashboard/InventoryTab.jsx"
      ]
    },
    {
      "path": "src/data/inventory.js",
      "name": "inventory.js",
      "kind": "data",
      "lines": 13,
      "bytes": 745,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/data/insights.js",
        "src/lib/hydrate.js"
      ]
    },
    {
      "path": "src/data/ledger.js",
      "name": "ledger.js",
      "kind": "data",
      "lines": 23,
      "bytes": 982,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/data/insights.js",
        "src/lib/hydrate.js"
      ]
    },
    {
      "path": "src/data/processFlow.js",
      "name": "processFlow.js",
      "kind": "data",
      "lines": 2370,
      "bytes": 109989,
      "imports": [
        "src/data/roles.js"
      ],
      "packages": [],
      "dbOps": [
        {
          "op": "select",
          "table": "item_master"
        },
        {
          "op": "auth.signIn",
          "table": null
        },
        {
          "op": "auth.signOut",
          "table": null
        },
        {
          "op": "auth.getSession",
          "table": null
        },
        {
          "op": "auth.onStateChange",
          "table": null
        }
      ],
      "lazy": false,
      "importedBy": [
        "src/components/processflow/ErdDiagram.jsx",
        "src/components/processflow/FlowDiagram.jsx",
        "src/components/processflow/LiveProbe.jsx",
        "src/components/processflow/pfUi.jsx",
        "src/pages/ProcessFlow.jsx"
      ]
    },
    {
      "path": "src/data/projects.js",
      "name": "projects.js",
      "kind": "data",
      "lines": 20,
      "bytes": 728,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/AddSafekeepingRequestModal.jsx",
        "src/lib/hydrate.js"
      ]
    },
    {
      "path": "src/data/roles.js",
      "name": "roles.js",
      "kind": "data",
      "lines": 152,
      "bytes": 6953,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/Layout.jsx",
        "src/context/AuthContext.jsx",
        "src/data/processFlow.js",
        "src/pages/Dashboard.jsx",
        "src/pages/Inventory.jsx",
        "src/pages/Login.jsx",
        "src/pages/Users.jsx"
      ]
    },
    {
      "path": "src/data/safekeeping.js",
      "name": "safekeeping.js",
      "kind": "data",
      "lines": 82,
      "bytes": 3844,
      "imports": [
        "src/data/safekeepingSheets.js",
        "src/data/trades.js"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/AddSafekeepingRequestModal.jsx",
        "src/data/safekeepingInsights.js",
        "src/lib/hydrate.js",
        "src/pages/Dashboard.jsx",
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "path": "src/data/safekeepingInsights.js",
      "name": "safekeepingInsights.js",
      "kind": "data",
      "lines": 168,
      "bytes": 8282,
      "imports": [
        "src/data/safekeeping.js"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "path": "src/data/safekeepingSheets.js",
      "name": "safekeepingSheets.js",
      "kind": "data",
      "lines": 8,
      "bytes": 399,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/data/safekeeping.js",
        "src/lib/hydrate.js"
      ]
    },
    {
      "path": "src/data/trades.js",
      "name": "trades.js",
      "kind": "data",
      "lines": 86,
      "bytes": 2871,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/AddMaterialModal.jsx",
        "src/components/AddSafekeepingRequestModal.jsx",
        "src/components/FilterSearch.jsx",
        "src/data/insights.js",
        "src/data/safekeeping.js",
        "src/pages/Settings.jsx"
      ]
    },
    {
      "path": "src/data/transactions.js",
      "name": "transactions.js",
      "kind": "data",
      "lines": 73,
      "bytes": 2975,
      "imports": [
        "src/data/insights.js",
        "src/lib/format.js"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/Layout.jsx",
        "src/lib/hydrate.js",
        "src/pages/Approvals.jsx",
        "src/pages/AuditLogs.jsx",
        "src/pages/DeliveryTracking.jsx",
        "src/pages/MaterialProfile.jsx",
        "src/pages/Movement.jsx",
        "src/pages/PurchaseRequests.jsx",
        "src/pages/RequestMaterials.jsx",
        "src/pages/Reservations.jsx"
      ]
    },
    {
      "path": "src/data/warehouseMap.js",
      "name": "warehouseMap.js",
      "kind": "data",
      "lines": 574,
      "bytes": 26713,
      "imports": [
        "src/data/insights.js"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/FacilityCapacityGauge.jsx",
        "src/components/floorplan/LocationPanel.jsx",
        "src/components/floorplan/RackElevation.jsx",
        "src/components/floorplan/SitePlan.jsx",
        "src/components/floorplan/WarehousePlan.jsx",
        "src/pages/MaterialProfile.jsx",
        "src/pages/StorageMap.jsx"
      ]
    },
    {
      "path": "src/lib/colors.js",
      "name": "colors.js",
      "kind": "lib",
      "lines": 162,
      "bytes": 6391,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/DeliveryTracker.jsx",
        "src/components/charts.jsx",
        "src/pages/MaterialProfile.jsx",
        "src/pages/dashboard/InventoryTab.jsx",
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "path": "src/lib/format.js",
      "name": "format.js",
      "kind": "lib",
      "lines": 106,
      "bytes": 4000,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/AddMaterialModal.jsx",
        "src/components/AddSafekeepingRequestModal.jsx",
        "src/components/DataSheet.jsx",
        "src/components/DateTimeField.jsx",
        "src/components/DeliveryTracker.jsx",
        "src/components/FacilityCapacityGauge.jsx",
        "src/components/InventoryComposition.jsx",
        "src/components/Layout.jsx",
        "src/components/MaterialList.jsx",
        "src/components/charts.jsx",
        "src/components/floorplan/LocationPanel.jsx",
        "src/data/insights.js",
        "src/data/transactions.js",
        "src/pages/Analytics.jsx",
        "src/pages/Approvals.jsx",
        "src/pages/AuditLogs.jsx",
        "src/pages/DeliveryTracking.jsx",
        "src/pages/Inventory.jsx",
        "src/pages/Login.jsx",
        "src/pages/LowStock.jsx",
        "src/pages/MaterialProfile.jsx",
        "src/pages/Movement.jsx",
        "src/pages/PurchaseRequests.jsx",
        "src/pages/Reports.jsx",
        "src/pages/RequestMaterials.jsx",
        "src/pages/Reservations.jsx",
        "src/pages/StorageMap.jsx",
        "src/pages/Users.jsx",
        "src/pages/dashboard/InventoryTab.jsx",
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "path": "src/lib/hydrate.js",
      "name": "hydrate.js",
      "kind": "lib",
      "lines": 204,
      "bytes": 9127,
      "imports": [
        "src/data/deliveryTracker.js",
        "src/data/deliveryTrackerSheet.js",
        "src/data/insights.js",
        "src/data/inventory.js",
        "src/data/ledger.js",
        "src/data/projects.js",
        "src/data/safekeeping.js",
        "src/data/safekeepingSheets.js",
        "src/data/transactions.js",
        "src/lib/supabase.js"
      ],
      "packages": [],
      "dbOps": [
        {
          "op": "select",
          "table": "inventory"
        },
        {
          "op": "select",
          "table": "ledger"
        },
        {
          "op": "select",
          "table": "safekeeping_soh"
        },
        {
          "op": "select",
          "table": "safekeeping_incoming"
        },
        {
          "op": "select",
          "table": "safekeeping_outgoing"
        },
        {
          "op": "select",
          "table": "delivery_tracker"
        },
        {
          "op": "select",
          "table": "projects"
        },
        {
          "op": "select",
          "table": "movements"
        },
        {
          "op": "select",
          "table": "reservations"
        },
        {
          "op": "select",
          "table": "purchase_requests"
        },
        {
          "op": "select",
          "table": "material_requests"
        },
        {
          "op": "select",
          "table": "approvals"
        },
        {
          "op": "select",
          "table": "audit_log"
        },
        {
          "op": "auth.getSession",
          "table": null
        }
      ],
      "lazy": false,
      "importedBy": [
        "src/components/ItemLookup.jsx",
        "src/components/processflow/LiveProbe.jsx",
        "src/context/AuthContext.jsx",
        "src/main.jsx",
        "src/pages/Settings.jsx"
      ]
    },
    {
      "path": "src/lib/icons.jsx",
      "name": "icons.jsx",
      "kind": "lib",
      "lines": 96,
      "bytes": 8216,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/AddMaterialModal.jsx",
        "src/components/AddSafekeepingRequestModal.jsx",
        "src/components/DataSheet.jsx",
        "src/components/DateTimeField.jsx",
        "src/components/DeliveryTracker.jsx",
        "src/components/FacilityCapacityGauge.jsx",
        "src/components/FilterSearch.jsx",
        "src/components/InventoryComposition.jsx",
        "src/components/ItemLookup.jsx",
        "src/components/Layout.jsx",
        "src/components/MaterialList.jsx",
        "src/components/NewTransactionMenu.jsx",
        "src/components/Select.jsx",
        "src/components/Tour.jsx",
        "src/components/floorplan/LocationPanel.jsx",
        "src/components/floorplan/planIdCard.jsx",
        "src/components/processflow/ErdDiagram.jsx",
        "src/components/processflow/FlowDiagram.jsx",
        "src/components/processflow/LiveProbe.jsx",
        "src/components/processflow/pfUi.jsx",
        "src/components/ui.jsx",
        "src/pages/Approvals.jsx",
        "src/pages/AuditLogs.jsx",
        "src/pages/Dashboard.jsx",
        "src/pages/DeliveryTracking.jsx",
        "src/pages/Inventory.jsx",
        "src/pages/Login.jsx",
        "src/pages/MaterialProfile.jsx",
        "src/pages/Movement.jsx",
        "src/pages/ProcessFlow.jsx",
        "src/pages/PurchaseRequests.jsx",
        "src/pages/Reports.jsx",
        "src/pages/RequestMaterials.jsx",
        "src/pages/Settings.jsx",
        "src/pages/StorageMap.jsx",
        "src/pages/Users.jsx",
        "src/pages/dashboard/ExcessTab.jsx",
        "src/pages/dashboard/InventoryTab.jsx",
        "src/pages/dashboard/SafekeepingTab.jsx"
      ]
    },
    {
      "path": "src/lib/supabase.js",
      "name": "supabase.js",
      "kind": "lib",
      "lines": 13,
      "bytes": 473,
      "imports": [],
      "packages": [
        "@supabase/supabase-js"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/components/processflow/LiveProbe.jsx",
        "src/context/AuthContext.jsx",
        "src/context/SafekeepingContext.jsx",
        "src/lib/hydrate.js"
      ]
    },
    {
      "path": "src/main.jsx",
      "name": "main.jsx",
      "kind": "entry",
      "lines": 35,
      "bytes": 1408,
      "imports": [
        "src/App.jsx",
        "src/context/AuthContext.jsx",
        "src/context/SafekeepingContext.jsx",
        "src/context/ThemeContext.jsx",
        "src/context/TourContext.jsx",
        "src/lib/hydrate.js",
        "src/styles/index.css"
      ],
      "packages": [
        "react",
        "react-dom",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": []
    },
    {
      "path": "src/pages/Analytics.jsx",
      "name": "Analytics.jsx",
      "kind": "page",
      "lines": 84,
      "bytes": 4930,
      "imports": [
        "src/components/charts.jsx",
        "src/components/ui.jsx",
        "src/data/insights.js",
        "src/lib/format.js"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/Approvals.jsx",
      "name": "Approvals.jsx",
      "kind": "page",
      "lines": 57,
      "bytes": 2833,
      "imports": [
        "src/components/ui.jsx",
        "src/data/transactions.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/AuditLogs.jsx",
      "name": "AuditLogs.jsx",
      "kind": "page",
      "lines": 39,
      "bytes": 1726,
      "imports": [
        "src/components/ui.jsx",
        "src/data/transactions.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/Dashboard.jsx",
      "name": "Dashboard.jsx",
      "kind": "page",
      "lines": 149,
      "bytes": 7329,
      "imports": [
        "src/components/AddMaterialModal.jsx",
        "src/components/AddSafekeepingRequestModal.jsx",
        "src/components/FilterSearch.jsx",
        "src/components/NewTransactionMenu.jsx",
        "src/context/AuthContext.jsx",
        "src/data/insights.js",
        "src/data/roles.js",
        "src/data/safekeeping.js",
        "src/lib/icons.jsx",
        "src/pages/dashboard/ExcessTab.jsx",
        "src/pages/dashboard/InventoryTab.jsx",
        "src/pages/dashboard/SafekeepingTab.jsx"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": true,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/DeliveryTracking.jsx",
      "name": "DeliveryTracking.jsx",
      "kind": "page",
      "lines": 57,
      "bytes": 2502,
      "imports": [
        "src/components/ui.jsx",
        "src/data/transactions.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/Inventory.jsx",
      "name": "Inventory.jsx",
      "kind": "page",
      "lines": 327,
      "bytes": 16473,
      "imports": [
        "src/components/AddMaterialModal.jsx",
        "src/components/Select.jsx",
        "src/components/ui.jsx",
        "src/context/AuthContext.jsx",
        "src/data/insights.js",
        "src/data/roles.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": true,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/Login.jsx",
      "name": "Login.jsx",
      "kind": "page",
      "lines": 126,
      "bytes": 5284,
      "imports": [
        "src/components/Logo.jsx",
        "src/context/AuthContext.jsx",
        "src/context/ThemeContext.jsx",
        "src/data/insights.js",
        "src/data/roles.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/LowStock.jsx",
      "name": "LowStock.jsx",
      "kind": "page",
      "lines": 43,
      "bytes": 2258,
      "imports": [
        "src/components/ui.jsx",
        "src/data/insights.js",
        "src/lib/format.js"
      ],
      "packages": [
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/MaterialProfile.jsx",
      "name": "MaterialProfile.jsx",
      "kind": "page",
      "lines": 198,
      "bytes": 9269,
      "imports": [
        "src/components/ui.jsx",
        "src/context/ThemeContext.jsx",
        "src/data/insights.js",
        "src/data/transactions.js",
        "src/data/warehouseMap.js",
        "src/lib/colors.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/Movement.jsx",
      "name": "Movement.jsx",
      "kind": "page",
      "lines": 159,
      "bytes": 8407,
      "imports": [
        "src/components/ui.jsx",
        "src/data/insights.js",
        "src/data/transactions.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/ProcessFlow.jsx",
      "name": "ProcessFlow.jsx",
      "kind": "page",
      "lines": 1015,
      "bytes": 40607,
      "imports": [
        "src/components/processflow/ErdDiagram.jsx",
        "src/components/processflow/FlowDiagram.jsx",
        "src/components/processflow/LiveProbe.jsx",
        "src/components/processflow/pfUi.jsx",
        "src/components/ui.jsx",
        "src/data/processFlow.js",
        "src/lib/icons.jsx",
        "src/styles/processflow.css"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/PurchaseRequests.jsx",
      "name": "PurchaseRequests.jsx",
      "kind": "page",
      "lines": 46,
      "bytes": 2187,
      "imports": [
        "src/components/ui.jsx",
        "src/data/transactions.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/Reports.jsx",
      "name": "Reports.jsx",
      "kind": "page",
      "lines": 70,
      "bytes": 3215,
      "imports": [
        "src/components/charts.jsx",
        "src/components/ui.jsx",
        "src/data/insights.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/RequestMaterials.jsx",
      "name": "RequestMaterials.jsx",
      "kind": "page",
      "lines": 79,
      "bytes": 4343,
      "imports": [
        "src/components/ui.jsx",
        "src/data/insights.js",
        "src/data/transactions.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/Reservations.jsx",
      "name": "Reservations.jsx",
      "kind": "page",
      "lines": 56,
      "bytes": 2950,
      "imports": [
        "src/components/ui.jsx",
        "src/data/transactions.js",
        "src/lib/format.js"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/Settings.jsx",
      "name": "Settings.jsx",
      "kind": "page",
      "lines": 96,
      "bytes": 4181,
      "imports": [
        "src/components/ui.jsx",
        "src/context/ThemeContext.jsx",
        "src/data/insights.js",
        "src/data/trades.js",
        "src/lib/hydrate.js",
        "src/lib/icons.jsx"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/StorageMap.jsx",
      "name": "StorageMap.jsx",
      "kind": "page",
      "lines": 340,
      "bytes": 14431,
      "imports": [
        "src/components/FacilityCapacityGauge.jsx",
        "src/components/floorplan/LocationPanel.jsx",
        "src/components/floorplan/RackElevation.jsx",
        "src/components/floorplan/SitePlan.jsx",
        "src/components/floorplan/WarehousePlan.jsx",
        "src/components/ui.jsx",
        "src/data/insights.js",
        "src/data/warehouseMap.js",
        "src/lib/format.js",
        "src/lib/icons.jsx",
        "src/styles/floorplan.css"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/Users.jsx",
      "name": "Users.jsx",
      "kind": "page",
      "lines": 83,
      "bytes": 4361,
      "imports": [
        "src/components/ui.jsx",
        "src/data/roles.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/App.jsx"
      ]
    },
    {
      "path": "src/pages/dashboard/ExcessTab.jsx",
      "name": "ExcessTab.jsx",
      "kind": "dashboard-tab",
      "lines": 20,
      "bytes": 784,
      "imports": [
        "src/lib/icons.jsx"
      ],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/Dashboard.jsx"
      ]
    },
    {
      "path": "src/pages/dashboard/InventoryTab.jsx",
      "name": "InventoryTab.jsx",
      "kind": "dashboard-tab",
      "lines": 486,
      "bytes": 26619,
      "imports": [
        "src/components/InventoryComposition.jsx",
        "src/components/MaterialList.jsx",
        "src/components/charts.jsx",
        "src/components/ui.jsx",
        "src/context/ThemeContext.jsx",
        "src/data/insights.js",
        "src/lib/colors.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/Dashboard.jsx"
      ]
    },
    {
      "path": "src/pages/dashboard/SafekeepingTab.jsx",
      "name": "SafekeepingTab.jsx",
      "kind": "dashboard-tab",
      "lines": 255,
      "bytes": 13143,
      "imports": [
        "src/components/DataSheet.jsx",
        "src/components/DeliveryTracker.jsx",
        "src/components/MaterialList.jsx",
        "src/components/Select.jsx",
        "src/components/charts.jsx",
        "src/components/ui.jsx",
        "src/context/ThemeContext.jsx",
        "src/data/safekeeping.js",
        "src/data/safekeepingInsights.js",
        "src/lib/colors.js",
        "src/lib/format.js",
        "src/lib/icons.jsx"
      ],
      "packages": [
        "react",
        "react-router-dom"
      ],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/Dashboard.jsx"
      ]
    },
    {
      "path": "src/styles/floorplan.css",
      "name": "floorplan.css",
      "kind": "style",
      "lines": 204,
      "bytes": 11558,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/StorageMap.jsx"
      ]
    },
    {
      "path": "src/styles/index.css",
      "name": "index.css",
      "kind": "style",
      "lines": 2293,
      "bytes": 142618,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/main.jsx"
      ]
    },
    {
      "path": "src/styles/processflow.css",
      "name": "processflow.css",
      "kind": "style",
      "lines": 740,
      "bytes": 35531,
      "imports": [],
      "packages": [],
      "dbOps": [],
      "lazy": false,
      "importedBy": [
        "src/pages/ProcessFlow.jsx"
      ]
    }
  ]
}

export default CODE
