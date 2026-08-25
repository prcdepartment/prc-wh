// Parses supabase/schema.sql and emits src/data/generated/dbSchema.js — the database
// half of the Process Flow module's system model.
//
// WHY A GENERATOR AND NOT A HAND-WRITTEN LIST
// A hand-maintained table catalogue drifts away from the database the first time
// someone adds a column, and a documentation module that lies is worse than none.
// schema.sql IS the authoritative definition of this database (it is idempotent and
// is what gets run in the Supabase SQL Editor), so parsing it means the Process Flow
// page can never disagree with the schema — regenerate and the page updates.
//
// WHAT IT CANNOT KNOW: this reads the schema FILE, not the live server. If someone
// runs an ad-hoc ALTER TABLE in the SQL Editor without updating schema.sql, that
// change is invisible here. The Process Flow page says so, and offers a live probe
// (row counts through the user's own session) to cross-check.
//
// Run: npm run db:model
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const SRC = resolve(ROOT, 'supabase/schema.sql')
const OUT = resolve(ROOT, 'src/data/generated/dbSchema.js')

const sql = readFileSync(SRC, 'utf8')
const lines = sql.split(/\r?\n/)

// ---------------------------------------------------------------- helpers
// Split a comma-separated list while respecting nested parentheses, so
// `check (type in ('a','b'))` stays one item instead of three.
function splitTop(body) {
  const out = []
  let depth = 0
  let buf = ''
  let quote = null
  for (const ch of body) {
    if (quote) {
      buf += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"') { quote = ch; buf += ch; continue }
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue }
    buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

// Remove trailing `-- …` comments from a table body, line by line, ignoring a `--`
// that falls inside a string literal. Without this, a column declared on the line
// AFTER a commented column is swallowed into it — schema.sql has two of those
// (`delivery_tracker.qty` and `safekeeping_requests.payload`), which silently cost
// the catalogue a column each.
function stripComments(body) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      let quote = null
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (quote) { if (ch === quote) quote = null; continue }
        if (ch === "'" || ch === '"') { quote = ch; continue }
        if (ch === '-' && line[i + 1] === '-') return line.slice(0, i)
      }
      return line
    })
    .join('\n')
}

