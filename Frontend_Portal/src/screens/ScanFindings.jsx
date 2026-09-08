/**
 * Findings review — the screen the rest of the product exists to produce.
 *
 * Six decisions, all of them load-bearing:
 *
 * 1. All nineteen rows render, always. A check that did not arise is a row that
 *    says so, not an absent row. An officer scrolling a list of twelve findings
 *    has no way to know whether the other six passed, were unreachable, or were
 *    never run — so the list is never short.
 *
 * 2. The rows are grouped into the four reading phases (scope, presence,
 *    content, metrology) and registration order is preserved inside each group.
 *    The derived Section 36 tier sits outside the groups because it sits outside
 *    the denominator: eighteen assessable checks, nineteen finding rows.
 *
 * 3. `not_assessed` carries the same visual weight as pass and violation, and
 *    its reason is always on screen. ReasonTag throws in development if a
 *    not-assessed finding arrives without one, so the rule cannot rot.
 *
 * 4. A filter never hides anything silently. Whenever one is active the header
 *    states how many rows it is hiding and offers to clear it.
 *
 * 5. An override needs a written reason in *either* direction. Restoring the
 *    engine's verdict is itself an override and is recorded the same way. The
 *    engine verdict is never replaced on screen — where a human disagreed, both
 *    verdicts are shown, which is what makes the disagreement defensible.
 *
 * 6. Where the engine's own counts and the counts derived from the rows
 *    disagree, the screen says so instead of picking a winner. That mismatch
 *    means the interface and the engine are counting different things, and
 *    quietly trusting either one is how a wrong denominator reaches a file.
 *
 * Contract gap, flagged rather than papered over: `FindingOut` (Backend/
 * schemas.py) exposes no `id`, but the override endpoint is
 * `PATCH /admin/findings/{finding_id}`. So the only screen that displays
 * findings cannot address the endpoint that edits them. The control below is
 * wired to `finding.id ?? finding.finding_id` and states plainly why it is
 * unavailable when neither is present; it starts working the moment the field
 * appears. Nothing here invents an id.
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronDown,
  Filter,
  HelpCircle,
  Info,
  Ruler,
  Scale,
  XCircle,
} from 'lucide-react'
import { endpoints } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import {
  CHECKS,
  DERIVED_CHECK,
  PHASE_GROUPS,
  denominatorLabel,
  inRegistrationOrder,
  isOverridden,
  tallyFindings,
  verdictOf,
} from '../lib/checks'
import { useDocumentTitle, useLocalPref, useMutation, useResource } from '../lib/hooks'
import { scanViolation, scansById } from '../mock/fixtures'
import {
  Button,
  Callout,
  Card,
  ConfidenceBadge,
  DemoChip,
  Eyebrow,
  FAMILY,
  Field,
  MetaStat,
  Modal,
  Pill,
  RadioCards,
  ReasonTag,
  SectionTitle,
  SeverityBadge,
  Skeleton,
  Tabs,
  Textarea,
  VerdictBadge,
  cx,
  useToast,
} from '../ui'
import { CheckRibbon, ResultSeal, UncertaintyBar } from '../ui/signature'

/* --------------------------------------------------------------- utilities -- */

function when(iso) {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'd MMM yyyy, HH:mm')
  } catch {
    return String(iso)
  }
}

/**
 * The engine writes its measurements into prose: "1.12 mm measured character
 * height (± 0.14 mm)" against "1.50 mm minimum for a panel of 78 cm²". The
 * UncertaintyBar needs numbers, so this reads them back out.
 *
 * Two rules keep that safe. Structured fields win whenever the payload grows
 * them, so this parser is a bridge and not a permanent dependency. And when
 * anything is missing — no unit, mismatched units, no threshold — it returns
 * null and the bar simply does not render. A measurement bar is a claim about
 * evidence; an approximated one would be worse than none.
 */
const NUM_UNIT = /(-?\d+(?:[.,]\d+)?)\s*(mm|cm|m|ml|l|kg|g|%)\b/i
const TOLERANCE = /(?:±|\+\/-|\+-)\s*(\d+(?:[.,]\d+)?)/

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number.parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function measurementFor(finding, check) {
  if (!check?.measured) return null

  /* Preferred path: the backend states the numbers itself. */
  const structured = num(finding.observed_value)
  const structuredThreshold = num(finding.threshold ?? finding.required_value)
  if (structured != null && structuredThreshold != null) {
    return {
      value: structured,
      uncertainty: num(finding.uncertainty) ?? 0,
      threshold: structuredThreshold,
      unit: finding.unit ?? 'mm',
      derivedFromText: false,
    }
  }

  const o = typeof finding.observed === 'string' ? finding.observed : ''
  const r = typeof finding.required === 'string' ? finding.required : ''
  const om = o.match(NUM_UNIT)
  const rm = r.match(NUM_UNIT)
  if (!om || !rm) return null
  if (om[2].toLowerCase() !== rm[2].toLowerCase()) return null

  const value = num(om[1])
  const threshold = num(rm[1])
  if (value == null || threshold == null) return null

  const tol = o.match(TOLERANCE)
  return {
    value,
    uncertainty: tol ? (num(tol[1]) ?? 0) : 0,
    threshold,
    unit: om[2].toLowerCase(),
    derivedFromText: true,
  }
}

