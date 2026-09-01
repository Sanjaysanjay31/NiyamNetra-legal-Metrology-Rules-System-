#!/usr/bin/env node
/**
 * scripts/balance.mjs — brackets and JSX tags, paired.
 *
 * Vite cannot run here (no node_modules), so an unclosed `<Card>` or a stray `}`
 * would otherwise only be discovered by the person who opens the app. This walks
 * the stripped source and reports the first place a pair goes wrong, with a line
 * and column.
 *
 * The JSX scan is deliberately heuristic in one respect: `<` is treated as a tag
 * opener only when the previous non-space character cannot end an expression.
 * That distinguishes `<Card>` from `distance < radius` without a parser.
 *
 * Usage: node scripts/balance.mjs src/screens/Foo.jsx [more files...]
 */

import { readFileSync } from 'node:fs'
import { lineCol, report, strip } from './lib/strip.mjs'

const PAIRS = { ')': '(', ']': '[', '}': '{' }
const OPEN = new Set(['(', '[', '{'])

/* A character that can legally end an expression means the following `<` is a
   comparison, not a tag. */
const ENDS_EXPRESSION = /[A-Za-z0-9_$)\]]/

function brackets(src, problems) {
  const stack = []
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (OPEN.has(c)) stack.push({ c, i })
    else if (PAIRS[c]) {
      const top = stack.pop()
      if (!top) problems.push(`${lineCol(src, i)} unexpected '${c}' with nothing open`)
      else if (top.c !== PAIRS[c])
        problems.push(`${lineCol(src, i)} '${c}' closes '${top.c}' opened at ${lineCol(src, top.i)}`)
    }
  }
  for (const s of stack) problems.push(`${lineCol(src, s.i)} '${s.c}' is never closed`)
}

/** Index just past the `>` that ends a tag, skipping brace-wrapped attributes. */
function tagEnd(src, from) {
  let depth = 0
  for (let i = from; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) return i
  }
  return -1
}

function jsx(src, problems) {
  const stack = []
  let i = 0
  while (i < src.length) {
    if (src[i] !== '<') { i++; continue }

    /* What follows `<` decides it, not what precedes it: `</` and `<>` are
       always tags, `<` then a letter opens one, and `<` then anything else
       (space, digit, `<`, `=`) is a comparison or shift. JSX comparisons in
       this codebase are always spaced (`a < b`), so a real `<` operator always
       has a space after it and is skipped here. Keying off the previous
       character instead would misread `today</button>` — text ending in a
       letter — as `today < …`. */
    const next = src[i + 1]
    if (next !== '/' && next !== '>' && !/[A-Za-z]/.test(next ?? '')) { i++; continue }
    if (next === '>') { stack.push({ name: '', i }); i += 2; continue }
    if (next === '/') {
      const close = src.indexOf('>', i)
      if (close === -1) { problems.push(`${lineCol(src, i)} closing tag never ends`); break }
      const name = src.slice(i + 2, close).trim()
      const top = stack.pop()
      if (!top) problems.push(`${lineCol(src, i)} </${name}> with nothing open`)
      else if (top.name !== name)
        problems.push(
          `${lineCol(src, i)} </${name || '>'}> closes <${top.name || '>'}> opened at ${lineCol(src, top.i)}`
        )
      i = close + 1
      continue
    }
    if (!/[A-Za-z_$]/.test(next ?? '')) { i++; continue }

    const m = /^[A-Za-z0-9_$.:-]+/.exec(src.slice(i + 1))
    const name = m ? m[0] : ''
    const end = tagEnd(src, i + 1 + name.length)
    if (end === -1) { problems.push(`${lineCol(src, i)} <${name}> never ends`); break }
    let q = end - 1
    while (q > i && /\s/.test(src[q])) q--
    if (src[q] !== '/') stack.push({ name, i })
    i = end + 1
  }
  for (const s of stack) problems.push(`${lineCol(src, s.i)} <${s.name || '>'}> is never closed`)
}

let code = 0
for (const file of process.argv.slice(2)) {
  const src = strip(readFileSync(file, 'utf8'))
  const problems = []
  brackets(src, problems)
  jsx(src, problems)
  code |= report('balance', file, problems)
}
process.exit(code)
