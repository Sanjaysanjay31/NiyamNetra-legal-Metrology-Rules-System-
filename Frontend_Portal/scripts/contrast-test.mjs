#!/usr/bin/env node
/**
 * scripts/contrast-test.mjs — the palette must earn the ratios it claims.
 *
 * tokens.css is annotated line by line with WCAG figures ("5.36:1 on white").
 * This recomputes each one from the actual hex, so a colour cannot be changed
 * without the number next to it being re-earned. Two things are checked:
 *
 *   1. A HARD gate: an explicit table of foreground/background pairs, each with
 *      the WCAG threshold it must clear — 4.5:1 for normal text (1.4.3), 3.0:1
 *      for a control boundary, status graphic, chart series or focus ring
 *      (1.4.11). The portal ships a single light theme, so every pair is
 *      measured once, in that theme. A regression FAILS the build.
 *   2. A SOFT check: every annotated "N.NN:1" must be reproducible against some
 *      real anchor (surface, canvas, rail, navy or the token's own fill). An
 *      annotation that no longer computes is a WARNING — the comment has
 *      drifted from the colour.
 *
 * Dividers and badge borders are exempt by design (state is carried by icon +
 * word + colour), so anything a comment marks "decorative" is not gated.
 *
 * Zero dependencies: it runs on bare Node, like every check in this folder.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const RAW = readFileSync(resolve(here, '..', 'src', 'theme', 'tokens.css'), 'utf8')

/* ---- WCAG 2.1 relative luminance + contrast ----------------------------- */
function toRgb(hex) {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255)
}
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (hex) => {
  const [r, g, b] = toRgb(hex).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function ratio(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
const round = (n) => Math.round(n * 100) / 100
/* ---- parse tokens.css into scopes keyed by selector -------------------- */
const noComments = RAW.replace(/\/[\s\S]*?\*\//g, '')
const blocks = {}
for (const m of noComments.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
  const selector = m[1].split('\n').map((s) => s.trim()).filter(Boolean).pop()
  const vars = {}
  for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim()
  blocks[selector] = { ...(blocks[selector] || {}), ...vars }
}

const isHex = (v) => /^#[0-9a-fA-F]{3,8}$/.test(v)

/** Resolve a variable for a theme ('light') — the cascade base. Kept
 *  parameterised so a second theme can be reintroduced without a rewrite. */
function getVar(name, theme = 'light') {
  const chain = [':root']
  if (theme === 'dark') chain.push("[data-theme='dark']")
  let val = null
  for (const sel of chain) {
    const v = blocks[sel]?.[name]
    if (v != null) val = v
  }
  return val && isHex(val) ? val : null
}
/* ---- 1. HARD gate: measured pairs vs their WCAG threshold --------------- */
const TEXT = 4.5
const NON = 3.0
const results = []
function check(theme, fg, bg, min, label) {
  const f = getVar(fg, theme)
  const b = getVar(bg, theme)
  const scope = theme
  if (!f || !b) {
    results.push({ ok: false, scope, label, detail: `unresolved ${!f ? fg : bg}` })
    return
  }
  const r = round(ratio(f, b))
  results.push({ ok: r >= min - 0.005, scope, label, detail: `${r.toFixed(2)}:1 (min ${min})` })
}

const FAMILIES = ['pass', 'violation', 'review', 'na', 'info', 'offline']
check('light', '--nn-text', '--nn-surface', TEXT, 'text on surface')
check('light', '--nn-text', '--nn-bg', TEXT, 'text on canvas')
check('light', '--nn-text-2', '--nn-surface', TEXT, 'text-2 on surface')
check('light', '--nn-text-3', '--nn-surface', TEXT, 'text-3 on surface')
check('light', '--nn-rail-label', '--nn-rail', TEXT, 'rail label on rail')
check('light', '--nn-control', '--nn-surface', NON, 'control boundary')
for (const fam of FAMILIES) check('light', `--nn-${fam}-text`, `--nn-${fam}-fill`, TEXT, `${fam} text on fill`)
for (const fam of ['pass', 'violation', 'review', 'na', 'info'])
  check('light', `--nn-${fam}-graphic`, '--nn-surface', NON, `${fam} graphic`)
for (let i = 1; i <= 5; i++) check('light', `--nn-chart-${i}`, '--nn-surface', NON, `chart series ${i}`)
check('light', '--nn-accent', '--nn-surface', NON, 'accent graphic')
check('light', '--nn-accent-text', '--nn-surface', TEXT, 'accent text')
check('light', '--nn-accent-on', '--nn-accent', TEXT, 'label on accent fill')
check('light', '--nn-accent-ring', '--nn-surface', NON, 'focus ring')
check('light', '--nn-accent-text', '--nn-accent-soft', TEXT, 'accent text on soft')
/* ---- 2. SOFT check: every annotated "N.NN:1" must reproduce ------------
 * Walk tokens.css line by line, tracking which scope we are in. For a line
 * that both sets a hex and carries a "N.NN:1" comment, recompute that ratio
 * against a pool of plausible anchors (white, surface, canvas, rail, navy,
 * teal, the accent fill, the accent-soft bg, and — for a semantic
 * *-text/-graphic/-on token — its own family fill). If no anchor reproduces
 * the claimed figure, the comment has drifted: WARN. */
const warnings = []
const LINE = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;([^\n]*)/
for (const raw of RAW.split('\n')) {
  const dm = raw.match(LINE)
  if (!dm) continue
  const [, name, hex, tail] = dm
  const claims = [...tail.matchAll(/(\d+(?:\.\d+)?)\s*:\s*1/g)].map((m) => Number(m[1]))
  if (!claims.length) continue
  const anchors = [
    '#ffffff',
    getVar('--nn-surface'),
    getVar('--nn-surface-2'),
    getVar('--nn-bg'),
    getVar('--nn-rail'),
    getVar('--nn-navy'),
    getVar('--nn-teal'),
    getVar('--nn-accent'),
    getVar('--nn-accent-soft'),
  ]
  const fam = name.match(/^--nn-([a-z]+)-(?:text|graphic|on|border)$/)
  if (fam) anchors.push(getVar(`--nn-${fam[1]}-fill`))
  const pool = anchors.filter(isHex)
  /* --nn-accent-soft is annotated by the text that sits ON it ("text on
     soft: N"), so the measured foreground is the accent text, not the soft
     fill itself; the soft fill is already in the anchor pool. */
  const fgHex = (name === '--nn-accent-soft' && getVar('--nn-accent-text')) || hex
  for (const claim of claims) {
    let best = Infinity
    let got = null
    for (const anc of pool) {
      const r = round(ratio(fgHex, anc))
      if (Math.abs(r - claim) < best) {
        best = Math.abs(r - claim)
        got = r
      }
    }
    if (best > 0.06)
      warnings.push({ scope: 'light', name, claim, got })
  }
}
/* ---- report, in the shared OK/FAIL idiom of the other checks ----------- */
const failed = results.filter((r) => !r.ok)
const name = 'contrast'
const file = 'tokens.css'
if (failed.length === 0) {
  console.log(`OK   ${name.padEnd(9)}${file}  (${results.length} pairs, all clear their WCAG minimum)`)
} else {
  console.log(`FAIL ${name.padEnd(9)}${file}`)
  for (const r of failed) console.log(`       ${r.scope.padEnd(14)} ${r.label} — ${r.detail}`)
}
for (const w of warnings)
  console.log(
    `       WARN  ${w.scope.padEnd(14)} ${w.name}: comment says ${w.claim}:1, closest anchor computes ${w.got}:1`,
  )

process.exit(failed.length === 0 ? 0 : 1)