const FILTERS = {
  all: () => true,
  fail: (v) => v === 'fail',
  not_assessed: (v) => v === 'not_assessed',
  pass: (v) => v === 'pass',
}

function findingId(finding) {
  return finding?.id ?? finding?.finding_id ?? null
}

/* ------------------------------------------------------------- finding row -- */

const FAMILY_OF = { pass: 'pass', fail: 'violation', not_assessed: 'na' }

function FindingRow({ finding, expanded, onToggle, canOverride, overrideBlocked, onOverride }) {
  const { t } = useI18n()
  const check = CHECKS[finding.check_id]
  const verdict = verdictOf(finding)
  const family = FAMILY_OF[verdict] ?? 'na'
  const f = FAMILY[family]
  const overridden = isOverridden(finding)
  const measurement = measurementFor(finding, check)

  return (
    <li id={`check-${finding.check_id}`} className="scroll-mt-24">
      <div className={cx('overflow-hidden rounded-card border bg-surface', f.border)}>
      <div className="flex">
        {/* The verdict edge. Colour is the third channel here, after the word
            and the icon in the badge — never the only one. */}
        <span aria-hidden="true" className={cx('w-1 shrink-0', f.fill)} style={{ background: f.raw }} />

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-h-touch w-full items-start gap-3 px-4 py-3.5 text-left transition-colors duration-fast ease-settle hover:bg-surface-2"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="nn-mono text-caption font-bold tracking-wider text-ink-3">
                {finding.check_id}
              </span>
              <VerdictBadge verdict={verdict} />
              {overridden && (
                <Pill family="review" icon={HelpCircle}>
                  {t('verdict.overridden')}
                </Pill>
              )}
              <SeverityBadge severity={finding.severity ?? check?.severity} />
              {check?.advisoryOnly && <Pill>Not a Legal Metrology finding</Pill>}
              {check?.listingOnly && <Pill>Listing only</Pill>}
              <ConfidenceBadge value={finding.confidence} threshold={0.6} />
            </span>
            <span className="mt-1.5 block text-small font-medium text-ink">
              {finding.title ?? check?.title}
            </span>
          </span>
          <ChevronDown
            size={18}
            strokeWidth={2}
            aria-hidden="true"
            className={cx(
              'mt-1 shrink-0 text-ink-3 transition-transform duration-base ease-settle',
              expanded && 'rotate-180'
            )}
          />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-divider px-4 py-4 pl-5">
          <div className="flex flex-col gap-4">
            {verdict === 'not_assessed' && (
              <div>
                <Eyebrow className="mb-1.5">{t('checks.notAssessedReason')}</Eyebrow>
                <ReasonTag reason={finding.reason} />
              </div>
            )}

            {(finding.observed || finding.required) && (
              <dl className="grid gap-3 sm:grid-cols-2">
                {finding.observed && (
                  <div>
                    <dt className="nn-eyebrow">{t('checks.observed')}</dt>
                    <dd className="nn-break mt-1 text-small text-ink">{finding.observed}</dd>
                  </div>
                )}
                {finding.required && (
                  <div>
                    <dt className="nn-eyebrow">{t('checks.required')}</dt>
                    <dd className="nn-break mt-1 text-small text-ink">{finding.required}</dd>
                  </div>
                )}
              </dl>
            )}

            {measurement && (
              <div className="rounded-card border border-divider bg-surface-2 p-4">
                <UncertaintyBar
                  value={measurement.value}
                  uncertainty={measurement.uncertainty}
                  threshold={measurement.threshold}
                  unit={measurement.unit}
                  verdict={verdict}
                  label="Measured against the requirement"
                />
                {measurement.derivedFromText && (
                  <p className="mt-2 text-caption text-ink-3">
                    Plotted from the values stated above.
                  </p>
                )}
              </div>
            )}

            {/* Both verdicts, side by side. The engine's is never overwritten on
                screen: an override that hides what it overrode is not a record. */}
            {overridden && (
              <div className="rounded-card border border-review-border bg-review-fill p-4">
                <Eyebrow className="text-review-text">Officer override</Eyebrow>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-caption text-review-text">
                    {t('findings.engineSaid', { verdict: t(`verdict.${finding.engine_verdict}`) })}
                  </span>
                  <span aria-hidden="true" className="text-review-text">
                    →
                  </span>
                  <VerdictBadge verdict={finding.human_verdict} />
                </div>
                {finding.override_reason && (
                  <p className="nn-break mt-2 text-small text-review-text">
                    “{finding.override_reason}”
                  </p>
                )}
                {finding.overridden_at && (
                  <p className="nn-mono mt-1.5 text-caption text-ink-3">
                    {when(finding.overridden_at)}
                  </p>
                )}
              </div>
            )}

            {check?.help && (
              <div>
                <Eyebrow className="mb-1">What this check requires</Eyebrow>
                <p className="max-w-prose text-small text-ink-2">{check.help}</p>
              </div>
            )}

            <div className="flex flex-wrap items-start justify-between gap-4 border-t border-divider pt-3">
              <p className="flex min-w-0 items-start gap-2 text-caption text-ink-2">
                <Scale size={14} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
                <span className="nn-break">
                  {finding.citation ?? check?.citation}
                  {(finding.ledger_ref || check?.unverified) && (
                    <span className="ml-2 inline-flex">
                      <Pill family="review">
                        {t('checks.unverified')} · {finding.ledger_ref ?? check.unverified}
                      </Pill>
                    </span>
                  )}
                </span>
              </p>

              {canOverride ? (
                <Button size="sm" variant="secondary" onClick={() => onOverride(finding)}>
                  {overridden ? t('findings.restore') : t('findings.override')}
                </Button>
              ) : overrideBlocked ? (
                <Button size="sm" variant="secondary" disabled disabledReason={overrideBlocked}>
                  {t('findings.override')}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      )}
      </div>
    </li>
  )
}

