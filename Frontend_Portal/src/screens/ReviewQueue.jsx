/**
 * The review queue: one honest number, and everything that can be reconstructed
 * behind it.
 *
 * This screen exists because GET /admin/review-queue returns exactly this:
 *
 *     {"count": 12}
 *
 * No rows, no ids, no parameters. Its docstring says the total is "counted the
 * same way the review endpoint lists it" — but no endpoint lists it. That gap
 * shapes every decision here:
 *
 * 1. THE NUMBER IS SHOWN AS THE SERVER'S NUMBER, AND ITS ARITHMETIC IS SHOWN
 *    WITH IT. queries.py:review_queue_size adds three counts measured in three
 *    different units — scans, findings, and inspections. "12" is therefore not
 *    twelve of anything. Presenting it as a row count would be a lie the page
 *    tells before the reader has done anything, so the three terms are named.
 *
 * 2. THE LIST IS RECONSTRUCTED, ON REQUEST, AND LABELLED AS RECONSTRUCTED. There
 *    is no server-side listing, so the only way to get rows is to walk
 *    /inspections -> /inspections/{id} -> /scans/{id}. That is many requests, so
 *    it never runs on page load: the officer asks for it, sees progress, and can
 *    stop it. A screen that fires two hundred requests because somebody opened a
 *    tab is a screen that gets blamed for the server being slow.
 *
 * 3. THE WALK REPLICATES THE SERVER'S PREDICATES EXACTLY, INCLUDING THE ODD ONE.
 *    Not-assessed scans use `overall_result === 'not_assessed' && duplicate_of ==
 *    null`, matching `LIVE` in queries.py. Low-confidence findings use
 *    `confidence < 0.60 && human_verdict == null` with NO live filter, because
 *    the server's low_conf term has none either — so a finding on a duplicated
 *    scan is counted by the server and is therefore counted here. Copying the
 *    inconsistency is the only way the reconstruction can be compared with the
 *    total; silently improving it would make the two disagree and teach the
 *    reader to distrust the honest number.
 *
 * 4. THE THIRD TERM CANNOT BE LISTED AT ALL, AND THAT IS SAID PLAINLY.
 *    `edited_offline` is counted by the server but _inspection_dict does not
 *    return it, so no client can identify which inspections it refers to. The
 *    page states this instead of quietly producing a short list.
 *
 * 5. THE WALK IS BOUNDED AND HONEST ABOUT ITS BOUNDS. It reads a date window and
 *    a hard cap on inspections. Whatever it did not reach is reported as not
 *    reached — never folded into the results as if it had been checked.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, subDays } from 'date-fns'
import {
  AlertTriangle,
  ArrowRight,
  CircleDashed,
  Gauge,
  Layers,
  ListChecks,
  Play,
  RefreshCw,
  Square,
  WifiOff,
} from 'lucide-react'
import { endpoints } from '../api/client'
import { useI18n } from '../i18n'
import { CHECKS_TOTAL, checkById } from '../lib/checks'
import { useDocumentTitle, useResource } from '../lib/hooks'
import { inspections as inspectionsFixture, reviewQueue as reviewQueueFixture } from '../mock/fixtures'
import {
  Button,
  Callout,
  Card,
  CardHeader,
  ConfidenceBadge,
  DemoChip,
  EmptyState,
  Eyebrow,
  Field,
  Input,
  PageHeader,
  Pill,
  SectionTitle,
  SeverityBadge,
  Skeleton,
  Tabs,
  VerdictBadge,
  cx,
} from '../ui'

/** The server's own threshold. Not a display preference — changing it here would
    make the reconstruction disagree with the count. */
const LOW_CONFIDENCE = 0.6

/** How many inspections one walk will open. A working day is a few dozen; two
    hundred is generous for a district and still finite. */
const INSPECTION_CAP = 200

const iso = (d) => format(d, 'yyyy-MM-dd')

function pretty(value) {
  if (!value) return '—'
  try {
    return format(parseISO(value), 'd MMM yyyy')
  } catch {
    return String(value)
  }
}

