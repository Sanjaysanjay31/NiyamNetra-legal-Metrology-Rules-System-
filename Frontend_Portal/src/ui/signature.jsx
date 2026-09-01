/**
 * The two devices that make this product look like itself.
 *
 * Everything else in the interface is a well-made version of something you have
 * seen before: cards, a rail, a table. These two are the parts that exist
 * because of what this product *is* - an instrument that measures nineteen
 * things and is honest about which of them it could not measure.
 *
 *   CheckRibbon     - all nineteen checks at once, in the order the law applies
 *                     them, with the denominator stated underneath.
 *   UncertaintyBar  - a measured value with its error band against the
 *                     statutory threshold, so "not assessed" explains itself.
 *
 * Both encode state in shape as well as colour, and both were checked in
 * greyscale. A compliance readout that collapses into an undifferentiated row
 * of grey bars for a colour-blind officer is not a compliance readout.
 */

import { useId } from 'react'
import {
  CHECKS,
  DERIVED_CHECK,
  REGISTRATION_ORDER,
  denominatorLabel,
  verdictOf,
} from '../lib/checks'
import { cx } from './index'

/* -------------------------------------------------------------------------- */
/* CheckRibbon                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Verdict is carried by three independent channels, so removing any one still
 * leaves the row readable:
 *
 *   height  pass and fail run full height; not-assessed runs short. A row of
 *           mixed heights is legible from across a room.
 *   fill    solid for an assessed verdict, hollow with a dashed edge for one
 *           that was not assessed. This is the greyscale-safe distinction.
 *   cap     a fail carries a detached cap above its bar. It is the only mark
 *           in the ribbon that breaks the baseline grid, which is exactly why
 *           the eye finds it first.
 */
const TICK = {
  pass: { h: 100, solid: true, cap: false, color: 'var(--nn-pass-graphic)' },
  fail: { h: 100, solid: true, cap: true, color: 'var(--nn-violation-graphic)' },
  not_assessed: { h: 44, solid: false, cap: false, color: 'var(--nn-na-graphic)' },
  pending: { h: 18, solid: false, cap: false, color: 'var(--nn-divider)' },
}

function Tick({ check, finding, interactive, onSelect, height }) {
  const verdict = verdictOf(finding) ?? 'pending'
  const t = TICK[verdict] ?? TICK.pending
  const derived = check.id === DERIVED_CHECK
  const label = `${check.id} — ${check.short}: ${
    verdict === 'pending' ? 'not yet run' : verdict === 'fail' ? 'violation' : verdict.replace('_', ' ')
  }`

  const bar = (
    <span className="relative flex h-full w-full flex-col items-stretch justify-end">
      {t.cap && (
        <span
          className="mb-[3px] h-[4px] w-full shrink-0 rounded-[2px]"
          style={{ background: t.color }}
          aria-hidden="true"
        />
      )}
      <span
        className="w-full rounded-[3px] transition-[height,background-color] duration-slow ease-settle"
        style={{
          height: `${t.cap ? t.h - 12 : t.h}%`,
          background: t.solid ? t.color : 'transparent',
          border: t.solid ? 'none' : `1.5px dashed ${t.color}`,
        }}
        aria-hidden="true"
      />
    </span>
  )

  const shell = cx(
    'group relative flex-1 basis-0',
    derived && 'ml-2.5',
    interactive && 'cursor-pointer'
  )

  if (!interactive) {
    return (
      <span className={shell} style={{ height, minWidth: 6 }} title={label}>
        {bar}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={cx(shell, 'rounded-sm')}
      style={{ height, minWidth: 6 }}
      title={label}
      aria-label={label}
      onClick={() => onSelect?.(check.id)}
    >
      {bar}
    </button>
  )
}

/**
 * @param findings    array of { check_id, verdict } in any order
 * @param assessed    how many of the eighteen were reachable (e.g. 16)
 * @param scanType    'package' | 'listing' | 'both'
 * @param interactive make the ticks focusable buttons. Only pass this where the
 *                    ribbon is at least ~520px wide, so a tick clears 24px; on
 *                    a phone the ribbon is a graphic and navigation happens
 *                    through the full-width finding rows instead.
 */
export function CheckRibbon({
  findings = [],
  assessed,
  scanType = 'package',
  interactive = false,
  onSelect,
  height = 56,
  showLegend = true,
  className,
}) {
  const byId = new Map(findings.map((f) => [f.check_id, f]))
  const summaryId = useId()

  const counts = REGISTRATION_ORDER.reduce(
    (acc, id) => {
      if (id === DERIVED_CHECK) return acc
      const v = verdictOf(byId.get(id)) ?? 'pending'
      acc[v] = (acc[v] ?? 0) + 1
      return acc
    },
    { pass: 0, fail: 0, not_assessed: 0, pending: 0 }
  )
  const reached = assessed ?? counts.pass + counts.fail

  return (
    <figure className={cx('m-0', className)}>
      <div
        className="flex items-end gap-[3px]"
        style={{ height }}
        role="img"
        aria-describedby={summaryId}
        aria-label="Check ribbon: all nineteen checks in the order the Rules apply them"
      >
        {REGISTRATION_ORDER.map((id) => (
          <Tick
            key={id}
            check={CHECKS[id]}
            finding={byId.get(id)}
            interactive={interactive}
            onSelect={onSelect}
            height={height}
          />
        ))}
      </div>

      {/* The denominator sits under the ribbon, in mono, always. The ribbon
          shows nineteen marks; the count says eighteen. Without this line that
          looks like an error rather than the deliberate exclusion of the
          derived Section 36 tier. */}
      <figcaption className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="nn-mono text-caption font-medium text-ink-2">
          {denominatorLabel({ assessed: reached, scanType })}
        </span>
        <span className="nn-eyebrow">
          CHK01–CHK18 + CHK06b · tier excluded
        </span>
      </figcaption>

      <p id={summaryId} className="sr-only-nn">
        {`${counts.pass} passed, ${counts.fail} in violation, ${counts.not_assessed} not assessed` +
          (counts.pending ? `, ${counts.pending} not yet run` : '') +
          `. ${denominatorLabel({ assessed: reached, scanType })}. The nineteenth mark is the derived Section 36 tier and is excluded from the denominator.`}
      </p>

      {showLegend && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 p-0">
          <LegendItem verdict="pass" label="Pass" n={counts.pass} />
          <LegendItem verdict="fail" label="Violation" n={counts.fail} />
          <LegendItem verdict="not_assessed" label="Not assessed" n={counts.not_assessed} />
          {counts.pending > 0 && <LegendItem verdict="pending" label="Not yet run" n={counts.pending} />}
        </ul>
      )}
    </figure>
  )
}

