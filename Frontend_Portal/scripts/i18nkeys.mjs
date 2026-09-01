#!/usr/bin/env node
/**
 * scripts/i18nkeys.mjs — every t() key exists, in both languages.
 *
 * A missing key renders as the key itself, which looks like a bug to a user and
 * like nothing at all to a developer reading the source. Hindi is checked as
 * strictly as English: a key present in en.json and absent from hi.json means a
 * Hindi-speaking inspector sees a dotted identifier in the middle of a sentence.
 *
 * Two shapes are collected. Direct calls — t('nav.home') — and key constants,
 * because this codebase keeps tables like RESULT_TILES with a `labelKey` field
 * that is handed to t() somewhere else entirely.
 *
 * Dynamic keys built by concatenation cannot be checked and are counted, not
 * guessed at, in the summary line.
 *
 * Usage: node scripts/i18nkeys.mjs src
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { strip } from './lib/strip.mjs'

const root = process.argv[2] ?? 'src'

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|mjs)$/.test(entry)) out.push(p)
  }
  return out
}

function flatten(obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out.add(key)
  }
  return out
}

const en = flatten(JSON.parse(readFileSync(join(root, 'i18n/en.json'), 'utf8')))
const hi = flatten(JSON.parse(readFileSync(join(root, 'i18n/hi.json'), 'utf8')))

/* Direct t('…') / t("…"), and *Key: '…' constants. The stripper blanks string
   bodies, so these run against the raw source. */
const DIRECT = /\bt\(\s*(['"])([^'"]+)\1/g
const KEYCONST = /\b[A-Za-z0-9_$]*[kK]ey\s*:\s*(['"])([^'"]+)\1/g
const DYNAMIC = /\bt\(\s*(?:`|[A-Za-z0-9_$]+[.[])/g

const found = new Map()
let dynamic = 0

for (const file of walk(root)) {
  const raw = readFileSync(file, 'utf8')
  /* Skip the locale files themselves and comment bodies. */
  if (/i18n[\\/](en|hi)\.json$/.test(file)) continue
  const code = strip(raw)
  const blanked = new Set()
  for (let i = 0; i < code.length; i++) if (code[i] === ' ' && raw[i] !== ' ') blanked.add(i)

  let m
  DIRECT.lastIndex = 0
  while ((m = DIRECT.exec(raw)) !== null) {
    if (blanked.has(m.index)) continue
    if (!found.has(m[2])) found.set(m[2], file)
  }
  KEYCONST.lastIndex = 0
  while ((m = KEYCONST.exec(raw)) !== null) {
    if (blanked.has(m.index)) continue
    if (!/^[a-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(m[2])) continue
    if (!found.has(m[2])) found.set(m[2], file)
  }
  DYNAMIC.lastIndex = 0
  while ((m = DYNAMIC.exec(code)) !== null) dynamic++
}

const problems = []
for (const [key, file] of [...found].sort()) {
  const missing = []
  if (!en.has(key)) missing.push('en')
  if (!hi.has(key)) missing.push('hi')
  if (missing.length) problems.push(`'${key}' missing from ${missing.join(' and ')}  (${file})`)
}

/* Keys defined and never referenced: not an error, but worth seeing. */
const unusedEn = [...en].filter((k) => !found.has(k) && !k.startsWith('meta.'))

if (problems.length === 0) {
  console.log(`OK   i18nkeys  ${found.size} literal keys resolve in en and hi`)
  console.log(`       ${dynamic} dynamic key${dynamic === 1 ? '' : 's'} not statically checkable`)
  if (unusedEn.length) console.log(`       ${unusedEn.length} defined keys are never referenced`)
  process.exit(0)
}

console.log(`FAIL i18nkeys  ${problems.length} unresolved`)
for (const p of problems) console.log(`       ${p}`)
process.exit(1)
