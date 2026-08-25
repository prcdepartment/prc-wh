// Walks src/ and emits src/data/generated/codeMap.js — the front-end half of the
// Process Flow module's system model.
//
// WHY: the Process Flow page claims things like "this page reads that table" and
// "these components talk to each other". Asserting that by hand guarantees it goes
// stale. This reads the actual import graph and the actual Supabase call sites out
// of the source, so the architecture view describes the code as it is on the day it
// was generated, and `npm run model` refreshes it.
//
// WHAT IT CANNOT KNOW: it is a static read of import statements and call-site text,
// not a runtime trace. A dynamic import behind a condition, or a call made through
// a variable, is not followed. The counts it reports are of declarations found, not
// of code paths actually exercised.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, relative, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const SRCDIR = resolve(ROOT, 'src')
const OUT = resolve(ROOT, 'src/data/generated/codeMap.js')

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))

// ---------------------------------------------------------------- walk
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

const posix = (p) => p.split('\\').join('/')
const files = walk(SRCDIR)
  .map((f) => posix(relative(ROOT, f)))
  // The generated files are part of the model, not part of the app being modelled.
  .filter((f) => !f.startsWith('src/data/generated/'))
  .sort()

// ---------------------------------------------------------------- classify
function kindOf(path) {
  if (path.startsWith('src/pages/dashboard/')) return 'dashboard-tab'
  if (path.startsWith('src/pages/')) return 'page'
  if (path.startsWith('src/components/floorplan/')) return 'floorplan'
  if (path.startsWith('src/components/processflow/')) return 'processflow'
  if (path.startsWith('src/components/')) return 'component'
  if (path.startsWith('src/context/')) return 'context'
  if (path.startsWith('src/data/')) return 'data'
  if (path.startsWith('src/lib/')) return 'lib'
  if (path.startsWith('src/styles/')) return 'style'
  return 'entry'
}

// Resolve a relative import to a real file, trying the extensions Vite would.
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const base = posix(join(dirname(fromFile), spec))
  const candidates = extname(base)
    ? [base]
    : [base + '.jsx', base + '.js', base + '/index.jsx', base + '/index.js', base]
  return candidates.find((c) => files.includes(c)) || null
}