/* ------------------------------------------------------------ derived tier -- */

const ACTION_LABEL = {
  improvement_notice: 'Improvement notice',
  prosecution: 'Prosecution',
  compounding: 'Compounding',
  human_review: 'Human review',
  review: 'Human review',
  none: 'No action arises',
}

/**
 * CHK18, on its own, below the eighteen. It is computed from the other findings
 * once the whole picture is visible, so it is shown last, styled as a summary
 * rather than a check, and labelled as excluded from the denominator — which is
 * the only thing that stops "18" looking like an off-by-one against 19 rows.
 */
function DerivedTier({ finding, scan }) {
  const { t } = useI18n()
  const check = CHECKS[DERIVED_CHECK]
  const verdict = verdictOf(finding)

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>Derived — outside the denominator</Eyebrow>
          <h2 className="mt-1 text-h2 text-ink">{check.title}</h2>
        </div>
        <VerdictBadge verdict={verdict} size="lg" />
      </div>

      <p className="mt-3 max-w-prose text-small text-ink-2">{t('checks.tierExcluded')}</p>

      {finding?.observed && (
        <p className="nn-break mt-3 max-w-prose text-small text-ink">{finding.observed}</p>
      )}
      {verdict === 'not_assessed' && <ReasonTag reason={finding?.reason} className="mt-3" />}

      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
        <MetaStat
          label="Limb"
          value={scan?.violation_limb ?? '—'}
          title="Which limb of Section 36 the contraventions fall under."
        />
        <MetaStat
          label="Recommended response"
          value={
            scan?.recommended_action
              ? (ACTION_LABEL[scan.recommended_action] ?? scan.recommended_action)
              : '—'
          }
        />
      </div>

      <p className="mt-4 flex items-start gap-2 text-caption text-ink-2">
        <Scale size={14} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
        <span className="nn-break">
          {finding?.citation ?? check.citation}
          <span className="ml-2 inline-flex">
            <Pill family="review">
              {t('checks.unverified')} · {check.unverified}
            </Pill>
          </span>
        </span>
      </p>

      <p className="mt-3 max-w-prose text-caption text-ink-3">
        A recommendation, not a decision. The action taken is the officer&apos;s, on the
        record, and this line does not substitute for it.
      </p>
    </Card>
  )
}

/* ---------------------------------------------------------------- evidence -- */