/**
 * The three terms of the sum, each with what it counts and whether this page can
 * list it. Kept as data so the explanation and the results cannot drift apart.
 */
const TERMS = [
  {
    key: 'na',
    label: 'Not-assessed packages',
    unit: 'one per package',
    icon: CircleDashed,
    family: 'na',
    predicate: 'overall_result = "not_assessed" AND duplicate_of IS NULL',
    listable: true,
    note: 'A package the engine could not reach a verdict on. Duplicated captures are excluded, so each physical package is counted once.',
  },
  {
    key: 'lowconf',
    label: 'Low-confidence findings',
    unit: 'one per finding',
    icon: Gauge,
    family: 'review',
    predicate: 'confidence < 0.60 AND human_verdict IS NULL',
    listable: true,
    note: 'A single check the engine answered but is not sure about. One package can contribute several. This term has no duplicate filter on the server, so findings on duplicated captures count too — reproduced faithfully below.',
  },
  {
    key: 'offline',
    label: 'Inspections edited offline',
    unit: 'one per inspection',
    icon: WifiOff,
    family: 'review',
    predicate: 'edited_offline IS TRUE',
    listable: false,
    note: 'Counted by the server but not returned by any endpoint: _inspection_dict omits edited_offline. This page cannot tell you which inspections these are.',
  },
]

/* ------------------------------------------------------------------ pieces -- */

/** A bar that reports a real fraction. No indeterminate shimmer: the walk knows
    how many inspections it intends to open, so it can say where it is. */
function WalkProgress({ done, total, label }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-caption text-ink-2">{label}</p>
        <p className="nn-mono text-caption text-ink-3">
          {done} / {total}
        </p>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-surface-sunken"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-pill bg-accent transition-[width] duration-base ease-settle"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function TermCard({ term, count, running }) {
  const Icon = term.icon
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="nn-eyebrow">{term.label}</span>
        <Icon size={15} strokeWidth={1.9} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
      </div>
      <p className="tabular-nums text-h1 leading-none text-ink">
        {count == null ? <span className="text-ink-3">—</span> : count}
      </p>
      <p className="nn-mono text-caption text-ink-3">{term.unit}</p>
      <p className="mt-1 text-caption text-ink-2">{term.note}</p>
      {!term.listable ? (
        <Pill family="na" className="mt-auto self-start">
          Cannot be listed
        </Pill>
      ) : count == null ? (
        <Pill family="info" className="mt-auto self-start">
          {running ? 'Counting…' : 'Not counted yet'}
        </Pill>
      ) : null}
    </Card>
  )
}

/** One not-assessed package. */
function NaRow({ item, onOpen }) {
  const gap = item.checks_total != null && item.checks_assessed != null
    ? item.checks_total - item.checks_assessed
    : null
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-divider py-3 last:border-0">
      <VerdictBadge verdict="not_assessed" size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-medium text-ink">
          {[item.brand_name, item.commodity_generic].filter(Boolean).join(' — ') ||
            `Package #${item.scan_id}`}
        </p>
        <p className="nn-mono text-caption text-ink-3">
          Package #{item.scan_id} · Inspection #{item.inspection_id} · {pretty(item.inspection_date)}
        </p>
      </div>
      <span className="nn-mono text-caption text-ink-2">
        {item.checks_assessed == null
          ? '—'
          : `${item.checks_assessed}/${item.checks_total ?? CHECKS_TOTAL} assessed`}
        {gap ? ` · ${gap} open` : ''}
      </span>
      <Link to={onOpen(item)} className="inline-flex items-center font-medium text-accent-text hover:underline text-caption">
        Open
        <ArrowRight size={12} strokeWidth={2} aria-hidden="true" className="ml-1 inline align-[-1px]" />
      </Link>
    </li>
  )
}

