/**
 * The whole component library, in one file.
 *
 * These are the primitives from 08 SS3 and nothing else - no screen logic, no
 * data fetching, no domain vocabulary beyond the verdict families. A screen
 * imports from here and keeps its own markup, styling and behaviour together in
 * its own single file.
 *
 * Rules that are enforced structurally rather than by convention, because
 * convention is what fails on the fourteenth screen:
 *
 *   - A disabled primary action always renders helper text. `disabled` without
 *     `disabledReason` throws in development. 08 SS3.1: a dead button with no
 *     explanation is the most common accessibility failure in review UIs.
 *   - A verdict is never colour alone. VerdictBadge always renders icon + word.
 *   - `AlertTriangle` is reserved for system warnings and never appears on a
 *     finding. Findings use CheckCircle / XCircle / HelpCircle / Clock.
 *   - Every control is at least 44px tall; primary actions are 48px.
 */

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  HelpCircle,
  Info,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react'

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

export const cx = (...parts) => parts.filter(Boolean).join(' ')

const DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV

/** family -> the four token roles. Keyed by verdict family, never by hue. */
export const FAMILY = {
  pass: {
    fill: 'bg-pass-fill',
    border: 'border-pass-border',
    text: 'text-pass-text',
    graphic: 'text-pass-graphic',
    raw: 'var(--nn-pass-graphic)',
    Icon: CheckCircle,
  },
  violation: {
    fill: 'bg-violation-fill',
    border: 'border-violation-border',
    text: 'text-violation-text',
    graphic: 'text-violation-graphic',
    raw: 'var(--nn-violation-graphic)',
    Icon: XCircle,
  },
  review: {
    fill: 'bg-review-fill',
    border: 'border-review-border',
    text: 'text-review-text',
    graphic: 'text-review-graphic',
    raw: 'var(--nn-review-graphic)',
    Icon: Clock,
  },
  na: {
    fill: 'bg-na-fill',
    border: 'border-na-border',
    text: 'text-na-text',
    graphic: 'text-na-graphic',
    raw: 'var(--nn-na-graphic)',
    Icon: HelpCircle,
  },
  info: {
    fill: 'bg-info-fill',
    border: 'border-info-border',
    text: 'text-info-text',
    graphic: 'text-info-graphic',
    raw: 'var(--nn-info-graphic)',
    Icon: Info,
  },
}

/* -------------------------------------------------------------------------- */
/* Eyebrow, PageHeader, SectionTitle                                          */
/* -------------------------------------------------------------------------- */

/**
 * The mono eyebrow. This is the interface's signature typographic move: every
 * label that names a *system* fact rather than a human one is set in JetBrains
 * Mono, small, letterspaced. The eye learns the convention within one screen -
 * monospace means the machine read this, it did not compose it.
 */
export function Eyebrow({ children, className, tone }) {
  return (
    <p className={cx('nn-eyebrow', tone === 'accent' && 'text-accent-text', className)}>
      {children}
    </p>
  )
}