function LegendItem({ verdict, label, n }) {
  const t = TICK[verdict]
  return (
    <li className="flex list-none items-center gap-2">
      <span className="flex h-4 w-2 items-end" aria-hidden="true">
        <span
          className="w-full rounded-[2px]"
          style={{
            height: `${Math.max(t.h, 30)}%`,
            background: t.solid ? t.color : 'transparent',
            border: t.solid ? 'none' : `1.5px dashed ${t.color}`,
          }}
        />
      </span>
      <span className="text-caption text-ink-2">{label}</span>
      <span className="nn-mono text-caption font-semibold text-ink">{n}</span>
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* UncertaintyBar                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Why this exists at all.
 *
 * Rule 7 says a character must be at least 1.5 mm tall. The engine measures
 * 1.48 mm from a photograph, with a scale it resolved from a reference object,
 * and the measurement carries roughly +/- 0.2 mm. Reporting "1.48 < 1.50,
 * violation" would be a number the project cannot defend in front of a
 * magistrate. Reporting "pass" would be worse.
 *
 * So the engine returns not_assessed, and this bar is the explanation: the
 * measured band straddles the threshold notch. An officer sees, in one glance,
 * that the answer is genuinely undetermined rather than withheld - and that
 * recapturing with a scale reference is what would settle it.
 */
export function UncertaintyBar({
  value,
  uncertainty = 0,
  threshold,
  unit = 'mm',
  verdict,
  label,
  className,
}) {
  if (value == null || threshold == null) return null

  const lo = value - uncertainty
  const hi = value + uncertainty
  /* Domain: whichever is wider, always including the threshold, padded 25% so
     neither the notch nor the band ever touches an edge. */
  const rawMin = Math.min(lo, threshold)
  const rawMax = Math.max(hi, threshold)
  const pad = Math.max((rawMax - rawMin) * 0.35, threshold * 0.15, 0.1)
  const min = Math.max(0, rawMin - pad)
  const max = rawMax + pad
  const pos = (v) => `${((v - min) / (max - min)) * 100}%`

  const straddles = uncertainty > 0 && lo < threshold && hi >= threshold
  const family = verdict === 'fail' ? 'violation' : verdict === 'pass' ? 'pass' : 'na'
  const tone = {
    pass: 'var(--nn-pass-graphic)',
    violation: 'var(--nn-violation-graphic)',
    na: 'var(--nn-na-graphic)',
  }[family]

  const fmt = (n) => `${n.toFixed(2)} ${unit}`

  return (
    <div className={cx('w-full', className)}>
      {label && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="nn-eyebrow">{label}</span>
          <span className="nn-mono text-caption text-ink-2">
            {fmt(value)}
            {uncertainty > 0 && <span className="text-ink-3"> ± {uncertainty.toFixed(2)}</span>}
          </span>
        </div>
      )}

      <div className="relative h-9">
        {/* track */}
        <div className="absolute inset-x-0 top-4 h-1 rounded-pill bg-surface-sunken" />

        {/* The region below the statutory minimum is tinted, so "short of the
            requirement" is a place on the scale rather than a fact to work out. */}
        <div
          className="absolute top-4 h-1 rounded-l-pill bg-violation-fill"
          style={{ left: 0, width: pos(threshold) }}
          aria-hidden="true"
        />

        {/* the threshold notch - full height, so it reads as a wall */}
        <div
          className="absolute top-0.5 h-7 w-[2px] -translate-x-1/2 rounded-pill"
          style={{ left: pos(threshold), background: 'var(--nn-text-2)' }}
          aria-hidden="true"
        />

        {/* the measured band */}
        {uncertainty > 0 && (
          <div
            className="absolute top-[13px] h-2.5 -translate-y-px rounded-pill"
            style={{
              left: pos(lo),
              width: `calc(${pos(hi)} - ${pos(lo)})`,
              background: tone,
              opacity: 0.28,
            }}
            aria-hidden="true"
          />
        )}

        {/* the measured value */}
        <div
          className="absolute top-[11px] h-4 w-4 -translate-x-1/2 rounded-pill border-2"
          style={{ left: pos(value), background: 'var(--nn-surface)', borderColor: tone }}
          aria-hidden="true"
        />
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="nn-mono text-[11px] text-ink-3">
          required ≥ {fmt(threshold)}
        </span>
        {straddles && (
          <span className="text-caption text-na-text">
            The measured band crosses the requirement, so this check is not assessed.
          </span>
        )}
      </div>

      <p className="sr-only-nn">
        {`Measured ${fmt(value)}${uncertainty > 0 ? ` plus or minus ${uncertainty.toFixed(2)} ${unit}` : ''}` +
          ` against a required minimum of ${fmt(threshold)}.` +
          (straddles
            ? ' The uncertainty band crosses the requirement, so the check could not be assessed.'
            : '')}
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* ResultSeal                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The scan result, given the weight it deserves. Four states, and the third and
 * fourth get the same visual prominence as the first two - which is the whole
 * argument of 08 SS2.4. A "not assessed" rendered as a small grey footnote
 * beside a large green tick is how a false assurance reaches a report.
 */
export function ResultSeal({ result, blurb, meta, className }) {
  const map = {
    compliant: { label: 'Success', family: 'pass', ring: 'var(--nn-pass-graphic)' },
    violation: { label: 'Violation', family: 'violation', ring: 'var(--nn-violation-graphic)' },
    not_assessed: { label: 'Not assessed', family: 'na', ring: 'var(--nn-na-graphic)' },
    out_of_scope: { label: 'Out of scope', family: 'na', ring: 'var(--nn-na-graphic)' },
  }
  const m = map[result] ?? map.not_assessed
  return (
    <div className={cx('flex items-start gap-4', className)}>
      {/* A ring rather than a filled disc: a filled green disc at this size
          reads as a stamp of approval, and three of the four states are not
          approvals. */}
      <span
        className="mt-1 grid h-12 w-12 shrink-0 place-items-center rounded-pill border-[3px]"
        style={{ borderColor: m.ring }}
        aria-hidden="true"
      >
        <span className="nn-mono text-[13px] font-bold" style={{ color: m.ring }}>
          {result === 'compliant' ? '✓' : result === 'violation' ? '✕' : '?'}
        </span>
      </span>
      <div className="min-w-0">
        <p className="nn-eyebrow">Scan result</p>
        <p className="text-h1 text-ink">{m.label}</p>
        {blurb && <p className="mt-1 max-w-prose text-small text-ink-2">{blurb}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">{meta}</div>}
      </div>
    </div>
  )
}