/** One low-confidence finding. */
function LowConfRow({ item, onOpen }) {
  const def = checkById(item.check_id)
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-divider py-3 last:border-0">
      <span className="nn-mono w-[4.5rem] shrink-0 text-caption text-ink-2">{item.check_id}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-medium text-ink">{item.title ?? def?.title ?? item.check_id}</p>
        <p className="nn-mono text-caption text-ink-3">
          Package #{item.scan_id} · Inspection #{item.inspection_id}
          {item.duplicate_of != null ? ` · duplicate of #${item.duplicate_of}` : ''}
        </p>
      </div>
      <ConfidenceBadge value={item.confidence} threshold={LOW_CONFIDENCE} />
      <VerdictBadge verdict={item.effective_verdict} size="sm" />
      {item.severity && <SeverityBadge severity={item.severity} />}
      <Link to={onOpen(item)} className="inline-flex items-center font-medium text-accent-text hover:underline text-caption">
        Review
        <ArrowRight size={12} strokeWidth={2} aria-hidden="true" className="ml-1 inline align-[-1px]" />
      </Link>
    </li>
  )
}

/* ------------------------------------------------------------------ screen -- */

export default function ReviewQueue() {
  const { t } = useI18n()
  useDocumentTitle(t('admin.reviewQueueCount'))

  const today = useMemo(() => new Date(), [])
  const [from, setFrom] = useState(() => iso(subDays(today, 29)))
  const [to, setTo] = useState(() => iso(today))
  const [tab, setTab] = useState('na')

  /* The authoritative number. One request, no parameters. */
  const queue = useResource(() => endpoints.admin.reviewQueue(), {
    fallback: reviewQueueFixture,
    label: 'review-queue',
  })

  /* The reconstruction. Explicit state rather than a hook, because it is a
     multi-request walk with progress and a stop button — nothing about it
     resembles "fetch a resource". */
  const [walk, setWalk] = useState(null)
  const abortRef = useRef({ stopped: false })

  const stop = useCallback(() => {
    abortRef.current.stopped = true
    setWalk((w) => (w ? { ...w, running: false, stoppedEarly: true } : w))
  }, [])

  const run = useCallback(async () => {
    abortRef.current = { stopped: false }
    const flag = abortRef.current
    setWalk({
      running: true,
      stoppedEarly: false,
      opened: 0,
      planned: 0,
      stage: 'Listing inspections in the window…',
      na: [],
      lowConf: [],
      failures: 0,
      capped: false,
      demo: false,
      error: null,
    })

    try {
      /* Step one: the inspections in the window. The server filters this. */
      const list = await endpoints.inspections.list({ date_from: from, date_to: to })
      if (flag.stopped) return

      const capped = list.length > INSPECTION_CAP
      const targets = capped ? list.slice(0, INSPECTION_CAP) : list
      const dateOf = new Map(targets.map((i) => [i.id, i.inspection_date]))

      setWalk((w) => ({
        ...w,
        planned: targets.length,
        capped,
        stage: 'Opening each inspection to find its packages…',
      }))

      /* Step two: each inspection's packages. Sequential on purpose — a burst of
         two hundred parallel requests is indistinguishable from an attack. */
      const scanRefs = []
      let opened = 0
      let failures = 0
      for (const insp of targets) {
        if (flag.stopped) return
        try {
          const detail = await endpoints.inspections.get(insp.id)
          for (const s of detail.scans ?? []) {
            scanRefs.push({ ...s, inspection_id: insp.id, inspection_date: dateOf.get(insp.id) })
          }
        } catch {
          failures += 1
        }
        opened += 1
        setWalk((w) => (w ? { ...w, opened, failures } : w))
      }

      /* The not-assessed term is answerable from what we already have: the
         inspection detail carries overall_result and duplicate_of. */
      const na = scanRefs
        .filter((s) => s.overall_result === 'not_assessed' && s.duplicate_of == null)
        .map((s) => ({
          scan_id: s.id,
          inspection_id: s.inspection_id,
          inspection_date: s.inspection_date,
          brand_name: s.brand_name,
          commodity_generic: s.commodity_generic,
          checks_assessed: s.checks_assessed,
          checks_total: s.checks_total,
        }))
      setWalk((w) => (w ? { ...w, na } : w))

      /* Step three: findings live one level deeper, so the low-confidence term
         needs every scan opened. This is the expensive half, and the reason the
         walk is a button. */
      setWalk((w) => ({
        ...w,
        stage: `Reading findings for ${scanRefs.length} ${scanRefs.length === 1 ? 'package' : 'packages'}…`,
        planned: scanRefs.length,
        opened: 0,
      }))

      const lowConf = []
      let read = 0
      for (const ref of scanRefs) {
        if (flag.stopped) return
        try {
          const scan = await endpoints.scans.get(ref.id)
          for (const f of scan.findings ?? []) {
            if (f.confidence != null && f.confidence < LOW_CONFIDENCE && f.human_verdict == null) {
              lowConf.push({
                ...f,
                scan_id: scan.id,
                inspection_id: ref.inspection_id,
                duplicate_of: scan.duplicate_of,
              })
            }
          }
        } catch {
          failures += 1
        }
        read += 1
        setWalk((w) => (w ? { ...w, opened: read, failures, lowConf: [...lowConf] } : w))
      }

      if (flag.stopped) return
      setWalk((w) =>
        w
          ? {
              ...w,
              running: false,
              stage: 'Finished.',
              lowConf: lowConf.sort((a, b) => (a.confidence ?? 1) - (b.confidence ?? 1)),
            }
          : w
      )
    } catch (err) {
      if (flag.stopped) return
      setWalk((w) => (w ? { ...w, running: false, error: err } : w))
    }
  }, [from, to])

  const count = queue.data?.count ?? null
  const naCount = walk && !walk.running ? walk.na.length : walk?.na?.length ?? null
  const lowCount = walk && !walk.running ? walk.lowConf.length : walk?.lowConf?.length ?? null
  const reconstructed =
    walk && !walk.running && !walk.stoppedEarly && !walk.error
      ? walk.na.length + walk.lowConf.length
      : null
  const unexplained = reconstructed != null && count != null ? count - reconstructed : null

  const linkFor = (item) => `/admin/scans/${item.scan_id}`

  const tabs = [
    { value: 'na', label: 'Not assessed', count: walk ? walk.na.length : undefined },
    { value: 'lowconf', label: 'Low confidence', count: walk ? walk.lowConf.length : undefined },
  ]

  return (
    <div>
      <PageHeader
        eyebrow="Legal Metrology · enforcement"
        title={t('admin.reviewQueueCount')}
        subtitle="What a human still has to look at. The total comes from the server; the rows below are assembled by this device, because no endpoint returns them."
        actions={queue.demo ? <DemoChip /> : null}
      />

      {/* ------------------------------------------------- the honest number -- */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="p-5">
          <Eyebrow>GET /admin/review-queue</Eyebrow>
          {queue.loading ? (
            <Skeleton lines={2} className="mt-3" />
          ) : queue.error ? (
            <Callout family="violation" title="The total could not be read" className="mt-3">
              {queue.error.message}
            </Callout>
          ) : (
            <>
              <p className="tabular-nums mt-2 text-display leading-none text-ink">{count}</p>
              <p className="mt-2 text-caption text-ink-2">
                items awaiting a human — <span className="font-medium text-ink">not</span> {count}{' '}
                packages and not {count} findings. The three terms below are measured in three
                different units and added together.
              </p>
              <Button
                size="sm"
                variant="ghost"
                icon={RefreshCw}
                className="mt-3"
                onClick={queue.reload}
              >
                Re-read the total
              </Button>
            </>
          )}
        </Card>

        <Card className="p-5">
          <CardHeader
            title="How the total is calculated"
            caption="queries.py:review_queue_size — three counts, one sum."
          />
          <ul className="mt-3 flex flex-col gap-3">
            {TERMS.map((term) => (
              <li key={term.key} className="flex gap-3">
                <span
                  className={cx(
                    'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-pill border',
                    term.family === 'na'
                      ? 'border-na-border bg-na-fill text-na-text'
                      : 'border-review-border bg-review-fill text-review-text'
                  )}
                  aria-hidden="true"
                >
                  <term.icon size={14} strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                  <p className="text-small font-medium text-ink">
                    {term.label}{' '}
                    <span className="nn-mono text-caption font-normal text-ink-3">({term.unit})</span>
                  </p>
                  <p className="nn-mono mt-0.5 break-words text-caption text-ink-2">{term.predicate}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-divider pt-3 text-caption text-ink-2">
            Because the units differ, one package with four uncertain checks adds five to this total —
            one for the package if it came out not assessed, and one for each finding. The number is
            useful as a workload signal and misleading as a row count, which is why this page says so
            rather than dressing the sum up as a list.
          </p>
        </Card>
      </div>

      {/* --------------------------------------------------------- the walk -- */}
      <SectionTitle
        className="mt-8"
        caption="There is no listing endpoint, so the rows have to be gathered one request at a time. Choose a window and start the walk; it can be stopped at any point and reports exactly how far it got."
        right={
          walk?.running ? (
            <Button size="sm" variant="secondary" icon={Square} onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button size="sm" variant="primary" icon={walk ? RefreshCw : Play} onClick={run}>
              {walk ? 'Run again' : 'Assemble the list'}
            </Button>
          )
        }
      >
        Assemble the queue
      </SectionTitle>

      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="From" className="w-[10.5rem]">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={from}
                max={to}
                disabled={walk?.running}
                onChange={(e) => setFrom(e.target.value)}
              />
            )}
          </Field>
          <Field label="To" className="w-[10.5rem]">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={to}
                min={from}
                disabled={walk?.running}
                onChange={(e) => setTo(e.target.value)}
              />
            )}
          </Field>
          <p className="max-w-prose flex-1 text-caption text-ink-3">
            The window is applied by the server on <span className="nn-mono">date_from</span> and{' '}
            <span className="nn-mono">date_to</span>. Everything after that — opening each inspection,
            then each package — happens on this device, at up to{' '}
            <span className="nn-mono">{INSPECTION_CAP}</span> inspections per run.
          </p>
        </div>

        {walk && (
          <div className="mt-5 border-t border-divider pt-4">
            {walk.running && (
              <WalkProgress done={walk.opened} total={walk.planned} label={walk.stage} />
            )}

            {!walk.running && walk.error && (
              <Callout family="violation" title="The walk could not start">
                {walk.error.message}
              </Callout>
            )}

            {!walk.running && walk.stoppedEarly && (
              <Callout family="review" title="Stopped before finishing">
                {walk.opened} of {walk.planned} requests had completed. The rows below are only what
                had been gathered by then — they are not a complete answer, and they should not be
                compared with the server's total.
              </Callout>
            )}

            {!walk.running && !walk.error && !walk.stoppedEarly && (
              <div className="flex flex-col gap-3">
                <p className="text-small text-ink-2">
                  Walked {walk.planned} {walk.planned === 1 ? 'package' : 'packages'} across the window{' '}
                  {pretty(from)} – {pretty(to)}. Found{' '}
                  <span className="font-medium text-ink">{walk.na.length}</span> not-assessed{' '}
                  {walk.na.length === 1 ? 'package' : 'packages'} and{' '}
                  <span className="font-medium text-ink">{walk.lowConf.length}</span> low-confidence{' '}
                  {walk.lowConf.length === 1 ? 'finding' : 'findings'}.
                </p>
                {walk.capped && (
                  <Callout family="review" title={`Only the first ${INSPECTION_CAP} inspections were opened`}>
                    The window returned more than the cap. Narrow the dates to cover the rest — the
                    remainder was not read, and is not represented in the rows below.
                  </Callout>
                )}
                {walk.failures > 0 && (
                  <Callout family="review" title={`${walk.failures} requests failed`}>
                    Some records could not be read — most often because they belong to another
                    officer's jurisdiction. Anything in them is missing from these rows.
                  </Callout>
                )}
                {unexplained != null && unexplained !== 0 && (
                  <Callout
                    family="na"
                    icon={Layers}
                    title={
                      unexplained > 0
                        ? `${unexplained} of the server's ${count} are not accounted for here`
                        : `This walk found ${Math.abs(unexplained)} more than the server's total of ${count}`
                    }
                  >
                    {unexplained > 0 ? (
                      <>
                        Expected, and worth understanding. The server counts across all dates, while
                        this walk covers {pretty(from)} – {pretty(to)}. It also counts inspections
                        marked <span className="nn-mono">edited_offline</span>, which no endpoint
                        exposes and no client can list. The difference is not an error in either
                        number.
                      </>
                    ) : (
                      <>
                        This is worth a second look. The reconstruction should never exceed a total
                        computed over all dates. Re-read the total, and if the difference persists,
                        the two are counting different things.
                      </>
                    )}
                  </Callout>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* -------------------------------------------------------- the terms -- */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TermCard term={TERMS[0]} count={walk ? naCount : null} running={walk?.running} />
        <TermCard term={TERMS[1]} count={walk ? lowCount : null} running={walk?.running} />
        <TermCard term={TERMS[2]} count={null} running={false} />
      </div>

      {/* --------------------------------------------------------- the rows -- */}
      {walk && (walk.na.length > 0 || walk.lowConf.length > 0 || !walk.running) && (
        <section className="mt-8">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />

          <Card className="mt-4 p-5">
            {tab === 'na' ? (
              walk.na.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="No not-assessed packages in this window"
                  body="Every live package in the window reached a verdict. Duplicated captures are excluded here, exactly as the server excludes them."
                  family="pass"
                />
              ) : (
                <>
                  <CardHeader
                    title="Packages the engine could not decide"
                    caption="Each needs a human to look at the panel, or a better capture. Opening one shows which checks were left not assessed and why."
                  />
                  <ul className="mt-3">
                    {walk.na.map((item) => (
                      <NaRow key={item.scan_id} item={item} onOpen={linkFor} />
                    ))}
                  </ul>
                </>
              )
            ) : walk.lowConf.length === 0 ? (
              <EmptyState
                icon={Gauge}
                title="No low-confidence findings in this window"
                body={`Every finding read carried a confidence of ${LOW_CONFIDENCE.toFixed(2)} or better, or had already been given a human verdict.`}
                family="pass"
              />
            ) : (
              <>
                <CardHeader
                  title="Findings the engine is unsure about"
                  caption="Lowest confidence first. A human verdict on any of these removes it from the queue — and the override is recorded in the audit trail with the reason given."
                />
                <ul className="mt-3">
                  {walk.lowConf.map((item) => (
                    <LowConfRow
                      key={`${item.scan_id}-${item.check_id}`}
                      item={item}
                      onOpen={linkFor}
                    />
                  ))}
                </ul>
                <p className="mt-4 border-t border-divider pt-3 text-caption text-ink-3">
                  Rows on a duplicated capture are included because the server includes them: its
                  low-confidence term has no <span className="nn-mono">duplicate_of IS NULL</span>{' '}
                  filter, unlike the not-assessed term above. Filtering them out here would make this
                  list disagree with the total.
                </p>
              </>
            )}
          </Card>
        </section>
      )}

      {!walk && (
        <Card className="mt-8 p-5">
          <div className="flex gap-3">
            <AlertTriangle
              size={16}
              strokeWidth={1.9}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-review-graphic"
            />
            <div className="max-w-prose">
              <p className="text-small font-medium text-ink">Nothing has been gathered yet</p>
              <p className="mt-1 text-caption text-ink-2">
                The rows are not loaded automatically. Assembling them takes one request per
                inspection and one per package, which is a real cost that should be paid on purpose —
                not because a tab was left open. Set a window above and start the walk.
              </p>
              <p className="mt-2 text-caption text-ink-3">
                A proper fix belongs on the server: a listing endpoint that returns the same rows the
                count is computed from. Until then, this page is explicit about doing the server's
                work in the browser.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Kept out of the way, but on the page: the fixture path cannot walk. */}
      {queue.demo && (
        <p className="mt-6 text-caption text-ink-3">
          The total shown is fixture data because the backend was unreachable. The walk needs a live
          backend — with none, it will report failures rather than invent rows. The{' '}
          {inspectionsFixture.length} fixture inspections are used for the list step only.
        </p>
      )}
    </div>
  )
}
