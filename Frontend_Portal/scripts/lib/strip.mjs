#!/usr/bin/env node
/**
 * scripts/lib/strip.mjs — remove comments and string bodies, keep offsets.
 *
 * Every other check in this folder wants to reason about brackets and tags
 * without a parser and without tripping over a `'}'` inside a string or a `<`
 * inside a comment. Replacing those spans with spaces of the same length keeps
 * every reported line and column honest.
 *
 * Zero dependencies on purpose: `npm install` is unavailable in this
 * environment, so the whole verification story has to run on bare Node.
 */

/* A `/` after one of these words opens a regex, even though the character just
   before it is a letter. `return /[",\r\n]/.test(s)` is the case that matters
   here; without the list that regex is read as a division and the `"` inside it
   opens a phantom string. */
const PREFIX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'do',
  'else', 'yield', 'await', 'case', 'throw',
])

export function strip(src) {
  const out = Array.from(src)
  const n = src.length
  /* Template literals nest: `${ `a` }`. The stack holds the brace depth at
     which each open template sits so the closing backtick is found correctly. */
  const tmpl = []
  let i = 0
  let brace = 0
  /* The last significant character seen, used only to tell a regex literal from
     a division. */
  let prev = ''

  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== '\n') out[k] = ' '
  }

  /** True when the `/` at `at` begins a regex rather than a division. */
  const regexHere = (at) => {
    if (prev === '') return true
    /* `</Tag>` — a JSX closing tag, not `less-than /regex/`. This codebase never
       writes `a < /re/`, so a `/` right after `<` is always a closing tag. */
    if (prev === '<') return false
    if (!/[A-Za-z0-9_$)\]]/.test(prev)) return true
    /* `)` and `]` end an expression, so what follows is division. */
    if (prev === ')' || prev === ']') return false
    /* An identifier: division, unless the identifier is a keyword. */
    let p = at - 1
    while (p >= 0 && /\s/.test(src[p])) p--
    let e = p + 1
    while (p >= 0 && /[A-Za-z0-9_$]/.test(src[p])) p--
    return PREFIX_KEYWORDS.has(src.slice(p + 1, e))
  }


  while (i < n) {
    const c = src[i]
    const d = src[i + 1]

    if (c === '/' && d === '/') {
      let j = i + 2
      while (j < n && src[j] !== '\n') j++
      blank(i, j)
      i = j
      continue
    }
    if (c === '/' && d === '*') {
      let j = i + 2
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++
      blank(i, Math.min(j + 2, n))
      i = j + 2
      continue
    }
    if (c === '/' && d !== '>' && regexHere(i)) {
      /* A regex body, including any `/` inside a character class. `d !== '>'`
         keeps a self-closing JSX tag (`<Icon />`) from being read as a regex
         when another `/` shares the line. */
      let j = i + 1
      let inClass = false
      let closed = false
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === '[') inClass = true
        else if (src[j] === ']') inClass = false
        else if (src[j] === '/' && !inClass) { closed = true; break }
        j++
      }
      if (closed) {
        blank(i + 1, j)
        prev = '/'
        i = j + 1
        while (i < n && /[dgimsuvy]/.test(src[i])) i++
        continue
      }
      /* Unterminated on this line: it was division after all. */
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === c || src[j] === '\n') break
        j++
      }
      blank(i + 1, j)
      prev = c
      i = j + 1
      continue
    }
    if (c === '`') {
      let j = i + 1
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === '`') break
        if (src[j] === '$' && src[j + 1] === '{') break
        j++
      }
      blank(i + 1, j)
      /* `${` opens an interpolation. Record the brace depth and step past the
         `{` without counting it, so the matching `}` is recognisable. A plain
         `` `…` `` closes here and pushes nothing. */
      if (src[j] === '`') { prev = '`'; i = j + 1 }
      else { tmpl.push(brace); prev = '{'; i = j + 2 }
      continue
    }
    if (c === '}' && tmpl.length && brace === tmpl[tmpl.length - 1]) {
      /* This `}` closes a `${…}`. Consume it (its `{` was never counted) and
         resume scanning the literal that follows. */
      tmpl.pop()
      let j = i + 1
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === '`') break
        if (src[j] === '$' && src[j + 1] === '{') break
        j++
      }
      blank(i + 1, j)
      if (src[j] === '`') { prev = '`'; i = j + 1 }
      else { tmpl.push(brace); prev = '{'; i = j + 2 }
      continue
    }
    if (c === '{') brace++
    else if (c === '}') brace--
    if (!/\s/.test(c)) prev = c
    i++
  }
  return out.join('')
}


export function lineCol(src, index) {
  const upto = src.slice(0, index)
  const line = upto.split('\n').length
  const col = index - (upto.lastIndexOf('\n') + 1) + 1
  return `${line}:${col}`
}

export function report(name, file, problems) {
  if (problems.length === 0) {
    console.log(`OK   ${name.padEnd(9)}${file}`)
    return 0
  }
  console.log(`FAIL ${name.padEnd(9)}${file}`)
  for (const p of problems) console.log(`       ${p}`)
  return 1
}
