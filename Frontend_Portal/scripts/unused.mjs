#!/usr/bin/env node
/**
 * scripts/unused.mjs — imports that nothing in the file uses.
 *
 * An unused import is not fatal, but in this codebase it is nearly always the
 * fingerprint of a real mistake: an icon swapped out and left behind, or a ui
 * primitive that was going to be used in a section that ended up written another
 * way. It also catches the opposite error indirectly — a name that was renamed
 * in the body but not in the import list shows up here as unused while
 * jsxnames.mjs reports the new name as unknown.
 *
 * Usage: node scripts/unused.mjs src/screens/Foo.jsx [more files...]
 */

import { readFileSync } from 'node:fs'
import { report, strip } from './lib/strip.mjs'

const IMPORT = /^\s*import\s+([\s\S]*?)\s+from\s*['"][^'"]*['"]\s*;?\s*$/gm
const BARE = /^\s*import\s*['"][^'"]*['"]\s*;?\s*$/gm

/** Local binding names introduced by one import clause. */
function bindings(clause) {
  const names = []
  const braced = /\{([\s\S]*?)\}/.exec(clause)
  if (braced) {
    for (const part of braced[1].split(',')) {
      const bit = part.trim()
      if (!bit) continue
      const as = /\bas\s+([A-Za-z0-9_$]+)$/.exec(bit)
      names.push(as ? as[1] : bit.split(/\s+/)[0])
    }
  }
  /* Default and namespace clauses sit outside the braces. */
  const outside = clause.replace(/\{[\s\S]*?\}/g, '').replace(/,/g, ' ')
  for (const bit of outside.split(/\s+/)) {
    if (!bit) continue
    if (bit === 'as' || bit === '*' || bit === 'type') continue
    if (/^[A-Za-z0-9_$]+$/.test(bit)) names.push(bit)
  }
  const star = /\*\s+as\s+([A-Za-z0-9_$]+)/.exec(clause)
  if (star) names.push(star[1])
  return [...new Set(names)]
}

let code = 0
for (const file of process.argv.slice(2)) {
  const raw = readFileSync(file, 'utf8')
  const src = strip(raw)

  const names = []
  let m
  IMPORT.lastIndex = 0
  while ((m = IMPORT.exec(src)) !== null) {
    for (const name of bindings(m[1])) names.push(name)
  }
  /* The body is everything that is not an import statement. */
  const body = src.replace(IMPORT, '').replace(BARE, '')

  const problems = []
  for (const name of [...new Set(names)]) {
    const used = new RegExp(`(^|[^A-Za-z0-9_$.])${name.replace(/\$/g, '\\$')}([^A-Za-z0-9_$]|$)`).test(
      body
    )
    if (!used) problems.push(`'${name}' is imported and never used`)
  }
  code |= report('unused', file, problems)
}
process.exit(code)