// The contiguous run of `--` comments IMMEDIATELY above a line — no blank line in
// between — cleaned of dash rules and banner decoration.
//
// Adjacency is the important part. An earlier version skipped over blank lines while
// looking for a comment, which meant a table preceded by a blank line and then a
// section banner inherited the banner: `movements` was documented as
// "======= TRANSACTIONAL TABLES — created EMPTY…", which is a heading for a group of
// eight tables, not a description of one. A comment separated from a statement by a
// blank line is not documenting that statement.
function commentAbove(idx) {
  const got = []
  for (let i = idx - 1; i >= 0; i--) {
    const raw = lines[i].trim()
    if (raw === '') break // blank line ends the block, even before anything is collected
    if (!raw.startsWith('--')) break
    // Strip the comment marker, then any surrounding rule of dashes or equals signs.
    const text = raw.replace(/^--+/, '').replace(/^[-=\s]+/, '').replace(/[-=\s]+$/, '').trim()
    if (text === '') continue // a pure decoration line contributes nothing
    got.unshift(text)
  }
  // Drop a leading `---------- label ----------` rule when real prose follows it: the
  // label just repeats the table name.
  if (got.length > 1 && got[0].split(/\s+/).length <= 6 && !/[.:]$/.test(got[0])) got.shift()
  return got.join(' ').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------- tables
const tables = []
const createRe = /create table if not exists public\.(\w+)\s*\(/gi
let m
while ((m = createRe.exec(sql))) {
  const name = m[1]
  // Walk forward from the opening paren to its match, so nested parens in a check
  // constraint or a default expression do not end the block early.
  let depth = 1
  let i = createRe.lastIndex
  while (i < sql.length && depth > 0) {
    if (sql[i] === '(') depth++
    else if (sql[i] === ')') depth--
    i++
  }
  const body = stripComments(sql.slice(createRe.lastIndex, i - 1))
  const lineNo = sql.slice(0, m.index).split(/\r?\n/).length
  const purpose = commentAbove(lineNo - 1)

  const columns = []
  const pk = []
  for (const def of splitTop(body)) {
    const low = def.toLowerCase()
    // Table-level `primary key (a, b)` — a composite key, not a column of its own.
    if (/^primary key\s*\(/.test(low)) {
      splitTop(def.slice(def.indexOf('(') + 1, def.lastIndexOf(')'))).forEach((c) => pk.push(c.trim()))
      continue
    }
    if (/^(constraint|unique\s*\(|check\s*\(|foreign key)/.test(low)) continue

    const nameMatch = def.match(/^(\w+)\s+([\s\S]+)$/)
    if (!nameMatch) continue
    const [, col, rest] = nameMatch

    const ref = rest.match(/references\s+(\w+)\.(\w+)\s*\((\w+)\)/i)
    const isPk = /\bprimary key\b/i.test(rest)
    if (isPk) pk.push(col)

    const type = rest
      .replace(/\s+(primary key|not null|unique|generated always as identity)\b/gi, ' ')
      .replace(/\s+references[\s\S]*$/i, ' ')
      .replace(/\s+default[\s\S]*$/i, ' ')
      .replace(/\s+check\s*\([\s\S]*$/i, ' ')
      .replace(/\s+on delete cascade/i, ' ')
      .trim()

    const dflt = rest.match(/default\s+([\s\S]+?)(?:\s+(?:check|references)\b|$)/i)
    const check = rest.match(/check\s*\(([\s\S]+)\)/i)

    columns.push({
      name: col,
      type: type || 'text',
      pk: isPk,
      notNull: /\bnot null\b/i.test(rest) || isPk,
      unique: /\bunique\b/i.test(rest),
      identity: /generated always as identity/i.test(rest),
      default: dflt ? dflt[1].trim().replace(/,$/, '') : null,
      check: check ? check[1].trim() : null,
      references: ref ? { schema: ref[1], table: ref[2], column: ref[3] } : null,
    })
  }
  tables.push({ name, purpose, columns, pk, indexes: [], policies: [], triggers: [] })
}

const byName = Object.fromEntries(tables.map((t) => [t.name, t]))

// ---------------------------------------------------------------- indexes
for (const mm of sql.matchAll(/create index if not exists (\w+) on public\.(\w+)\s*\(([^)]+)\)/gi)) {
  if (byName[mm[2]]) byName[mm[2]].indexes.push({ name: mm[1], columns: mm[3].split(',').map((s) => s.trim()) })
}

// ---------------------------------------------------------------- policies
// Two sources: explicit `create policy` statements, and the do-block at the end that
// loops over two arrays of table names applying a standard policy set to each.
for (const mm of sql.matchAll(/create policy\s+"([^"]+)"\s+on public\.(\w+)\s+for (\w+)([\s\S]*?);/gi)) {
  const [, pname, table, action, tail] = mm
  const using = tail.match(/using\s*\(([\s\S]*?)\)\s*(?:with check|$)/i)
  if (byName[table]) {
    byName[table].policies.push({
      name: pname,
      action: action.toLowerCase(),
      expression: (using ? using[1] : tail).replace(/\s+/g, ' ').trim(),
      source: 'explicit',
    })
  }
}

function arrayLiteral(varName) {
  const re = new RegExp(varName + '\\s+text\\[\\]\\s*:=\\s*array\\[([\\s\\S]*?)\\]', 'i')
  const hit = sql.match(re)
  if (!hit) return []
  return [...hit[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}
const referenceTables = arrayLiteral('reference_tables')
const transactionalTables = arrayLiteral('transactional_tables')

for (const t of referenceTables) {
  if (!byName[t]) continue
  byName[t].policies.push(
    { name: t + '_read', action: 'select', expression: "auth.role() = 'authenticated'", source: 'loop' },
    { name: t + '_write', action: 'all', expression: 'public.is_admin()', source: 'loop' }
  )
}
for (const t of transactionalTables) {
  if (!byName[t]) continue
  byName[t].policies.push(
    { name: t + '_read', action: 'select', expression: "auth.role() = 'authenticated'", source: 'loop' },
    { name: t + '_insert', action: 'insert', expression: "auth.role() = 'authenticated'", source: 'loop' },
    { name: t + '_admin', action: 'all', expression: 'public.is_admin()', source: 'loop' }
  )
}

// A trailing `drop policy` with no matching re-create removes one of the looped
// policies again — the audit log is deliberately insert+read only. Honour the drop,
// or the catalogue would claim a policy the database does not have.
const created = new Set()
for (const mm of sql.matchAll(/create policy\s+"([^"]+)"/gi)) created.add(mm[1])
for (const mm of sql.matchAll(/drop policy if exists\s+"([^"]+)"\s+on public\.(\w+);/gi)) {
  const [, pname, table] = mm
  if (created.has(pname)) continue // dropped then re-created — the drop is just idempotency
  if (byName[table]) byName[table].policies = byName[table].policies.filter((p) => p.name !== pname)
}

// ---------------------------------------------------------------- triggers & functions
const triggers = []
for (const mm of sql.matchAll(
  /create trigger (\w+)\s+(before|after)\s+(\w+(?:\s+or\s+\w+)*)\s+on ([\w.]+)\s+for each row execute function ([\w.]+)/gi
)) {
  const t = { name: mm[1], timing: mm[2].toLowerCase(), event: mm[3].toLowerCase(), table: mm[4], fn: mm[5] }
  triggers.push(t)
  const bare = t.table.replace(/^public\./, '')
  if (byName[bare]) byName[bare].triggers.push(t)
}

const functions = []
for (const mm of sql.matchAll(/create or replace function ([\w.]+)\(\)\s*\r?\n?\s*returns (\w+)([\s\S]*?)\bas \$\$/gi)) {
  const flags = mm[3].toLowerCase()
  const lineNo = sql.slice(0, mm.index).split(/\r?\n/).length
  functions.push({
    name: mm[1],
    returns: mm[2],
    securityDefiner: /security definer/.test(flags),
    stable: /\bstable\b/.test(flags),
    purpose: commentAbove(lineNo - 1),
  })
}

const enums = [...sql.matchAll(/create type (\w+) as enum \(([^)]*)\)/gi)].map((mm) => ({
  name: mm[1],
  values: [...mm[2].matchAll(/'([^']+)'/g)].map((x) => x[1]),
}))

// ---------------------------------------------------------------- relationships
// Cardinality is inferred, not declared: a foreign key that is ALSO the child's own
// primary key can only ever match one parent row, so it is one-to-one; any other
// foreign key admits many children per parent.
const relationships = []
for (const t of tables) {
  for (const c of t.columns) {
    if (!c.references) continue
    relationships.push({
      from: t.name,
      fromColumn: c.name,
      to: c.references.table,
      toSchema: c.references.schema,
      toColumn: c.references.column,
      kind: c.pk ? 'one-to-one' : 'one-to-many',
      optional: !c.notNull,
    })
  }
}
for (const t of tables) {
  t.foreignKeys = relationships.filter((r) => r.from === t.name)
  t.referencedBy = relationships.filter((r) => r.to === t.name && r.toSchema === 'public')
  t.group = referenceTables.includes(t.name)
    ? 'reference'
    : transactionalTables.includes(t.name)
      ? 'transactional'
      : 'identity'
  t.rls = t.policies.length > 0
}

// ---------------------------------------------------------------- emit
const banner = `// GENERATED FILE — DO NOT EDIT BY HAND.
// Produced by scripts/generate-db-model.mjs from supabase/schema.sql.
// Regenerate with:  npm run db:model
//
// This is a map of the schema FILE, which is what gets run in the Supabase SQL
// Editor and is therefore the authoritative definition of the database. It cannot
// see an ad-hoc change made in the SQL Editor without updating schema.sql — the
// Process Flow page says so, and offers a live row-count probe to cross-check.
`

const payload = {
  generatedFrom: 'supabase/schema.sql',
  tableCount: tables.length,
  groups: { reference: referenceTables, transactional: transactionalTables },
  enums,
  functions,
  triggers,
  relationships,
  tables,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, banner + '\nexport const DB = ' + JSON.stringify(payload, null, 2) + '\n\nexport default DB\n', 'utf8')

const cols = tables.reduce((a, t) => a + t.columns.length, 0)
const pols = tables.reduce((a, t) => a + t.policies.length, 0)
console.log(
  'dbSchema.js written — ' + tables.length + ' tables, ' + cols + ' columns, ' +
  relationships.length + ' relationships, ' + pols + ' policies, ' +
  triggers.length + ' triggers, ' + functions.length + ' functions, ' + enums.length + ' enums'
)
