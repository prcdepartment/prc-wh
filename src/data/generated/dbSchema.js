// GENERATED FILE — DO NOT EDIT BY HAND.
// Produced by scripts/generate-db-model.mjs from supabase/schema.sql.
// Regenerate with:  npm run db:model
//
// This is a map of the schema FILE, which is what gets run in the Supabase SQL
// Editor and is therefore the authoritative definition of the database. It cannot
// see an ad-hoc change made in the SQL Editor without updating schema.sql — the
// Process Flow page says so, and offers a live row-count probe to cross-check.

export const DB = {
  "generatedFrom": "supabase/schema.sql",
  "tableCount": 17,
  "groups": {
    "reference": [
      "trades",
      "projects",
      "item_master",
      "inventory",
      "ledger",
      "safekeeping_soh",
      "safekeeping_incoming",
      "safekeeping_outgoing",
      "delivery_tracker"
    ],
    "transactional": [
      "movements",
      "reservations",
      "purchase_requests",
      "material_requests",
      "approvals",
      "safekeeping_requests",
      "audit_log"
    ]
  },
  "enums": [
    {
      "name": "wms_role",
      "values": [
        "admin",
        "warehouse",
        "procurement",
        "site",
        "management"
      ]
    }
  ],
  "functions": [
    {
      "name": "public.guard_role_change",
      "returns": "trigger",
      "securityDefiner": true,
      "stable": false,
      "purpose": "Without this, \"update your own profile\" is enough to make yourself an admin."
    },
    {
      "name": "public.is_admin",
      "returns": "boolean",
      "securityDefiner": true,
      "stable": true,
      "purpose": "security definer so the policy can read profiles without recursing into its own RLS check."
    },
    {
      "name": "public.handle_new_user",
      "returns": "trigger",
      "securityDefiner": true,
      "stable": false,
      "purpose": "Maps the seeded demo emails to their intended role automatically. Any other email prefix defaults to 'warehouse' — promote real staff manually."
    }
  ],
  "triggers": [
    {
      "name": "profiles_guard_role",
      "timing": "before",
      "event": "update",
      "table": "public.profiles",
      "fn": "public.guard_role_change"
    },
    {
      "name": "on_auth_user_created",
      "timing": "after",
      "event": "insert",
      "table": "auth.users",
      "fn": "public.handle_new_user"
    }
  ],
  "relationships": [
    {
      "from": "profiles",
      "fromColumn": "id",
      "to": "users",
      "toSchema": "auth",
      "toColumn": "id",
      "kind": "one-to-one",
      "optional": false
    },
    {
      "from": "movements",
      "fromColumn": "item_id",
      "to": "inventory",
      "toSchema": "public",
      "toColumn": "id",
      "kind": "one-to-many",
      "optional": true
    },
    {
      "from": "movements",
      "fromColumn": "created_by",
      "to": "users",
      "toSchema": "auth",
      "toColumn": "id",
      "kind": "one-to-many",
      "optional": true
    },
    {
      "from": "reservations",
      "fromColumn": "item_id",
      "to": "inventory",
      "toSchema": "public",
      "toColumn": "id",
      "kind": "one-to-many",
      "optional": true
    },
    {
      "from": "reservations",
      "fromColumn": "created_by",
      "to": "users",
      "toSchema": "auth",
      "toColumn": "id",
      "kind": "one-to-many",
      "optional": true
    },
    {
      "from": "purchase_requests",
      "fromColumn": "item_id",
      "to": "inventory",
      "toSchema": "public",
      "toColumn": "id",
      "kind": "one-to-many",
      "optional": true
    },
    {
      "from": "purchase_requests",
      "fromColumn": "created_by",
      "to": "users",
      "toSchema": "auth",
      "toColumn": "id",
      "kind": "one-to-many",
      "optional": true
    },
    {
      "from": "material_requests",
      "fromColumn": "item_id",
      "to": "inventory",
      "toSchema": "public",
      "toColumn": "id",
      "kind": "one-to-many",
      "optional": true
    },
    {
      "from": "material_requests",
      "fromColumn": "created_by",
      "to": "users",
      "toSchema": "auth",
      "toColumn": "id",
      "kind": "one-to-many",
      "optional": true
    },
    {
      "from": "approvals",
      "fromColumn": "item_id",
      "to": "inventory",
      "toSchema": "public",
      "toColumn": "id",
      "kind": "one-to-many",
      "optional": true
    },
    {
      "from": "approvals",
      "fromColumn": "decided_by",
      "to": "users",
      "toSchema": "auth",
      "toColumn": "id",
      "kind": "one-to-many",
      "optional": true
    },
    {
      "from": "safekeeping_requests",
      "fromColumn": "created_by",
      "to": "users",
      "toSchema": "auth",
      "toColumn": "id",
      "kind": "one-to-many",
      "optional": true
    }
  ],
  "tables": [
    {
      "name": "profiles",
      "purpose": "profiles",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": {
            "schema": "auth",
            "table": "users",
            "column": "id"
          }
        },
        {
          "name": "email",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": true,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "full_name",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "role",
          "type": "wms_role",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "'warehouse'",
          "check": null,
          "references": null
        },
        {
          "name": "department",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "access_level",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "'Standard'",
          "check": null,
          "references": null
        },
        {
          "name": "status",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "'Active'",
          "check": null,
          "references": null
        },
        {
          "name": "created_at",
          "type": "timestamptz",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "now()",
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "id"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "profiles_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "explicit"
        },
        {
          "name": "profiles_self_update",
          "action": "update",
          "expression": "auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')",
          "source": "explicit"
        }
      ],
      "triggers": [
        {
          "name": "profiles_guard_role",
          "timing": "before",
          "event": "update",
          "table": "public.profiles",
          "fn": "public.guard_role_change"
        }
      ],
      "foreignKeys": [
        {
          "from": "profiles",
          "fromColumn": "id",
          "to": "users",
          "toSchema": "auth",
          "toColumn": "id",
          "kind": "one-to-one",
          "optional": false
        }
      ],
      "referencedBy": [],
      "group": "identity",
      "rls": true
    },
    {
      "name": "trades",
      "purpose": "Trade taxonomy: L1 (trade) → L2 (item group).",
      "columns": [
        {
          "name": "l1",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "l2",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "sort_order",
          "type": "int",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "l1",
        "l2"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "trades_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "trades_write",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [],
      "referencedBy": [],
      "group": "reference",
      "rls": true
    },
    {
      "name": "projects",
      "purpose": "",
      "columns": [
        {
          "name": "code",
          "type": "text",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "name",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "code"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "projects_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "projects_write",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [],
      "referencedBy": [],
      "group": "reference",
      "rls": true
    },
    {
      "name": "item_master",
      "purpose": "The company-wide SAP item catalogue (7,378 codes), used by the Add Material and Safekeeping Request lookups. Fetched on demand by src/components/ItemLookup.jsx rather than at startup — it is only needed once a form that uses it opens.",
      "columns": [
        {
          "name": "code",
          "type": "text",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "trade_l1",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "item_group",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "material_type",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "uom",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "code"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "item_master_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "item_master_write",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [],
      "referencedBy": [],
      "group": "reference",
      "rls": true
    },
    {
      "name": "inventory",
      "purpose": "One row per line item from the CW SOH sheet. item_code is NOT unique: the same SAP code appears on several lines with different 2nd descriptions.",
      "columns": [
        {
          "name": "id",
          "type": "int",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "item_code",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "detailed_description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "trade_l1",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "trade_l2",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "material_type",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "uom",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "total_qty",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "beginning_qty",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "period_in",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "period_out",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "available_qty",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "reserved_qty",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "incoming_qty",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "outgoing_qty",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "damaged_qty",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "min_level",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "issue_frequency",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "last_movement_offset",
          "type": "int",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "unit_price",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "discounted_price",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "inventory_value",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "condition_class",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "brand",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "model",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "location",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "bin_count",
          "type": "int",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "zone",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "rack",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "shelf",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "bin",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "updated_at",
          "type": "timestamptz",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "now()",
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "id"
      ],
      "indexes": [
        {
          "name": "inventory_item_code_idx",
          "columns": [
            "item_code"
          ]
        },
        {
          "name": "inventory_trade_idx",
          "columns": [
            "trade_l1",
            "trade_l2"
          ]
        }
      ],
      "policies": [
        {
          "name": "inventory_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "inventory_write",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [],
      "referencedBy": [
        {
          "from": "movements",
          "fromColumn": "item_id",
          "to": "inventory",
          "toSchema": "public",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        },
        {
          "from": "reservations",
          "fromColumn": "item_id",
          "to": "inventory",
          "toSchema": "public",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        },
        {
          "from": "purchase_requests",
          "fromColumn": "item_id",
          "to": "inventory",
          "toSchema": "public",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        },
        {
          "from": "material_requests",
          "fromColumn": "item_id",
          "to": "inventory",
          "toSchema": "public",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        },
        {
          "from": "approvals",
          "fromColumn": "item_id",
          "to": "inventory",
          "toSchema": "public",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        }
      ],
      "group": "reference",
      "rls": true
    },
    {
      "name": "ledger",
      "purpose": "movement ledger (real CW Incoming / CW Outgoing sheets) `day_offset` is days before the dataset's TODAY, matching the app's date model.",
      "columns": [
        {
          "name": "id",
          "type": "bigint",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": true,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "direction",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": "direction in ('in','out')",
          "references": null
        },
        {
          "name": "day_offset",
          "type": "int",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "item_code",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "qty",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "uom",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "project",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "doc_ref",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "class",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "condition",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "id"
      ],
      "indexes": [
        {
          "name": "ledger_item_code_idx",
          "columns": [
            "item_code"
          ]
        }
      ],
      "policies": [
        {
          "name": "ledger_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "ledger_write",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [],
      "referencedBy": [],
      "group": "reference",
      "rls": true
    },
    {
      "name": "safekeeping_soh",
      "purpose": "safekeeping sheets",
      "columns": [
        {
          "name": "id",
          "type": "int",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "ref_code",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "project",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "project_code",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "trade",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "trade_l1",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "item_group",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "item_code",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "detailed_description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "uom",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "boh",
          "type": "numeric",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "qty_in",
          "type": "numeric",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "qty_out",
          "type": "numeric",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "soh",
          "type": "numeric",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "unit_price",
          "type": "numeric",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "class",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "remarks",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "id"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "safekeeping_soh_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "safekeeping_soh_write",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [],
      "referencedBy": [],
      "group": "reference",
      "rls": true
    },
    {
      "name": "safekeeping_incoming",
      "purpose": "",
      "columns": [
        {
          "name": "id",
          "type": "int",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "project",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "project_code",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "doc_date",
          "type": "date",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "doc_ref",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "category",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "item_code",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "detailed_description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "uom",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "qty",
          "type": "numeric",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "class",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "condition",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "remarks",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "id"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "safekeeping_incoming_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "safekeeping_incoming_write",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [],
      "referencedBy": [],
      "group": "reference",
      "rls": true
    },
    {
      "name": "safekeeping_outgoing",
      "purpose": "",
      "columns": [
        {
          "name": "id",
          "type": "int",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "project",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "project_code",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "doc_date",
          "type": "date",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "doc_ref",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "category",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "item_code",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "detailed_description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "uom",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "qty",
          "type": "numeric",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "class",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "condition",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "remarks",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "id"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "safekeeping_outgoing_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "safekeeping_outgoing_write",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [],
      "referencedBy": [],
      "group": "reference",
      "rls": true
    },
    {
      "name": "delivery_tracker",
      "purpose": "delivery tracker sheet",
      "columns": [
        {
          "name": "no",
          "type": "int",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "category",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "item",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "project",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "batch",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "qty",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "uom",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "target_date",
          "type": "date",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "target_text",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "location",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "warehouse",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "status",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "ops_remarks",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "dp_payment",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "prc_remarks",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "no"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "delivery_tracker_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "delivery_tracker_write",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [],
      "referencedBy": [],
      "group": "reference",
      "rls": true
    },
    {
      "name": "movements",
      "purpose": "",
      "columns": [
        {
          "name": "id",
          "type": "bigint",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": true,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "item_id",
          "type": "int",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": {
            "schema": "public",
            "table": "inventory",
            "column": "id"
          }
        },
        {
          "name": "item_code",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "type",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": "type in ('Incoming','Outgoing','Return','Adjustment')",
          "references": null
        },
        {
          "name": "qty",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "uom",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "project",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "doc_ref",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "status",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "'Pending Approval'",
          "check": null,
          "references": null
        },
        {
          "name": "moved_at",
          "type": "timestamptz",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "now()",
          "check": null,
          "references": null
        },
        {
          "name": "created_by",
          "type": "uuid",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "auth.uid()",
          "check": null,
          "references": {
            "schema": "auth",
            "table": "users",
            "column": "id"
          }
        },
        {
          "name": "created_by_email",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "(auth.jwt() ->> 'email')",
          "check": null,
          "references": null
        },
        {
          "name": "created_at",
          "type": "timestamptz",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "now()",
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "id"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "movements_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "movements_insert",
          "action": "insert",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "movements_admin",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [
        {
          "from": "movements",
          "fromColumn": "item_id",
          "to": "inventory",
          "toSchema": "public",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        },
        {
          "from": "movements",
          "fromColumn": "created_by",
          "to": "users",
          "toSchema": "auth",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        }
      ],
      "referencedBy": [],
      "group": "transactional",
      "rls": true
    },
    {
      "name": "reservations",
      "purpose": "",
      "columns": [
        {
          "name": "id",
          "type": "bigint",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": true,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "item_id",
          "type": "int",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": {
            "schema": "public",
            "table": "inventory",
            "column": "id"
          }
        },
        {
          "name": "item_code",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "qty",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "uom",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "project",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "required_date",
          "type": "date",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "status",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "'Reserved'",
          "check": null,
          "references": null
        },
        {
          "name": "created_by",
          "type": "uuid",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "auth.uid()",
          "check": null,
          "references": {
            "schema": "auth",
            "table": "users",
            "column": "id"
          }
        },
        {
          "name": "created_by_email",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "(auth.jwt() ->> 'email')",
          "check": null,
          "references": null
        },
        {
          "name": "created_at",
          "type": "timestamptz",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "now()",
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "id"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "reservations_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "reservations_insert",
          "action": "insert",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "reservations_admin",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [
        {
          "from": "reservations",
          "fromColumn": "item_id",
          "to": "inventory",
          "toSchema": "public",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        },
        {
          "from": "reservations",
          "fromColumn": "created_by",
          "to": "users",
          "toSchema": "auth",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        }
      ],
      "referencedBy": [],
      "group": "transactional",
      "rls": true
    },
    {
      "name": "purchase_requests",
      "purpose": "",
      "columns": [
        {
          "name": "id",
          "type": "bigint",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": true,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "item_id",
          "type": "int",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": {
            "schema": "public",
            "table": "inventory",
            "column": "id"
          }
        },
        {
          "name": "item_code",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "qty_needed",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "uom",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "reason",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "est_cost",
          "type": "numeric",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "status",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "'Draft'",
          "check": null,
          "references": null
        },
        {
          "name": "created_by",
          "type": "uuid",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "auth.uid()",
          "check": null,
          "references": {
            "schema": "auth",
            "table": "users",
            "column": "id"
          }
        },
        {
          "name": "created_by_email",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "(auth.jwt() ->> 'email')",
          "check": null,
          "references": null
        },
        {
          "name": "created_at",
          "type": "timestamptz",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "now()",
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "id"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "purchase_requests_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "purchase_requests_insert",
          "action": "insert",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "purchase_requests_admin",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [
        {
          "from": "purchase_requests",
          "fromColumn": "item_id",
          "to": "inventory",
          "toSchema": "public",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        },
        {
          "from": "purchase_requests",
          "fromColumn": "created_by",
          "to": "users",
          "toSchema": "auth",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        }
      ],
      "referencedBy": [],
      "group": "transactional",
      "rls": true
    },
    {
      "name": "material_requests",
      "purpose": "",
      "columns": [
        {
          "name": "id",
          "type": "bigint",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": true,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "item_id",
          "type": "int",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": {
            "schema": "public",
            "table": "inventory",
            "column": "id"
          }
        },
        {
          "name": "item_code",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "description",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "qty",
          "type": "numeric",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "0",
          "check": null,
          "references": null
        },
        {
          "name": "uom",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "project",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "purpose",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "required_date",
          "type": "date",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "status",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "'Submitted'",
          "check": null,
          "references": null
        },
        {
          "name": "created_by",
          "type": "uuid",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "auth.uid()",
          "check": null,
          "references": {
            "schema": "auth",
            "table": "users",
            "column": "id"
          }
        },
        {
          "name": "created_by_email",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "(auth.jwt() ->> 'email')",
          "check": null,
          "references": null
        },
        {
          "name": "created_at",
          "type": "timestamptz",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "now()",
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "id"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "material_requests_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "material_requests_insert",
          "action": "insert",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "material_requests_admin",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [
        {
          "from": "material_requests",
          "fromColumn": "item_id",
          "to": "inventory",
          "toSchema": "public",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        },
        {
          "from": "material_requests",
          "fromColumn": "created_by",
          "to": "users",
          "toSchema": "auth",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        }
      ],
      "referencedBy": [],
      "group": "transactional",
      "rls": true
    },
    {
      "name": "approvals",
      "purpose": "",
      "columns": [
        {
          "name": "id",
          "type": "bigint",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": true,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "type",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "category",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "subject",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "item_id",
          "type": "int",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": {
            "schema": "public",
            "table": "inventory",
            "column": "id"
          }
        },
        {
          "name": "project",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "requested_by",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "status",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "'Pending'",
          "check": null,
          "references": null
        },
        {
          "name": "decided_by",
          "type": "uuid",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": {
            "schema": "auth",
            "table": "users",
            "column": "id"
          }
        },
        {
          "name": "decided_at",
          "type": "timestamptz",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "created_at",
          "type": "timestamptz",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "now()",
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "id"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "approvals_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "approvals_insert",
          "action": "insert",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "approvals_admin",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [
        {
          "from": "approvals",
          "fromColumn": "item_id",
          "to": "inventory",
          "toSchema": "public",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        },
        {
          "from": "approvals",
          "fromColumn": "decided_by",
          "to": "users",
          "toSchema": "auth",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        }
      ],
      "referencedBy": [],
      "group": "transactional",
      "rls": true
    },
    {
      "name": "safekeeping_requests",
      "purpose": "Safekeeping requests submitted through \"+ New Transaction\". Previously held in React state (src/context/SafekeepingContext.jsx) and lost on refresh.",
      "columns": [
        {
          "name": "id",
          "type": "bigint",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": true,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "srn",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": true,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "project",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "project_code",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "requested_by",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "request_date",
          "type": "date",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "status",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "'Submitted'",
          "check": null,
          "references": null
        },
        {
          "name": "payload",
          "type": "jsonb",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": "'{}'::jsonb",
          "check": null,
          "references": null
        },
        {
          "name": "created_by",
          "type": "uuid",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "auth.uid()",
          "check": null,
          "references": {
            "schema": "auth",
            "table": "users",
            "column": "id"
          }
        },
        {
          "name": "created_by_email",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "(auth.jwt() ->> 'email')",
          "check": null,
          "references": null
        },
        {
          "name": "created_at",
          "type": "timestamptz",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "now()",
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "id"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "safekeeping_requests_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "safekeeping_requests_insert",
          "action": "insert",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "safekeeping_requests_admin",
          "action": "all",
          "expression": "public.is_admin()",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [
        {
          "from": "safekeeping_requests",
          "fromColumn": "created_by",
          "to": "users",
          "toSchema": "auth",
          "toColumn": "id",
          "kind": "one-to-many",
          "optional": true
        }
      ],
      "referencedBy": [],
      "group": "transactional",
      "rls": true
    },
    {
      "name": "audit_log",
      "purpose": "",
      "columns": [
        {
          "name": "id",
          "type": "bigint",
          "pk": true,
          "notNull": true,
          "unique": false,
          "identity": true,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "user_email",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "action",
          "type": "text",
          "pk": false,
          "notNull": true,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "detail",
          "type": "text",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": null,
          "check": null,
          "references": null
        },
        {
          "name": "created_at",
          "type": "timestamptz",
          "pk": false,
          "notNull": false,
          "unique": false,
          "identity": false,
          "default": "now()",
          "check": null,
          "references": null
        }
      ],
      "pk": [
        "id"
      ],
      "indexes": [],
      "policies": [
        {
          "name": "audit_log_read",
          "action": "select",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        },
        {
          "name": "audit_log_insert",
          "action": "insert",
          "expression": "auth.role() = 'authenticated'",
          "source": "loop"
        }
      ],
      "triggers": [],
      "foreignKeys": [],
      "referencedBy": [],
      "group": "transactional",
      "rls": true
    }
  ]
}

export default DB