// ---------------------------------------------------------------- Supabase call sites
// Textual detection, deliberately narrow so a false positive is unlikely: each
// pattern is a literal the codebase actually uses.
const SUPABASE_PATTERNS = [
  { re: /supabase\s*\n?\s*\.from\(\s*['"`](\w+)['"`]/g, op: 'from', capture: true },
  { re: /\.from\(\s*['"`](\w+)['"`]\s*\)\s*\n?\s*\.select/g, op: 'select', capture: true },
  { re: /fetchAll\(\s*['"`](\w+)['"`]/g, op: 'select', capture: true },
  { re: /\.insert\(/g, op: 'insert', capture: false },
  { re: /\.update\(/g, op: 'update', capture: false },
  { re: /\.delete\(\s*\)/g, op: 'delete', capture: false },
  { re: /signInWithPassword/g, op: 'auth.signIn', capture: false },
  { re: /auth\.signOut/g, op: 'auth.signOut', capture: false },
  { re: /auth\.getSession/g, op: 'auth.getSession', capture: false },
  { re: /onAuthStateChange/g, op: 'auth.onStateChange', capture: false },
]

const nodes = []
for (const path of files) {
  const text = readFileSync(resolve(ROOT, path), 'utf8')
  const lines = text.split(/\r?\n/)

  const imports = []
  const packages = new Set()
  for (const mm of text.matchAll(/(?:^|\n)\s*import\s+(?:[\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    const spec = mm[1]
    if (spec.startsWith('.')) {
      const r = resolveImport(path, spec)
      if (r) imports.push(r)
    } else packages.add(spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/'))
  }
  // Side-effect imports (`import './styles/index.css'`) carry no bindings.
  for (const mm of text.matchAll(/(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]/g)) {
    const r = resolveImport(path, mm[1])
    if (r) imports.push(r)
  }
  // Lazy routes are real edges — App.jsx reaches every page through them.
  for (const mm of text.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const r = resolveImport(path, mm[1])
    if (r) imports.push(r)
  }

  const db = []
  for (const p of SUPABASE_PATTERNS) {
    for (const mm of text.matchAll(p.re)) {
      db.push({ op: p.op, table: p.capture ? mm[1] : null })
    }
  }
  // Collapse duplicates so a table read in a loop is not counted twice.
  const dbKey = (d) => d.op + ':' + (d.table || '')
  const dbOps = [...new Map(db.map((d) => [dbKey(d), d])).values()]

  nodes.push({
    path,
    name: path.split('/').pop(),
    kind: kindOf(path),
    lines: lines.length,
    bytes: Buffer.byteLength(text, 'utf8'),
    imports: [...new Set(imports)].sort(),
    packages: [...packages].sort(),
    dbOps,
    lazy: /\blazy\(\s*\(\)\s*=>/.test(text),
  })
}

const byPath = Object.fromEntries(nodes.map((n) => [n.path, n]))
for (const n of nodes) n.importedBy = nodes.filter((o) => o.imports.includes(n.path)).map((o) => o.path)

// Files nothing imports, and that are not an entry point, are dead weight.
const ENTRIES = new Set(['src/main.jsx'])
const orphans = nodes
  .filter((n) => n.importedBy.length === 0 && !ENTRIES.has(n.path))
  .map((n) => n.path)

// ---------------------------------------------------------------- dependency audit
// A declared dependency that no file imports is unused. Cross-checked against the
// import graph rather than assumed from the name.
//
// The build tooling is imported by files OUTSIDE src/ — vite.config.js pulls in both
// `vite` and `@vitejs/plugin-react`. Scanning src/ alone reported them as unused,
// which is exactly the kind of confident falsehood this module must not print, so
// the config and script files are scanned for package imports too (they are not
// added to the component graph — they are not part of the running app).
const TOOLING = ['vite.config.js', 'scripts/generate-db-model.mjs', 'scripts/generate-code-model.mjs', 'scripts/generate-seeds.mjs']
const toolingPackages = new Map()
for (const rel of TOOLING) {
  let text
  try { text = readFileSync(resolve(ROOT, rel), 'utf8') } catch { continue }
  for (const mm of text.matchAll(/(?:^|\n)\s*import\s+(?:[\s\S]*?)from\s*['"]([^'".][^'"]*)['"]/g)) {
    const spec = mm[1]
    const name = spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/')
    if (!toolingPackages.has(name)) toolingPackages.set(name, [])
    toolingPackages.get(name).push(rel)
  }
}

const importedPackages = new Set([...nodes.flatMap((n) => n.packages), ...toolingPackages.keys()])
const declared = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
const dependencies = Object.entries(declared).map(([name, range]) => ({
  name,
  range,
  dev: Boolean(pkg.devDependencies?.[name]),
  imported: importedPackages.has(name),
  importedBy: [
    ...nodes.filter((n) => n.packages.includes(name)).map((n) => n.path),
    ...(toolingPackages.get(name) || []),
  ],
}))
// Packages imported but never declared would break a clean install.
const undeclared = [...importedPackages].filter(
  (p) => !declared[p] && !p.startsWith('node:') && !['react-dom/client'].includes(p)
)

// ---------------------------------------------------------------- routes
// Parsed out of App.jsx so the route table cannot drift from the router.
const appText = readFileSync(resolve(ROOT, 'src/App.jsx'), 'utf8')
const routes = [...appText.matchAll(/<Route\s+path="([^"]+)"\s+element=\{([\s\S]*?)\}\s*\/>/g)].map((mm) => {
  const el = mm[2].replace(/\s+/g, ' ').trim()
  const comp = el.match(/<(\w+)\s*\/>/)
  return {
    path: mm[1],
    protected: /<Protected>/.test(el),
    redirect: /<Navigate/.test(el),
    component: comp ? comp[1] : el.slice(0, 60),
  }
})

// ---------------------------------------------------------------- emit
const counts = nodes.reduce((a, n) => ({ ...a, [n.kind]: (a[n.kind] || 0) + 1 }), {})
const payload = {
  generatedFrom: 'src/**',
  fileCount: nodes.length,
  totalLines: nodes.reduce((a, n) => a + n.lines, 0),
  counts,
  routes,
  orphans,
  dependencies,
  undeclared,
  files: nodes,
}

const banner = `// GENERATED FILE — DO NOT EDIT BY HAND.
// Produced by scripts/generate-code-model.mjs by walking src/.
// Regenerate with:  npm run model
//
// A STATIC read of import statements and Supabase call-site text — not a runtime
// trace. It records what the source declares, which is what the Process Flow
// architecture view reports.
`

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, banner + '\nexport const CODE = ' + JSON.stringify(payload, null, 2) + '\n\nexport default CODE\n', 'utf8')

console.log(
  'codeMap.js written — ' + nodes.length + ' files, ' + payload.totalLines + ' lines, ' +
  routes.length + ' routes, ' + dependencies.length + ' declared deps, ' +
  orphans.length + ' orphan files, ' + undeclared.length + ' undeclared imports'
)