function EvidencePanel({ images = [], scan }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Evidence</Eyebrow>
          <h2 className="mt-1 text-h2 text-ink">
            {images.length === 0
              ? 'No panels captured'
              : images.length === 1
                ? 'One panel captured'
                : `${images.length} panels captured`}
          </h2>
        </div>
        <Camera size={20} strokeWidth={1.8} aria-hidden="true" className="mt-1 shrink-0 text-ink-3" />
      </div>

      {images.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {images.map((img) => (
            <li key={img.id} className="rounded-card border border-divider bg-surface-2 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <span className="text-small font-semibold capitalize text-ink">{img.panel}</span>
                <span className="nn-mono text-caption text-ink-3">
                  {img.width_px}×{img.height_px}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Pill family={img.rectified ? 'pass' : 'na'}>
                  {img.rectified ? 'Rectified' : 'Not rectified'}
                </Pill>
                {img.residual_tilt_deg != null && (
                  <Pill family={img.residual_tilt_deg > 3 ? 'review' : undefined}>
                    tilt {img.residual_tilt_deg.toFixed(1)}°
                  </Pill>
                )}
                {img.blur_variance != null && (
                  <Pill family={img.blur_variance < 100 ? 'review' : undefined}>
                    sharpness {Math.round(img.blur_variance)}
                  </Pill>
                )}
              </div>
              <p className="nn-mono nn-break mt-2 text-[11px] text-ink-3">sha256 {img.sha256}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="nn-rule-line my-4" />
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <MetaStat
          label="Scale"
          value={
            scan?.mm_per_pixel != null ? `${scan.mm_per_pixel.toFixed(4)} mm/px` : 'not resolved'
          }
          title="Millimetres per pixel. Without this the height checks cannot be measured."
        />
        <MetaStat label="Scale source" value={scan?.scale_source ?? 'none'} />
      </div>
      {scan?.mm_per_pixel == null && (
        <p className="mt-3 max-w-prose text-caption text-na-text">
          No scale was resolved, which is why the measured checks report as not assessed
          rather than as passes. A reference card or coin in the frame settles them.
        </p>
      )}

      {/* Metadata only, and deliberately so: ScanImageOut carries a hash, the
          geometry and the rectification diagnostics, but no URL or path. The
          crops are not served back through the API, so nothing here pretends a
          thumbnail is one click away. */}
      <p className="mt-3 max-w-prose text-caption text-ink-3">
        The portal records each panel&apos;s hash and geometry. The images themselves are
        not served back through the API.
      </p>
    </Card>
  )
}

/* ------------------------------------------------------------------ counts -- */

function CountTile({ label, value, family, icon: Icon, caption }) {
  const f = family ? FAMILY[family] : null
  return (
    <div
      className={cx(
        'rounded-card border p-3.5',
        f ? cx(f.fill, f.border) : 'border-divider bg-surface-2'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Eyebrow className={f ? f.text : undefined}>{label}</Eyebrow>
        {Icon && (
          <Icon
            size={14}
            strokeWidth={1.8}
            aria-hidden="true"
            className={cx('mt-0.5 shrink-0', f ? f.graphic : 'text-ink-3')}
          />
        )}
      </div>
      <p className={cx('nn-mono mt-1.5 text-h1 leading-none', f ? f.text : 'text-ink')}>{value}</p>
      {caption && <p className={cx('mt-1 text-caption', f ? f.text : 'text-ink-3')}>{caption}</p>}
    </div>
  )
}

/* -------------------------------------------------------- override dialog --- */

const MIN_REASON = 10
const MAX_REASON = 1000

/**
 * Not dismissible by a backdrop click, and it cannot be saved without a written
 * reason of at least ten characters — the same floor the server enforces on
 * OverrideFindingRequest. The reason is part of the record, so a stray click
 * must not be able to discard a half-typed one, and an empty one must not be
 * able to reach the audit trail.
 */
function OverrideDialog({ finding, onClose, onSubmit, pending, error }) {
  const { t } = useI18n()
  const check = CHECKS[finding.check_id]
  const current = verdictOf(finding)
  const engine = finding.engine_verdict

  const [verdict, setVerdict] = useState(null)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  const options = ['pass', 'fail', 'not_assessed']
    .filter((v) => v !== current)
    .map((v) => ({
      value: v,
      label: t(`verdict.${v}`),
      hint:
        v === engine
          ? 'Restores the verdict the engine reached. Still recorded as an override.'
          : v === 'not_assessed'
            ? 'Records that this evidence does not settle the check either way.'
            : v === 'fail'
              ? 'Records a contravention the engine did not find.'
              : 'Records that the requirement is met after all.',
    }))

  const short = reason.trim().length < MIN_REASON
  const blocked = !verdict || short
  const reasonError =
    touched && short
      ? `At least ${MIN_REASON} characters. This sentence is written into the audit trail under your name.`
      : (error?.fields?.override_reason ?? null)

  const submit = (e) => {
    e.preventDefault()
    setTouched(true)
    if (blocked) return
    onSubmit({ human_verdict: verdict, override_reason: reason.trim() })
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={false}
      size="md"
      title={t('findings.override')}
      description={`${finding.check_id} — ${finding.title ?? check?.title}`}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={pending}
            disabledReason="The override is being saved."
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={pending}
            disabled={blocked}
            disabledReason={
              blocked
                ? !verdict
                  ? 'Choose the verdict you are recording.'
                  : `Write at least ${MIN_REASON} characters explaining why.`
                : undefined
            }
          >
            {pending ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <div className="rounded-card border border-divider bg-surface-2 p-3.5">
          <Eyebrow>Currently reading as</Eyebrow>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={current} />
            {current !== engine && (
              <span className="text-caption text-ink-2">
                {t('findings.engineSaid', { verdict: t(`verdict.${engine}`) })}
              </span>
            )}
          </div>
        </div>

        {error && !error.fields && (
          <Callout family="violation" title="Could not record the override">
            {error.message}
          </Callout>
        )}

        <div>
          <Eyebrow className="mb-2">Record instead</Eyebrow>
          <RadioCards
            name="human_verdict"
            value={verdict}
            onChange={setVerdict}
            options={options}
          />
        </div>

        <Field
          label={t('findings.overrideReason')}
          hint={t('findings.overrideReasonHint')}
          error={reasonError}
          required
        >
          {(props) => (
            <>
              <Textarea
                {...props}
                name="override_reason"
                rows={4}
                maxLength={MAX_REASON}
                value={reason}
                onBlur={() => setTouched(true)}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What you looked at, and what it showed."
              />
              <p className="nn-mono mt-1 text-right text-caption text-ink-3">
                {reason.trim().length}/{MAX_REASON}
              </p>
            </>
          )}
        </Field>

        <p className="max-w-prose text-caption text-ink-3">
          The engine&apos;s verdict is kept alongside yours, never replaced, and the change is
          written to the audit trail with your name and the time.
        </p>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------ findings table -- */

/**
 * The flat findings table that judges and reviewers read first.
 *
 * Four columns and four promises:
 *
 *  1. One row per check, in the order the Rules apply them — the same
 *     `REGISTRATION_ORDER` the engine uses. Section 36 is included because
 *     the table is about the verdict, and the verdict depends on it.
 *
 *  2. The Result column carries the canonical word in capitals: PASS, FAIL,
 *     NOT ASSESSED. A pill colour, an icon, and a strong left bar sit beside
 *     the word, so a reader who only sees the colour still gets the answer
 *     from the icon and the text. "Good" / "Bad" never appear, because the
 *     Rules do not recognise them and neither should the screen.
 *
 *  3. The Evidence column is a "View" link that jumps to the matching row
 *     below, where the per-check evidence and the override controls already
 *     live. A column that says "View image" when the image is not served
 *     would be the worst kind of disabled affordance, so it names what the
 *     link leads to: a per-check evidence block, with the image count
 *     when the engine reported it.
 *
 *  4. The Rule column is the catalog's own citation, copied verbatim and
 *     shortened for fit. Pinpoint sub-rules are kept where the catalog
 *     gives them (Rule 6(1)(e) on MRP, for example) and the broader
 *     provision is used where it does not.
 *
 * Filter tabs (all / fail / not_assessed / pass) live above the existing
 * grouped view, not above this table — the table is the answer, the tabs
 * are the workbench.
 */
const RESULT_TEXT = {
  pass: { word: 'PASS', family: 'pass', icon: CheckCircle2 },
  fail: { word: 'FAIL', family: 'violation', icon: XCircle },
  not_assessed: { word: 'NOT ASSESSED', family: 'na', icon: HelpCircle },
}

function FindingsTable({ rows, scan }) {
  const { t } = useI18n()
  const imageCount = Array.isArray(scan?.images) ? scan.images.length : 0

  return (
    <Card className="p-0">
      <div className="border-b border-divider px-5 py-4">
        <p className="nn-eyebrow">{t('findings.table.title')}</p>
        <p className="mt-1 max-w-prose text-caption text-ink-2">
          {t('findings.table.caption')}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-small">
          <thead>
            <tr className="text-caption uppercase tracking-wide text-ink-3">
              <th scope="col" className="w-[34%] py-2.5 pl-5 pr-3 font-semibold">
                {t('findings.table.colCheck')}
              </th>
              <th scope="col" className="w-[18%] py-2.5 pr-3 font-semibold">
                {t('findings.table.colResult')}
              </th>
              <th scope="col" className="w-[16%] py-2.5 pr-3 font-semibold">
                {t('findings.table.colEvidence')}
              </th>
              <th scope="col" className="w-[32%] py-2.5 pr-5 font-semibold">
                {t('findings.table.colRule')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const v = verdictOf(f) ?? 'not_assessed'
              const r = RESULT_TEXT[v] ?? RESULT_TEXT.not_assessed
              const Icon = r.icon
              const overridden = isOverridden(f)
              const rule = CHECKS[f.check_id]?.citation ?? '—'
              const href = `#check-${f.check_id}`
              return (
                <tr
                  key={f.check_id}
                  className={cx(
                    'border-t border-divider align-top transition-colors duration-fast ease-settle',
                    'hover:bg-surface-2'
                  )}
                >
                  <td className="py-3 pl-5 pr-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-ink">
                        {CHECKS[f.check_id]?.title ?? f.title ?? f.check_id}
                      </span>
                      <span className="nn-mono text-[11px] uppercase tracking-wider text-ink-3">
                        {f.check_id}
                        {overridden && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-pill border border-review-border bg-review-fill px-1.5 py-0.5 text-[10px] font-semibold text-review-text">
                            {t('verdict.overridden')}
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <span
                      className={cx(
                        'inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
                        r.family === 'pass' && 'border-pass-border bg-pass-fill text-pass-text',
                        r.family === 'violation' && 'border-violation-border bg-violation-fill text-violation-text',
                        r.family === 'na' && 'border-divider bg-surface-2 text-ink-2'
                      )}
                    >
                      <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
                      {r.word}
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    {imageCount === 0 ? (
                      <span className="text-caption text-ink-3">
                        {t('findings.table.noEvidence')}
                      </span>
                    ) : (
                      <a
                        href={href}
                        title={t('findings.table.viewHint')}
                        className="inline-flex items-center gap-1 font-semibold text-accent-text underline decoration-dotted underline-offset-2"
                      >
                        <Camera size={13} strokeWidth={1.9} aria-hidden="true" />
                        {t('findings.table.view')}
                      </a>
                    )}
                  </td>
                  <td className="py-3 pr-5 text-ink-2">{rule}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------- page -- */

export default function ScanFindings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const { t } = useI18n()
  const { push } = useToast()

  const [filter, setFilter] = useLocalPref('findings.filter', 'all')
  const [openIds, setOpenIds] = useState(null)
  const [target, setTarget] = useState(null)

  const {
    data: scan,
    error,
    loading,
    demo,
    reload,
  } = useResource(() => endpoints.scans.get(id), {
    deps: [id],
    fallback: scansById[id] ?? scanViolation,
    label: `scan-${id}`,
  })

  const save = useMutation((fid, body) => endpoints.admin.updateFinding(fid, body))

  useDocumentTitle(scan ? `Scan ${scan.id}` : 'Scan')

  const findings = useMemo(() => inRegistrationOrder(scan?.findings ?? []), [scan])
  const byCheck = useMemo(() => new Map(findings.map((f) => [f.check_id, f])), [findings])
  const assessable = useMemo(
    () => findings.filter((f) => f.check_id !== DERIVED_CHECK),
    [findings]
  )
  const tally = useMemo(() => tallyFindings(findings), [findings])
  const autoOpen = useMemo(
    () =>
      new Set(
        assessable.filter((f) => verdictOf(f) === 'fail').map((f) => f.check_id)
      ),
    [assessable]
  )
  const expanded = openIds ?? autoOpen

  const toggle = (checkId) => {
    const next = new Set(expanded)
    if (next.has(checkId)) next.delete(checkId)
    else next.add(checkId)
    setOpenIds(next)
  }

  if (loading && !scan) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton lines={6} />
      </div>
    )
  }

  if (error || !scan) {
    return (
      <Callout
        family="violation"
        title={error?.status === 404 ? t('common.notFound') : t('common.errorTitle')}
        actions={
          <>
            <Button size="sm" onClick={reload}>
              {t('common.retry')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>
              {t('common.back')}
            </Button>
          </>
        }
      >
        {error?.status === 404
          ? 'No scan with this reference. It may have been recorded on another device and not yet synced.'
          : (error?.message ?? 'The scan could not be loaded.')}
      </Callout>
    )
  }

  const base = isAdmin ? '/admin' : '/inspector'
  const derived = byCheck.get(DERIVED_CHECK)
  const api = scan.counts
  const countsDisagree =
    api != null &&
    (api.passed !== tally.passed ||
      api.failed !== tally.failed ||
      api.not_assessed !== tally.not_assessed)
  const assessedDisagrees =
    scan.checks_assessed != null && scan.checks_assessed !== tally.assessed

  const predicate = FILTERS[filter] ?? FILTERS.all
  const visible = assessable.filter((f) => predicate(verdictOf(f)))
  const hidden = assessable.length - visible.length
  const visibleIds = new Set(visible.map((f) => f.check_id))
  const grouped = PHASE_GROUPS.map((g) => ({
    ...g,
    rows: g.checks.map((c) => byCheck.get(c)).filter(Boolean),
  }))
  const placed = new Set(PHASE_GROUPS.flatMap((g) => g.checks))
  const leftover = assessable.filter((f) => !placed.has(f.check_id))

  const missingIds = isAdmin && !demo && assessable.some((f) => findingId(f) == null)
  const demoBlock = 'This screen is showing illustrative data, so nothing here can be overridden.'
  const idBlock =
    'This scan’s findings arrive without a finding id, so the override endpoint cannot be addressed from here.'

  const blurb =
    scan.overall_result === 'compliant'
      ? tally.not_assessed > 0
        ? t('findings.allPassedWithGaps', { count: tally.not_assessed })
        : t('result.compliantBlurb')
      : scan.overall_result === 'violation'
        ? t('result.violationBlurb')
        : scan.overall_result === 'out_of_scope'
          ? t('result.outOfScopeBlurb')
          : t('result.notAssessedBlurb')

  async function submitOverride(body) {
    const fid = findingId(target)
    if (fid == null) return
    try {
      await save.run(fid, body)
      setTarget(null)
      save.reset()
      push({ family: 'pass', title: t('findings.overrideSaved') })
      reload()
    } catch {
      /* useMutation holds the error; the dialog stays open and shows it. */
    }
  }

  return (
    <div className="flex flex-col gap-7">
      {/* ------------------------------------------------------------ head -- */}
      <div>
        <Link
          to={`${base}/inspections/${scan.inspection_id}`}
          className="inline-flex min-h-touch items-center gap-1.5 text-small font-medium text-accent-text"
        >
          <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
          Inspection {scan.inspection_id}
        </Link>

        <div className="mt-1 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <Eyebrow>Scan {scan.id}</Eyebrow>
            <h1 className="mt-1 text-h1 text-ink">
              {scan.commodity_generic ?? 'Package'}
              {scan.brand_name && <span className="text-ink-3"> · {scan.brand_name}</span>}
            </h1>
            <p className="nn-mono mt-1 text-caption text-ink-3">{when(scan.created_at)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {demo && <DemoChip />}
            {scan.duplicate_of && (
              <Pill family="review">Duplicate of scan {scan.duplicate_of}</Pill>
            )}
          </div>
        </div>
      </div>

      {demo && (
        <Callout family="info" icon={Info} title={t('common.demoData')}>
          {t('common.demoDataHint')}
        </Callout>
      )}

      {/* ------------------------------------------------------ instrument -- */}
      <Card className="p-5 sm:p-6">
        <ResultSeal
          result={scan.overall_result}
          blurb={blurb}
          meta={
            <>
              <MetaStat label="Rules as at" value={scan.rules_as_at} />
              <MetaStat label="Engine" value={scan.engine_version} />
              <MetaStat
                label={t('admin.catalogHash')}
                value={`${String(scan.catalog_hash).slice(0, 12)}…`}
                title={scan.catalog_hash}
              />
            </>
          }
        />

        <div className="nn-rule-line my-5" />

        <CheckRibbon
          findings={findings}
          assessed={tally.assessed}
          scanType="package"
          height={64}
          className="mb-5"
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CountTile
            label={t('verdict.pass')}
            value={tally.passed}
            family="pass"
            caption="Met the requirement."
          />
          <CountTile
            label={t('verdict.fail')}
            value={tally.failed}
            family="violation"
            caption="Did not meet it."
          />
          <CountTile
            label={t('verdict.not_assessed')}
            value={tally.not_assessed}
            family="na"
            caption="Neither, on this evidence."
          />
          <CountTile
            label="Assessed"
            value={`${tally.assessed}/${tally.total}`}
            icon={Ruler}
            caption="Of the assessable eighteen."
          />
        </div>

        {(countsDisagree || assessedDisagrees) && (
          <Callout family="review" title="The engine's counts and these rows do not agree" className="mt-4">
            The engine reported{' '}
            <span className="nn-mono">
              {api
                ? `${api.passed} passed, ${api.failed} in violation, ${api.not_assessed} not assessed`
                : `${scan.checks_assessed} assessed`}
            </span>
            ; the rows on this screen add up to{' '}
            <span className="nn-mono">
              {tally.passed} passed, {tally.failed} in violation, {tally.not_assessed} not assessed
            </span>
            . Both figures are shown rather than one being chosen, because a disagreement here
            means the two are counting different things.
          </Callout>
        )}
      </Card>

      {/* The flat findings table — the answer in one screen, with the
          canonical PASS / FAIL / NOT ASSESSED verdict per row. Lives above
          the grouped cards so a judge or reviewer can read it first. */}
      <FindingsTable rows={findings} scan={scan} />

      {/* -------------------------------------------------------- findings -- */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h2 className="text-h2 text-ink">{t('findings.title')}</h2>
            <p className="mt-1 max-w-prose text-small text-ink-2">
              Nineteen rows, in the order the Rules apply them.{' '}
              <span className="nn-mono">
                {denominatorLabel({ assessed: tally.assessed, scanType: scan.scan_type })}
              </span>
              . The Section 36 tier is shown last and is not counted.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Filter size={15} strokeWidth={1.8} aria-hidden="true" className="text-ink-3" />
            <Tabs
              value={filter}
              onChange={setFilter}
              tabs={[
                { id: 'all', label: t('common.all'), count: assessable.length },
                { id: 'fail', label: t('verdict.fail'), count: tally.failed },
                { id: 'not_assessed', label: t('verdict.not_assessed'), count: tally.not_assessed },
                { id: 'pass', label: t('verdict.pass'), count: tally.passed },
              ]}
            />
          </div>
        </div>

        {/* A filter that hides rows says so. Silence here is how a reader
            concludes a check was never run. */}
        {hidden > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-caption text-ink-2">
              Showing {visible.length} of {assessable.length} rows — {hidden} hidden by the
              filter.
            </p>
            <Button size="sm" variant="quiet" onClick={() => setFilter('all')}>
              {t('common.clear')}
            </Button>
          </div>
        )}

        {scan.overall_result === 'out_of_scope' && (
          <Callout family="info" title="Chapter II does not apply to this package" className="mt-4">
            The remaining rows are all not assessed for that one reason. There was no
            declaration duty here to breach, so nothing accrues against the shop.
          </Callout>
        )}

        {missingIds && (
          <Callout family="review" title="Overrides are unavailable on this scan" className="mt-4">
            An override is recorded against a finding id, and the findings in this payload
            arrive without one. The review queue carries the ids and can record the change;
            nothing on this screen will accept one in the meantime.
          </Callout>
        )}

        <div className="mt-5 flex flex-col gap-7">
          {grouped.map((g) => {
            const rows = g.rows.filter((f) => visibleIds.has(f.check_id))
            return (
              <section key={g.id}>
                <SectionTitle
                  caption={g.caption}
                  right={
                    <span className="nn-mono text-caption text-ink-3">
                      {rows.length === g.rows.length
                        ? `${g.rows.length}`
                        : `${rows.length} of ${g.rows.length}`}
                    </span>
                  }
                >
                  {g.label}
                </SectionTitle>

                {rows.length === 0 ? (
                  <p className="rounded-card border border-dashed border-divider px-4 py-3 text-caption text-ink-3">
                    No row in this group matches the filter. {g.rows.length}{' '}
                    {g.rows.length === 1 ? 'row is' : 'rows are'} hidden.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {rows.map((f) => {
                      const fid = findingId(f)
                      const canOverride = isAdmin && !demo && fid != null
                      return (
                        <FindingRow
                          key={f.check_id}
                          finding={f}
                          expanded={expanded.has(f.check_id)}
                          onToggle={() => toggle(f.check_id)}
                          canOverride={canOverride}
                          overrideBlocked={
                            isAdmin && !canOverride ? (demo ? demoBlock : idBlock) : null
                          }
                          onOverride={setTarget}
                        />
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}

          {/* A check the frontend catalog has never heard of still gets a row.
              Dropping it would be the one failure this screen cannot afford. */}
          {leftover.length > 0 && (
            <section>
              <SectionTitle caption="Returned by the engine but not in this build's catalog. Shown so nothing is lost.">
                Unrecognised
              </SectionTitle>
              <ul className="flex flex-col gap-2.5">
                {leftover.map((f) => (
                  <FindingRow
                    key={f.check_id}
                    finding={f}
                    expanded={expanded.has(f.check_id)}
                    onToggle={() => toggle(f.check_id)}
                    canOverride={false}
                    overrideBlocked={null}
                    onOverride={setTarget}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {/* ------------------------------------------------- tier + evidence -- */}
      {derived && <DerivedTier finding={derived} scan={scan} />}
      <EvidencePanel images={scan.images ?? []} scan={scan} />

      <p className="max-w-prose text-caption text-ink-3">
        {t('checks.total')} · {t('checks.rows')} · {t('checks.tierExcluded')}
      </p>

      {target && (
        <OverrideDialog
          finding={target}
          pending={save.pending}
          error={save.error}
          onClose={() => {
            setTarget(null)
            save.reset()
          }}
          onSubmit={submitOverride}
        />
      )}
    </div>
  )
}