export function PageHeader({ eyebrow, title, subtitle, actions, meta, className }) {
  return (
    <header className={cx('mb-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow>}
          <h1 className="text-h1 text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-prose text-small text-ink-2">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {meta && <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">{meta}</div>}
    </header>
  )
}

/** A hairline with a mono label - opens a section without a heavy heading. */
export function SectionTitle({ children, caption, right, className }) {
  return (
    <div className={cx('mb-3', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <Eyebrow>{children}</Eyebrow>
        {right}
      </div>
      <div className="nn-rule-line mt-1.5" />
      {caption && <p className="mt-2 max-w-prose text-caption text-ink-3">{caption}</p>}
    </div>
  )
}

/**
 * A key/value pair in the instrument header - RULES AS AT, ENGINE, CATALOG.
 * Provenance is stated on screen, not buried in an about page, because a
 * finding is only as good as the rule version it was assessed against.
 */
export function MetaStat({ label, value, title }) {
  return (
    <div title={title}>
      <p className="nn-eyebrow">{label}</p>
      <p className="nn-mono mt-0.5 text-small font-medium text-ink-2">{value}</p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

const BUTTON_VARIANTS = {
  /* Primary is navy: the brand's own ink at 14.63:1 against its white label,
     deliberately independent of the accent so the primary action always reads
     as the heaviest control on the screen. */
  primary:
    'bg-navy text-ink-inverse hover:bg-navy-hover active:translate-y-px shadow-card',
  secondary:
    'bg-surface text-ink border border-control hover:bg-surface-2 hover:border-ink-3',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
  accent: 'bg-accent text-accent-on hover:brightness-110 active:translate-y-px shadow-card',
  danger:
    'bg-violation-graphic text-ink-inverse hover:brightness-95 active:translate-y-px shadow-card',
  quiet: 'bg-surface-2 text-ink-2 hover:bg-surface-sunken hover:text-ink',
}

const BUTTON_SIZES = {
  /* 48 for a primary action, 44 as the floor for everything else. Heights are
     fixed rather than derived from padding so they cannot drift. */
  lg: 'h-12 px-6 text-body font-semibold',
  md: 'h-11 px-4 text-small font-semibold',
  sm: 'h-[36px] px-3 text-small font-medium',
}

export const Button = forwardRef(function Button(
  {
    children,
    variant = 'secondary',
    size = 'md',
    icon: Icon,
    iconRight: IconRight,
    loading = false,
    disabled = false,
    disabledReason,
    fullWidth = false,
    className,
    type = 'button',
    ...rest
  },
  ref
) {
  /* A dead control with no stated reason is the failure 08 SS3.1 singles out.
     Throwing in development is the only way this stays true across 14 screens. */
  if (DEV && disabled && !disabledReason && !loading) {
    throw new Error(
      'Button: `disabled` requires `disabledReason`. A disabled action must say why.'
    )
  }
  const hintId = useId()
  const isOff = disabled || loading

  return (
    <div className={cx(fullWidth && 'w-full')}>
      <button
        ref={ref}
        type={type}
        disabled={isOff}
        aria-describedby={disabledReason && isOff ? hintId : undefined}
        className={cx(
          'inline-flex items-center justify-center gap-2 rounded-sm',
          'transition-all duration-fast ease-settle',
          'disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none',
          'disabled:active:translate-y-0',
          BUTTON_SIZES[size],
          BUTTON_VARIANTS[variant],
          fullWidth && 'w-full',
          className
        )}
        {...rest}
      >
        {loading ? (
          <Loader2 size={size === 'lg' ? 20 : 16} strokeWidth={1.8} className="animate-spin" aria-hidden="true" />
        ) : (
          Icon && <Icon size={size === 'lg' ? 20 : 16} strokeWidth={1.8} aria-hidden="true" />
        )}
        <span className="truncate">{children}</span>
        {IconRight && !loading && (
          <IconRight size={size === 'lg' ? 20 : 16} strokeWidth={1.8} aria-hidden="true" />
        )}
      </button>
      {disabledReason && isOff && (
        <p id={hintId} className="mt-2 text-caption text-ink-3">
          {disabledReason}
        </p>
      )}
    </div>
  )
})

/** Icon-only. The accessible name is required, not optional. */
export const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, size = 20, tone = 'default', className, badge, ...rest },
  ref
) {
  if (DEV && !label) throw new Error('IconButton requires a `label` for its accessible name.')
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'relative grid h-11 w-11 shrink-0 place-items-center rounded-sm',
        'transition-colors duration-fast ease-settle',
        tone === 'onRail'
          ? 'text-rail-label hover:bg-rail-hover hover:text-rail-ink'
          : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        className
      )}
      {...rest}
    >
      <Icon size={size} strokeWidth={1.8} aria-hidden="true" />
      {badge != null && badge !== 0 && (
        <span
          className="nn-mono absolute right-1.5 top-1.5 grid min-w-[18px] place-items-center rounded-pill bg-violation-graphic px-1 text-[10px] font-semibold leading-4 text-ink-inverse"
          aria-hidden="true"
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
})

/* -------------------------------------------------------------------------- */
/* Card, StatCard                                                              */
/* -------------------------------------------------------------------------- */

export function Card({ children, className, interactive = false, as: As = 'div', ...rest }) {
  return (
    <As
      className={cx('nn-card', interactive && 'nn-card-interactive text-left', className)}
      {...rest}
    >
      {children}
    </As>
  )
}

export function CardHeader({ title, caption, right, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h2 className="text-h2 text-ink">{title}</h2>
        {caption && <p className="mt-1 max-w-prose text-caption text-ink-3">{caption}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

/**
 * StatCard. The number is the loudest thing in it, but never louder than its
 * caption is clear: 08 SS4.7 requires every figure to state what it counts and
 * over what window, because "1,284" with no window is a decoration.
 */
export function StatCard({
  label,
  value,
  caption,
  family,
  icon: Icon,
  trend,
  loading = false,
  onClick,
  className,
}) {
  const f = family ? FAMILY[family] : null
  const Comp = onClick ? 'button' : 'div'
  return (
    <Card
      as={Comp}
      interactive={Boolean(onClick)}
      onClick={onClick}
      className={cx('flex w-full flex-col gap-3 p-5', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>{label}</Eyebrow>
        {Icon && (
          <span
            className={cx(
              'grid h-8 w-8 shrink-0 place-items-center rounded-sm',
              f ? cx(f.fill, f.graphic) : 'bg-accent-soft text-accent-text'
            )}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
          </span>
        )}
      </div>
      {loading ? (
        <div className="nn-skeleton h-8 w-20" />
      ) : (
        <p
          className={cx(
            'nn-mono text-display leading-none',
            f ? f.text : 'text-ink'
          )}
        >
          {value}
        </p>
      )}
      {caption && <p className="text-caption text-ink-3">{caption}</p>}
      {trend && (
        <p className={cx('text-caption font-medium', trend.tone === 'up' ? 'text-pass-text' : 'text-ink-2')}>
          {trend.label}
        </p>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                      */
/* -------------------------------------------------------------------------- */

const VERDICT_META = {
  pass: { label: 'Compliant', family: 'pass', Icon: CheckCircle },
  fail: { label: 'Violation', family: 'violation', Icon: XCircle },
  not_assessed: { label: 'Not Assessed', family: 'na', Icon: HelpCircle },
  compliant: { label: 'Compliant', family: 'pass', Icon: CheckCircle },
  violation: { label: 'Violation', family: 'violation', Icon: XCircle },
  out_of_scope: { label: 'Out of Scope', family: 'na', Icon: Clock },
  review: { label: 'Not Assessed', family: 'na', Icon: HelpCircle },
  pending: { label: 'Not Assessed', family: 'na', Icon: HelpCircle },
  approved: { label: 'Compliant', family: 'pass', Icon: CheckCircle },
  rejected: { label: 'Violation', family: 'violation', Icon: XCircle },
  draft: { label: 'In Progress', family: 'review', Icon: Clock },
}

/**
 * VerdictBadge. Icon, word and colour together, always - 08 SS2.4. There is no
 * prop to turn the icon or the label off, because the moment there is one, some
 * dense table will use it and the status becomes colour-only.
 */
export function VerdictBadge({ verdict, size = 'md', className }) {
  const meta = VERDICT_META[verdict] ?? {
    label: String(verdict ?? 'Unknown'),
    family: 'na',
    Icon: HelpCircle,
  }
  const f = FAMILY[meta.family]
  const { Icon } = meta
  return (
    <span
      className={cx(
        'nn-badge',
        f.fill,
        f.border,
        f.text,
        size === 'lg' && 'px-3 py-1 text-small',
        className
      )}
    >
      <Icon size={size === 'lg' ? 16 : 14} strokeWidth={2} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

export function SeverityBadge({ severity, className }) {
  const label = { critical: 'Critical', major: 'Major', minor: 'Minor', advisory: 'Advisory' }[
    severity
  ]
  if (!label) return null
  return (
    <span
      className={cx(
        'nn-mono rounded-sm border border-divider bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-ink-3',
        className
      )}
    >
      {label}
    </span>
  )
}

/**
 * ConfidenceBadge. Below the threshold it does not merely show a smaller number
 * - it says "low confidence" in words, because 0.42 means nothing to an officer
 * reading quickly, and a low-confidence extraction is exactly the case where
 * they must look at the crop themselves.
 */
export function ConfidenceBadge({ value, threshold = 0.75, className }) {
  if (value == null) return null
  const low = value < threshold
  const pct = Math.round(value * 100)
  return (
    <span
      className={cx(
        'nn-badge',
        low ? cx(FAMILY.review.fill, FAMILY.review.border, FAMILY.review.text) : 'bg-surface-2 border-divider text-ink-3',
        className
      )}
      title={low ? 'Below the confidence threshold — verify against the crop.' : 'Extraction confidence'}
    >
      {low && <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />}
      <span className="nn-mono">{pct}%</span>
      {low && <span>low confidence</span>}
    </span>
  )
}

/**
 * ReasonTag. Mandatory beside every not_assessed verdict. The engine refuses to
 * emit not_assessed without a reason; the interface refuses to render one
 * without showing it.
 */
export function ReasonTag({ reason, className }) {
  if (!reason) {
    if (DEV) throw new Error('ReasonTag: a not_assessed finding must carry a reason.')
    return null
  }
  return (
    <p
      className={cx(
        'flex gap-2 rounded-sm border border-na-border bg-na-fill px-3 py-2 text-caption text-na-text',
        className
      )}
    >
      <HelpCircle size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="nn-break">{reason}</span>
    </p>
  )
}

export function SyncBadge({ state = 'synced', className }) {
  const isSynced = state === 'synced' || state === 'Synced' || state === true
  const label = isSynced ? 'Synced' : 'Not Synced'
  const family = isSynced ? 'pass' : 'review'
  const Icon = isSynced ? CheckCircle : Clock
  const f = FAMILY[family]
  return (
    <span className={cx('nn-badge', f.fill, f.border, f.text, className)}>
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
      {label}
    </span>
  )
}

export function InspectionStatusBadge({ status = 'submitted', className }) {
  const isSubmitted =
    status === 'submitted' ||
    status === 'Submitted' ||
    status === 'complete' ||
    status === 'closed'
  const label = isSubmitted ? 'Submitted' : 'In Progress'
  const family = isSubmitted ? 'pass' : 'review'
  return <StatusBadge family={family} label={label} className={className} />
}

/** A record whose hash chain has been checked. Absence of this is not a claim. */
export function VerificationBadge({ verified, className }) {
  return (
    <span
      className={cx(
        'nn-badge',
        verified
          ? cx(FAMILY.pass.fill, FAMILY.pass.border, FAMILY.pass.text)
          : cx(FAMILY.na.fill, FAMILY.na.border, FAMILY.na.text),
        className
      )}
      title={
        verified
          ? 'The audit hash chain was verified for this record.'
          : 'Not yet verified. This is not an allegation of tampering.'
      }
    >
      <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />
      {verified ? 'Chain verified' : 'Unverified'}
    </span>
  )
}

/**
 * DemoChip. Rendered on any surface filled from fixtures. Without it, an
 * illustrative number is indistinguishable from an inspection record, which is
 * precisely the fabrication 08 SS4.1 prohibits.
 */
export function DemoChip({ className }) {
  return (
    <span
      className={cx('nn-badge border-info-border bg-info-fill text-info-text', className)}
      title="Illustrative fixture data — the backend was unreachable. Not an inspection record."
    >
      <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
      Demo data
    </span>
  )
}

export function Pill({ children, family, className, icon: Icon }) {
  const f = family ? FAMILY[family] : null
  return (
    <span
      className={cx(
        'nn-badge',
        f ? cx(f.fill, f.border, f.text) : 'border-divider bg-surface-2 text-ink-2',
        className
      )}
    >
      {Icon && <Icon size={14} strokeWidth={2} aria-hidden="true" />}
      {children}
    </span>
  )
}

/**
 * A small, leading-dot status pill for verdicts and lifecycle states. The dot
 * is non-decorative: a glance reads the family from the dot, the word from the
 * label, and the meaning is carried by both rather than by colour alone.
 *
 *     <StatusBadge family="pass"      label="Compliant" />
 *     <StatusBadge family="violation" label="Violation" />
 *     <StatusBadge family="review"    label="Pending"   />
 *     <StatusBadge family="na"        label="Inactive"  />
 */
export function StatusBadge({ family = 'na', label, className }) {
  const f = FAMILY[family] ?? FAMILY.na
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-caption font-medium',
        f.fill,
        f.text,
        'ring-1 ring-inset',
        f.border,
        className
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-pill"
        style={{ background: f.raw }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Field wraps label, control, hint and error into one unit so the association
 * is made by the component and cannot be forgotten at a call site. The error is
 * announced (`role="alert"`) and the control is marked `aria-invalid`; nothing
 * moves. 08 SS7 forbids a shake on an invalid field: an involuntary movement
 * next to a legal declaration reads as the system objecting, which is not what
 * a date format error means.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  optional = false,
  children,
  className,
  id: idProp,
}) {
  const auto = useId()
  const id = idProp ?? auto
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const described = cx(hint && hintId, error && errId) || undefined

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline gap-2 text-small font-medium text-ink">
        {label}
        {required && (
          <span className="text-violation-text" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only-nn">(required)</span>}
        {optional && <span className="text-caption font-normal text-ink-3">Optional</span>}
      </label>
      {typeof children === 'function'
        ? children({ id, 'aria-describedby': described, 'aria-invalid': error ? 'true' : undefined, required })
        : children}
      {hint && !error && (
        <p id={hintId} className="text-caption text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="flex items-center gap-1.5 text-caption text-violation-text">
          <AlertTriangle size={13} strokeWidth={2} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}

export const Input = forwardRef(function Input({ className, icon: Icon, ...rest }, ref) {
  if (!Icon) return <input ref={ref} className={cx('nn-field', className)} {...rest} />
  return (
    <div className="relative">
      <Icon
        size={18}
        strokeWidth={1.8}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
      />
      <input ref={ref} className={cx('nn-field pl-10', className)} {...rest} />
    </div>
  )
})

export const Textarea = forwardRef(function Textarea({ className, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cx('nn-field resize-y', className)} {...rest} />
})

/** Native select, restyled. A custom listbox here would buy nothing and cost keyboard behaviour. */
export const Select = forwardRef(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cx('nn-field appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown
        size={18}
        strokeWidth={1.8}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"
      />
    </div>
  )
})

export function Checkbox({ label, hint, className, id: idProp, ...rest }) {
  const auto = useId()
  const id = idProp ?? auto
  return (
    <div className={cx('flex min-h-touch items-start gap-3 py-1.5', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-[4px] border border-control bg-surface accent-[var(--nn-accent)]"
        {...rest}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-small text-ink">
          {label}
        </label>
        {hint && <p className="text-caption text-ink-3">{hint}</p>}
      </div>
    </div>
  )
}

/**
 * A segmented choice, used where a select would hide the options that matter -
 * transaction type, for instance, where three of the four values end the
 * inspection and the officer needs to see that before choosing.
 */
export function RadioCards({ name, value, onChange, options, columns = 1, className }) {
  return (
    <div
      role="radiogroup"
      className={cx('grid gap-2', columns === 2 && 'sm:grid-cols-2', className)}
    >
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex min-h-touch items-start gap-3 rounded-sm border p-3 text-left',
              'transition-colors duration-fast ease-settle',
              active
                ? 'border-accent bg-accent-soft'
                : 'border-control bg-surface hover:bg-surface-2'
            )}
          >
            <span
              className={cx(
                'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-pill border',
                active ? 'border-accent bg-accent' : 'border-control'
              )}
            >
              {active && (
                <Check size={12} strokeWidth={3} className="text-accent-on" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-small font-medium text-ink">{o.label}</span>
              {o.hint && <span className="mt-0.5 block text-caption text-ink-3">{o.hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Callout                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A system message. `AlertTriangle` appears here and only here - it is reserved
 * for a warning about the system, never for a finding about a package (08 SS2.4).
 */
export function Callout({ family = 'info', title, children, icon: IconProp, className, actions }) {
  const f = FAMILY[family]
  const Icon = IconProp ?? (family === 'review' || family === 'violation' ? AlertTriangle : f.Icon)
  return (
    <div className={cx('rounded-card border p-4', f.fill, f.border, className)}>
      <div className="flex gap-3">
        <Icon size={18} strokeWidth={1.8} className={cx('mt-0.5 shrink-0', f.graphic)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          {title && <p className={cx('text-small font-semibold', f.text)}>{title}</p>}
          <div className={cx('max-w-prose text-small', f.text, title && 'mt-1')}>{children}</div>
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Table                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Hover only, no zebra striping - 08 SS3.4. Striping on a table whose rows
 * carry tinted verdict backgrounds fights the one thing the colour is for.
 */
export function Table({ children, className, caption }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-small">
        {caption && <caption className="sr-only-nn">{caption}</caption>}
        {children}
      </table>
    </div>
  )
}

export function Th({ children, className, align = 'left', ...rest }) {
  return (
    <th
      scope="col"
      className={cx(
        'nn-eyebrow whitespace-nowrap border-b border-divider bg-surface-2 px-4 py-3',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
      {...rest}
    >
      {children}
    </th>
  )
}

export function Td({ children, className, align = 'left', ...rest }) {
  return (
    <td
      className={cx(
        'border-b border-divider px-4 py-3 align-middle text-ink-2',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
      {...rest}
    >
      {children}
    </td>
  )
}

export function Tr({ children, className, onClick, ...rest }) {
  return (
    <tr
      className={cx(
        'transition-colors duration-fast ease-settle hover:bg-surface-2',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      {...rest}
    >
      {children}
    </tr>
  )
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                       */
/* -------------------------------------------------------------------------- */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Focus is trapped while open and restored to the trigger on close. Escape
 * closes. The backdrop click closes only when `dismissible` - a dialog that
 * takes a written override reason must not be dismissable by a stray click,
 * because the reason is part of the record.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
}) {
  const panelRef = useRef(null)
  const restoreRef = useRef(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const first = panelRef.current?.querySelector(FOCUSABLE)
    ;(first ?? panelRef.current)?.focus()

    function onKey(e) {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = Array.from(panelRef.current?.querySelectorAll(FOCUSABLE) ?? [])
      if (nodes.length === 0) return
      const firstNode = nodes[0]
      const lastNode = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === firstNode) {
        e.preventDefault()
        lastNode.focus()
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault()
        firstNode.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      /* Restoring focus matters more than it looks: without it a keyboard user
         who closes a dialog is returned to the top of the document and has to
         tab back through the whole page to where they were. */
      if (restoreRef.current instanceof HTMLElement) restoreRef.current.focus()
    }
  }, [open, onClose, dismissible])

  if (!open) return null
  const width = { sm: 'max-w-[420px]', md: 'max-w-[560px]', lg: 'max-w-[760px]' }[size]

  return (
    <div className="fixed inset-0 z-overlay grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-[rgba(6,12,22,0.55)] backdrop-blur-[2px]"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          'relative w-full animate-fade-rise rounded-hero border border-divider bg-surface shadow-modal',
          width
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-divider p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-h2 text-ink">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 max-w-prose text-small text-ink-2">
                {description}
              </p>
            )}
          </div>
          {dismissible && <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2 -mt-2" />}
        </div>
        <div className="max-h-[min(60vh,520px)] overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-divider bg-surface-2 p-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* EmptyState, Skeleton, Spinner                                               */
/* -------------------------------------------------------------------------- */

/**
 * 08 SS8. Two things this deliberately does not do: it does not use
 * `AlertTriangle` for an empty list, and where the emptiness is *good news*
 * ("no violations today") it uses a neutral `CheckCircle` rather than a
 * celebration. An inspector's empty violation list is not an achievement to
 * congratulate; it is a fact to state.
 */
export function EmptyState({ icon: Icon = Info, title, body, action, family = 'na', className }) {
  const f = FAMILY[family]
  return (
    <div className={cx('grid place-items-center px-6 py-14 text-center', className)}>
      <span className={cx('grid h-14 w-14 place-items-center rounded-pill', f.fill, f.graphic)}>
        <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <p className="mt-4 text-h2 text-ink">{title}</p>
      {body && <p className="mt-2 max-w-prose text-small text-ink-2">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className, lines }) {
  if (lines) {
    return (
      <div className={cx('flex flex-col gap-2', className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="nn-skeleton h-4"
            style={{ width: `${100 - i * 12}%` }}
          />
        ))}
      </div>
    )
  }
  return <div className={cx('nn-skeleton', className)} />
}

export function Spinner({ size = 20, label = 'Loading', className }) {
  return (
    <span role="status" className={cx('inline-flex items-center gap-2', className)}>
      <Loader2 size={size} strokeWidth={1.8} className="animate-spin text-ink-3" aria-hidden="true" />
      <span className="sr-only-nn">{label}</span>
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx('flex gap-1 border-b border-divider', className)} role="tablist">
      {tabs.map((t) => {
        const active = value === t.id
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cx(
              'relative min-h-touch px-4 text-small font-semibold',
              'transition-colors duration-fast ease-settle',
              active ? 'text-accent-text' : 'text-ink-3 hover:text-ink-2'
            )}
          >
            {t.label}
            {t.count != null && (
              <span className="nn-mono ml-2 text-caption text-ink-3">{t.count}</span>
            )}
            {active && (
              <span
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-pill bg-accent"
                aria-hidden="true"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Toast                                                                       */
/* -------------------------------------------------------------------------- */

const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])

  const dismiss = useCallback((id) => {
    setItems((xs) => xs.filter((x) => x.id !== id))
  }, [])

  const push = useCallback(
    (toast) => {
      const id = Math.random().toString(36).slice(2)
      const item = { id, family: 'info', ...toast }
      setItems((xs) => [...xs, item])
      /* Errors do not auto-dismiss. A message an officer needed to read and
         missed is worse than one that stays until dismissed. */
      if (item.family !== 'violation') {
        setTimeout(() => dismiss(id), item.duration ?? 5000)
      }
      return id
    },
    [dismiss]
  )

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-toast flex w-[min(380px,calc(100vw-32px))] flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((t) => {
          const f = FAMILY[t.family] ?? FAMILY.info
          const Icon = t.family === 'violation' ? AlertTriangle : f.Icon
          return (
            <div
              key={t.id}
              className={cx(
                'pointer-events-auto flex animate-fade-rise items-start gap-3 rounded-card border p-4 shadow-modal',
                f.fill,
                f.border
              )}
            >
              <Icon size={18} strokeWidth={1.8} className={cx('mt-0.5 shrink-0', f.graphic)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {t.title && <p className={cx('text-small font-semibold', f.text)}>{t.title}</p>}
                {t.body && <p className={cx('text-caption', f.text)}>{t.body}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className={cx('shrink-0 rounded-sm p-1', f.text)}
              >
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

