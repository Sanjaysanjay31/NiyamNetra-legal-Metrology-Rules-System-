#!/usr/bin/env node
/**
 * scripts/jsxnames.mjs — every component a file renders is a component it has.
 *
 * This is the check that would have caught `TriangleAlert` — an icon name that
 * exists in a later lucide-react than the one pinned here, imported from nowhere
 * and rendered anyway. A capitalised JSX tag must resolve to an import in the
 * same file, a declaration in the same file, or a parameter destructured with a
 * capitalised alias (the `icon: Icon` pattern this codebase uses everywhere).
 *
 * Usage: node scripts/jsxnames.mjs src/screens/Foo.jsx [more files...]
 */

import { readFileSync } from 'node:fs'
import { lineCol, report, strip } from './lib/strip.mjs'

const ENDS_EXPRESSION = /[A-Za-z0-9_$)\]]/

/* Names React resolves itself. Fragments are written `<>` here, but the long
   form is legal and should not be reported. */
const BUILTIN = new Set(['Fragment', 'React', 'Suspense', 'StrictMode', 'Profiler'])

function declared(src) {
  const names = new Set()
  const add = (re, group = 1) => {
    let m
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    while ((m = r.exec(src)) !== null) names.add(m[group])
  }
  add(/\bimport\s+([A-Za-z0-9_$]+)/)
  add(/\bfunction\s+([A-Za-z0-9_$]+)/)
  add(/\bclass\s+([A-Za-z0-9_$]+)/)
  add(/\b(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=/)
  /* Braced import specifiers, and `x as Y`. */
  let m
  const clause = /\bimport\s*\{([\s\S]*?)\}\s*from/g
  while ((m = clause.exec(src)) !== null) {
    for (const part of m[1].split(',')) {
      const bit = part.trim()
      if (!bit) continue
      const as = /\bas\s+([A-Za-z0-9_$]+)$/.exec(bit)
      names.add(as ? as[1] : bit.split(/\s+/)[0])
    }
  }
  /* Destructured bindings, including the `icon: Icon = Info` default form and
     plain `{ Icon }` in a component's parameter list. */
  const destructure = /\{([^{}]*)\}\s*(?:=|\)|,)/g
  while ((m = destructure.exec(src)) !== null) {
    for (const part of m[1].split(',')) {
      const bit = part.trim()
      if (!bit) continue
      const renamed = /^[A-Za-z0-9_$'"]+\s*:\s*([A-Za-z0-9_$]+)/.exec(bit)
      if (renamed) { names.add(renamed[1]); continue }
      const plain = /^([A-Za-z0-9_$]+)/.exec(bit)
      if (plain) names.add(plain[1])
    }
  }
  return names
}

let code = 0
for (const file of process.argv.slice(2)) {
  const src = strip(readFileSync(file, 'utf8'))
  const have = declared(src)
  const problems = []
  const seen = new Set()

  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '<') continue
    /* A capitalised tag name after `<` or `</` is what we are after. Keying off
       the following character rather than the preceding one so that a component
       rendered straight after text — `label<Icon/>` — is still seen. */
    const m = /^<\/?([A-Z][A-Za-z0-9_$]*)(?:\.[A-Za-z0-9_$]+)?/.exec(src.slice(i))
    if (!m) continue
    const name = m[1]
    if (have.has(name) || BUILTIN.has(name)) continue
    const at = lineCol(src, i)
    const label = `<${name}> at ${at} is not imported or declared in this file`
    if (seen.has(name)) continue
    seen.add(name)
    problems.push(label)
  }
  code |= report('jsxnames', file, problems)
}
process.exit(code)
