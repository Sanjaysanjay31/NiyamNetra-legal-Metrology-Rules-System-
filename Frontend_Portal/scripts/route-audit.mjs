#!/usr/bin/env node
/**
 * scripts/route-audit.mjs — the rail and the router must agree.
 *
 * A dead sidebar link is the defect that survives every screenshot and fails on
 * the first click. This checks the symmetry App.jsx's own header promises:
 *
 *   1. Every internal navigation target in the app — a rail `to`, a `<Link>`, a
 *      `<Navigate to>`, a `navigate(...)` — resolves to a route mounted in
 *      App.jsx. A link that points nowhere FAILS.
 *   2. Every mounted route, bar `/` and the `*` catch-all, is reached from
 *      somewhere. One that nothing links to is reported as a possible dead
 *      route — a WARNING, because a route may be legitimately deep-linked only.
 *
 * Zero dependencies, like every check here: it runs on bare Node.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '..', 'src')

/** Every .jsx/.js file under src, as paths relative to src. */
function sources(dir = SRC) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) out.push(...sources(full))
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(full)
  }
  return out
}

/* '/a/${x}/b/' → '/a/:_/b' so a template target compares against a param route.
   Query strings (?store_id=...) are stripped — they are filters, not routes. */
function norm(path) {
  const noQuery = path.split('?')[0]
  const n = noQuery.replace(/\$\{[^}]*\}/g, ':_').replace(/\/+$/, '')
  return n === '' ? '/' : n
}

/** A concrete or param target matches a mounted route of equal segment shape. */
function matches(target, route) {
  const a = target.split('/')
  const b = route.split('/')
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (b[i].startsWith(':')) continue // a route param eats any one segment
    if (a[i].startsWith(':')) return false // a param target under a literal route
    if (a[i] !== b[i]) return false
  }
  return true
}

/* ---- mounted routes, from App.jsx <Route path="..."> -------------------- */
const app = readFileSync(resolve(SRC, 'App.jsx'), 'utf8')
const mounted = [...app.matchAll(/<Route\s+path=(?:"([^"]+)"|'([^']+)'|\{'([^']+)'\})/g)]
  .map((m) => norm(m[1] ?? m[2] ?? m[3]))

/* ---- navigation targets, across every source file ----------------------- */
const TO = /\bto=(?:"([^"]+)"|'([^']+)'|\{`([^`]+)`\}|\{'([^']+)'\})/g
const TOPROP = /\bto:\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g
const NAV = /\bnavigate\(\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g
/* Any path-like literal starting with '/'. Used only to soften the reverse
   orphan check — never to fail a build — so an indirected link (a `linkFor`
   helper, a role-prefixed base) does not read as a dead route. */
const LITERAL = /(?:"|'|`)(\/[A-Za-z0-9_:${}/-]*)(?:"|'|`)/g

const targets = [] // real router navigations — drive the hard dead-link check
const mentions = [] // any route-shaped literal — only relaxes orphan warnings
for (const file of sources()) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(SRC, file)
  for (const re of [TO, TOPROP, NAV]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(src))) {
      const raw = m[1] ?? m[2] ?? m[3] ?? m[4]
      if (raw && raw.startsWith('/')) targets.push({ path: norm(raw), raw, file: rel })
    }
  }
  LITERAL.lastIndex = 0
  let lm
  while ((lm = LITERAL.exec(src))) mentions.push(norm(lm[1]))
}

/* ---- 1. no target may point at an unmounted route ----------------------- */
const dead = targets.filter((t) => !mounted.some((r) => matches(t.path, r)))

/* ---- 2. every mounted route (bar / and *) should be reached ------------- */
const reachable = new Set(['/', '*'])
const orphan = mounted.filter(
  (r) =>
    !reachable.has(r) &&
    !targets.some((t) => matches(t.path, r)) &&
    !mentions.some((p) => matches(p, r))
)

const name = 'route'
const file = 'App.jsx ↔ rail'
if (dead.length === 0) {
  console.log(`OK   ${name.padEnd(9)}${file}  (${mounted.length} routes, ${targets.length} links)`)
} else {
  console.log(`FAIL ${name.padEnd(9)}${file}`)
  for (const d of dead) console.log(`       dead link  ${d.raw}  → no route  (${d.file})`)
}
for (const o of orphan) console.log(`       WARN  mounted but unlinked: ${o}`)

process.exit(dead.length === 0 ? 0 : 1)
