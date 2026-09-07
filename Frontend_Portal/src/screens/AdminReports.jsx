/**
 * Reports — where a document actually comes from.
 *
 * The overview answers "how is the jurisdiction doing". This screen answers a
 * narrower and more procedural question: I need a document, for a particular
 * visit or a particular day, that a senior officer or a court will accept. So it
 * is organised by what the server can actually emit rather than by what would
 * make a tidy reporting page.
 *
 * The server emits exactly two kinds of document, and neither one is an office
 * report:
 *
 *   - /reports/inspections/{id}.docx|.pdf renders one visit. Ownership is
 *     checked inside the handler rather than by the role dependency, so an
 *     administrator may fetch any visit and an inspector only their own. This is
 *     the one document route that can cover another officer's work.
 *   - /reports/today.docx|.pdf renders one officer-day, and it is always the
 *     caller's own. The dependency admits an administrator but the query still
 *     filters on `user.id`, so an administrator downloading it receives their own
 *     day — for most administrators, an empty document.
 *
 * There is no range document, no office-wide document, and no spreadsheet writer
 * on the server at all. The period figures at the top therefore come from
 * /admin/dashboard, which is a real office total, and they are here for context —
 * to decide which visits to pull — not as something exportable in one piece.
 *
 * Two things this screen is careful to say out loud. GET /inspections has no
 * user_id parameter, so the officer filter is applied in this browser after the
 * whole window has been fetched, and the count above the table says so. And
 * report_generator stamps the *caller* into the document's "Inspector:" line, so
 * an administrator's download of someone else's visit carries the wrong name —
 * that is flagged where the buttons are, not buried here.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, subDays } from 'date-fns'
import {
  CheckCircle,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  FileSignature,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Info,
  ListChecks,
  RotateCcw,
  Search,
  Sigma,
  UserRound,
  Users,
  X,
  XCircle,
} from 'lucide-react'
import { endpoints, saveBlob } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { useDebounced, useDocumentTitle, useResource } from '../lib/hooks'
import {
  adminDashboard,
  inspections as inspectionsFixture,
  storesById,
  users as usersFixture,
} from '../mock/fixtures'
import {
  Button,
  Callout,
  Card,
  DemoChip,
  EmptyState,
  Field,
  Input,
  MetaStat,
  PageHeader,
  Pill,
  SectionTitle,
  Select,
  Skeleton,
  StatCard,
  Table,
  Td,
  Th,
  Tr,
  cx,
  useToast,
} from '../ui'

/* The three windows the dashboard query is cheap enough to serve. `end` is
   always today, because /admin/dashboard defaults `end` to date.today() and a
   trailing window is what an administrator actually asks for. */
const WINDOWS = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
]

/* Package results, in the order every report reads them. Icons match
   VERDICT_META so one result never wears two faces. */
const RESULT_TILES = [
  { key: 'compliant', family: 'pass', labelKey: 'result.compliant', icon: CheckCircle },
  { key: 'violation', family: 'violation', labelKey: 'result.violation', icon: XCircle },
  { key: 'not_assessed', family: 'na', labelKey: 'result.not_assessed', icon: HelpCircle },
  { key: 'out_of_scope', family: 'na', labelKey: 'result.out_of_scope', icon: Clock },
]

/* Submitted is the default because a draft is not part of the record. Both are
   offered, since the document route will happily render a draft and an
   administrator chasing an incomplete visit has a reason to look. */
const STATUS_TABS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'draft', label: 'Unfinished' },
  { value: '', label: 'Both' },
]

const iso = (d) => format(d, 'yyyy-MM-dd')

function prettyDay(value) {
  if (!value) return 'Undated'
  try {
    return format(parseISO(value), 'd MMM yyyy')
  } catch {
    return String(value)
  }
}

/* CSV, written the way a spreadsheet will read it back: CRLF rows, quotes
   doubled, and a BOM so Excel does not mangle a Devanagari shop name. */
function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(header, rows) {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export default function AdminReports() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  useDocumentTitle(t('nav.reports'))

  const today = iso(new Date())
  const [windowId, setWindowId] = useState('30')
  /* A picked From date overrides the window preset; choosing a preset clears it. */
  const [customFrom, setCustomFrom] = useState('')
  const [status, setStatus] = useState('submitted')
  const [officerId, setOfficerId] = useState('')
  const [qRaw, setQRaw] = useState('')
  const q = useDebounced(qRaw.trim(), 350)
  /* One key at a time: `pdf:774`, `docx:774`, `own:pdf`. Two documents at once
     would race the server's per-user output file. */
  const [busy, setBusy] = useState(null)

  const days = WINDOWS.find((w) => w.id === windowId)?.days ?? 30
  const from = customFrom || iso(subDays(new Date(), days - 1))

  const summary = useResource(() => endpoints.admin.dashboard({ start: from, end: today }), {
    deps: [from, today],
    fallback: adminDashboard,
    label: t('admin.overview'),
  })

  /* Only the parameters the endpoint has. There is no user_id here on purpose —
     it does not exist, and the officer narrowing happens below. */
  const params = useMemo(() => {
    const p = { date_from: from }
    if (status) p.status = status
    if (q) p.q = q
    return p
  }, [from, status, q])
  const key = JSON.stringify(params)

  const list = useResource(() => endpoints.inspections.list(params), {
    deps: [key],
    fallback: inspectionsFixture,
    label: t('nav.inspections'),
  })
  const officers = useResource(() => endpoints.admin.users(), {
    fallback: usersFixture,
    label: t('nav.inspectors'),
  })
  const shops = useResource(() => endpoints.inspections.stores(), {
    fallback: Object.values(storesById),
    label: t('inspection.store'),
  })

  /* Names live on /stores and /admin/users; the inspection list carries ids. If
     either lookup fails the rows still render, with the number in place. */
  const allRows = useMemo(() => {
    const shopById = new Map((shops.data ?? []).map((s) => [s.id, s]))
    const officerById = new Map((officers.data ?? []).map((u) => [u.id, u]))
    return (list.data ?? []).map((i) => {
      const shop = shopById.get(i.store_id)
      const off = officerById.get(i.user_id)
      return {
        id: i.id,
        date: i.inspection_date ?? null,
        userId: i.user_id,
        officerName: off?.full_name ?? `Officer #${i.user_id}`,
        officerCode: off?.employee_id ?? null,
        shopName: shop?.name ?? `Shop #${i.store_id}`,
        shopCity: shop?.city ?? null,
        status: i.status ?? null,
        scans: i.scan_count ?? 0,
        inScope: i.in_scope,
        signature: i.signature_status ?? null,
      }
    })
  }, [list.data, shops.data, officers.data])

  /* The one narrowing the server cannot do. */
  const rows = useMemo(() => {
    if (!officerId) return allRows
    const id = Number(officerId)
    return allRows.filter((r) => r.userId === id)
  }, [allRows, officerId])

  const narrowed = officerId !== '' && rows.length !== allRows.length
  const packages = rows.reduce((n, r) => n + r.scans, 0)
  const filtered = Boolean(officerId || q) || status !== 'submitted' || windowId !== '30'
  const demo = summary.demo || list.demo || officers.demo || shops.demo

  const period = summary.data ?? adminDashboard
  const counts = period.counts ?? {}

  function reset() {
    setWindowId('30')
    setStatus('submitted')
    setOfficerId('')
    setQRaw('')
  }

  /* One visit, as a file. The server writes it to inspection_{id}.{ext} and
     streams it back, so two clicks on the same visit are safe but slow. */
  async function downloadVisit(row, kind) {
    setBusy(`${kind}:${row.id}`)
    const fetcher = {
      docx: endpoints.reports.inspectionDocx,
      pdf: endpoints.reports.inspectionPdf,
      xlsx: endpoints.reports.inspectionXlsx,
      csv: endpoints.reports.inspectionCsv,
    }[kind]
    try {
      const blob = await fetcher(row.id)
      saveBlob(blob, `niyamnetra-inspection-${row.id}.${kind}`)
      history.reload()
      toast.push({
        family: 'pass',
        title: `Inspection ${row.id} downloaded`,
        body: `${row.shopName} · ${prettyDay(row.date)}. The "Inspector" line names ${row.officerName}, the visit's officer.`,
      })
    } catch (err) {
      toast.push({
        family: 'violation',
        title: `Inspection ${row.id} could not be rendered`,
        body: err?.message ?? 'The server did not return a file.',
      })
    } finally {
      setBusy(null)
    }
  }

  /* Office-wide range document: a month of work in one download.
     GET /admin/reports/range.{pdf,docx,xlsx,csv}?start=&end=[&user_id=].
     The picked officer (if any) travels as user_id; otherwise the whole office. */
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  async function downloadOfficeRange(kind) {
    setBusy(`office:${kind}`)
    try {
      const blob = await endpoints.admin.officeRangeDoc(kind, {
        start: rangeFrom || from,
        end: rangeTo || today,
        ...(officerId ? { user_id: Number(officerId) } : {}),
      })
      saveBlob(blob, `niyamnetra-office-${rangeFrom || from}-to-${rangeTo || today}.${kind}`)
      history.reload()
      toast.push({
        family: 'pass',
        title: 'Office range downloaded',
        body: officerId
          ? 'One officer, the picked range. The header names that officer.'
          : 'Every officer, the picked range. One file, not one per visit.',
      })
    } catch (err) {
      toast.push({
        family: 'violation',
        title: 'The document could not be generated',
        body: err?.message ?? 'The server did not return a file.',
      })
    } finally {
      setBusy(null)
    }
  }

  /* Archive list of generated documents (who/what/sha256). Reloaded after
     every download on this screen so it never disagrees with reality. */
  const history = useResource(() => endpoints.admin.reportHistory({ limit: 20 }), {
    label: 'report-history',
  })

  /* The caller's own day. Kept because it is a real endpoint and an
     administrator who also inspects will want it — labelled for what it is. */
  async function downloadOwnDay(kind) {
    setBusy(`own:${kind}`)
    const fetcher = {
      docx: endpoints.reports.todayDocx,
      pdf: endpoints.reports.todayPdf,
      xlsx: endpoints.reports.todayXlsx,
      csv: endpoints.reports.todayCsv,
    }[kind]
    try {
      const blob = await fetcher({})
      saveBlob(blob, `niyamnetra-report-${today}.${kind}`)
      history.reload()
      toast.push({
        family: 'pass',
        title: 'Your own day downloaded',
        body: 'This covers your account only. If you did not inspect today, the document says so rather than being empty.',
      })
    } catch (err) {
      toast.push({
        family: 'violation',
        title: 'The document could not be generated',
        body: err?.message ?? 'The server did not return a file.',
      })
    }
    setBusy(null)
  }

  /* Assembled here, from rows already in this browser. Nothing is asked of the
     server, and the filename records the window so two exports never collide. */
  function exportCsv() {
    const csv = toCsv(
      ['inspection_id', 'date', 'officer', 'employee_id', 'shop', 'city', 'status', 'packages', 'in_scope', 'signature'],
      rows.map((r) => [
        r.id,
        r.date ?? '',
        r.officerName,
        r.officerCode ?? '',
        r.shopName,
        r.shopCity ?? '',
        r.status ?? '',
        r.scans,
        r.inScope === false ? 'no' : 'yes',
        r.signature ?? '',
      ])
    )
    saveBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `niyamnetra-inspections-${from}-to-${today}.csv`
    )
    toast.push({
      family: 'pass',
      title: `${rows.length} ${rows.length === 1 ? 'row' : 'rows'} exported`,
      body: 'Built from what is loaded in this browser. It carries no findings — those live in the per-visit document.',
    })
  }

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow={t('nav.reports')}
        title={t('nav.reports')}
        subtitle="One visit, one day, a date range, or the whole office — each as PDF, Word, Excel or CSV. The jurisdiction figures below are context for choosing which."
        actions={
          <div className="flex items-center gap-2">
            {demo && <DemoChip />}
            <Button
              variant="secondary"
              icon={ListChecks}
              iconRight={ChevronRight}
              onClick={() => navigate('/admin')}
            >
              {t('nav.overview')}
            </Button>
          </div>
        }
        meta={
          <span className="nn-mono">
            {from} → {today}
          </span>
        }
      />

      {/* ---- The period, and the office totals that belong to it. ---- */}
      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle caption="From /admin/dashboard, which is a genuine jurisdiction total across every officer. It is the only office-wide figure on this screen.">
            <span className="inline-flex items-center gap-2">
              <Sigma size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
              The office, over this period
            </span>
          </SectionTitle>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Period">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  setWindowId(w.id)
                  setCustomFrom('')
                }}
                aria-pressed={windowId === w.id && customFrom === ''}
                className={cx(
                  'nn-badge min-h-touch px-3 transition-colors duration-fast ease-settle',
                  windowId === w.id && customFrom === ''
                    ? 'border-accent bg-accent-soft font-semibold text-accent-text'
                    : 'border-control bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink'
                )}
              >
                {w.label}
              </button>
            ))}
            <Input
              type="date"
              value={customFrom}
              max={today}
              onChange={(e) => setCustomFrom(e.target.value)}
              aria-label="From date — any date"
              className="w-auto"
            />
          </div>
        </div>

        {summary.error ? (
          <Callout
            family="review"
            title="The period figures could not be loaded"
            className="mt-4"
            actions={
              <Button size="sm" onClick={summary.reload}>
                {t('common.retry')}
              </Button>
            }
          >
            The document list below is unaffected — it comes from a different endpoint.
          </Callout>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {RESULT_TILES.map((tile) => (
                <StatCard
                  key={tile.key}
                  label={t(tile.labelKey)}
                  value={String(counts[tile.key] ?? 0)}
                  family={tile.family}
                  icon={tile.icon}
                  loading={summary.loading}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MetaStat label={t('nav.inspections')} value={String(period.inspections ?? 0)} />
              <MetaStat label={t('inspection.packages')} value={String(counts.total ?? 0)} />
              <MetaStat label="Officers active" value={String(period.active_inspectors ?? 0)} />
              <MetaStat label={t('nav.reviewQueue')} value={String(period.review_queue ?? 0)} />
            </div>
          </>
        )}
      </Card>

      {/* ---- Narrowing the list a document will be pulled from. ---- */}
      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('inspection.status')}>
            {STATUS_TABS.map((s) => (
              <button
                key={s.value || 'both'}
                type="button"
                onClick={() => setStatus(s.value)}
                aria-pressed={status === s.value}
                className={cx(
                  'nn-badge min-h-touch px-3.5 transition-colors duration-fast ease-settle',
                  status === s.value
                    ? 'border-accent bg-accent-soft font-semibold text-accent-text'
                    : 'border-control bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            onClick={reset}
            disabled={!filtered}
            disabledReason="Nothing is filtered."
          >
            {t('common.clear')}
          </Button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Officer"
            hint="Applied in this browser. GET /inspections has no user_id parameter, so the whole window is fetched and narrowed here."
          >
            {(props) => (
              <Select {...props} value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
                <option value="">Every officer</option>
                {(officers.data ?? []).map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.full_name} · {o.employee_id}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Search"
            hint="Sent to the server. Matches shop, commodity, brand and batch."
          >
            {(props) => (
              <div className="relative">
                <Input
                  {...props}
                  icon={Search}
                  value={qRaw}
                  onChange={(e) => setQRaw(e.target.value)}
                  placeholder="e.g. Provision"
                  className={qRaw ? 'pr-11' : undefined}
                  autoComplete="off"
                  spellCheck={false}
                />
                {qRaw && (
                  <button
                    type="button"
                    onClick={() => setQRaw('')}
                    aria-label="Clear the shop name filter"
                    className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-sm text-ink-3 hover:text-ink-2"
                  >
                    <X size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </Field>
        </div>
      </Card>

      {/* ---- The count, said precisely. ---- */}
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-small text-ink-2">
          <span className="tabular-nums font-medium text-ink">{rows.length}</span>{' '}
          {rows.length === 1 ? 'visit' : 'visits'} ·{' '}
          <span className="tabular-nums font-medium text-ink">{packages}</span>{' '}
          {packages === 1 ? 'package' : 'packages'}
          {narrowed && (
            <span className="text-ink-3">
              {' '}
              · narrowed here from {allRows.length} the server returned
            </span>
          )}
        </p>
        <Button
          size="sm"
          variant="secondary"
          icon={Download}
          onClick={exportCsv}
          disabled={rows.length === 0}
          disabledReason="There are no rows to export."
        >
          Export CSV
        </Button>
      </div>

      {/* ---- Attribution: fixed server-side (owner stamped, not caller). ---- */}
      <Callout
        family="review"
        title="Per-visit documents name the visit's officer"
        className="mt-4"
      >
        Fixed: the backend stamps the inspection owner into the document header
        (routers/reports.py owner lookup). A document you pull for another
        officer's visit carries their name, not yours.
      </Callout>

      {shops.error && (
        <Callout family="review" title="Shop names could not be loaded" className="mt-4">
          The visit list arrived but /stores did not, so rows below show the shop number instead of
          its name. The documents themselves are unaffected — the server reads the name from its own
          table.
        </Callout>
      )}
      {officers.error && (
        <Callout family="review" title="The officer roster could not be loaded" className="mt-4">
          /admin/users did not answer, so rows show the officer number and the officer filter above
          is empty. Nothing else is affected.
        </Callout>
      )}

      {list.loading ? (
        <Card className="mt-4 p-5">
          <Skeleton lines={8} />
        </Card>
      ) : list.error ? (
        <Callout
          family="violation"
          title="The visit list could not be loaded"
          className="mt-4"
          actions={
            <Button size="sm" onClick={list.reload}>
              {t('common.retry')}
            </Button>
          }
        >
          {list.error.message}
        </Callout>
      ) : rows.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={ClipboardList}
            title={filtered ? 'Nothing matches these filters' : 'No visits in this window'}
            body={
              filtered
                ? 'Widen the period, set the officer back to every officer, or clear the shop name.'
                : 'A document can only be produced from a recorded visit, and there are none in the last thirty days.'
            }
            action={
              filtered ? (
                <Button size="sm" icon={RotateCcw} onClick={reset}>
                  {t('common.clear')}
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card className="mt-4 p-0">
          <Table caption={`${rows.length} ${rows.length === 1 ? 'visit' : 'visits'} between ${from} and ${today}, each downloadable as one document.`}>
            <thead>
              <tr>
                <Th>Visit</Th>
                <Th>Officer</Th>
                <Th align="right">{t('inspection.packages')}</Th>
                <Th align="right">Document</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <VisitRow
                  key={r.id}
                  row={r}
                  busy={busy}
                  onOpen={() => navigate(`/admin/inspections/${r.id}`)}
                  onDownload={downloadVisit}
                  t={t}
                />
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* ---- What a per-visit document holds. ---- */}
      <Callout family="info" title="What is inside a per-visit document" icon={FileSignature} className="mt-6">
        Every package on the visit, every finding in registration order with the provision it cites,
        the shop and transaction type, the geofence result, and the audit chain head as it stood when
        the file was built. That last value is what lets a reader prove the record had not been
        altered before the document was made. Duplicate packages are excluded, as they are everywhere
        else.
      </Callout>

      {/* ---- The administrator's own day. Labelled for what it really is. ---- */}
      <Card className="mt-4 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <SectionTitle caption="/reports/today filters on the caller's own user id even for an administrator. There is no parameter that widens it to the office.">
              <span className="inline-flex items-center gap-2">
                <UserRound size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
                Your own day
              </span>
            </SectionTitle>
            <p className="mt-2 max-w-prose text-small text-ink-2">
              This produces the same document an inspector downloads at the end of a shift, for{' '}
              <span className="nn-mono">{user?.employee_id ?? 'your account'}</span> and for today
              only. If you did not inspect today it will say so rather than arriving empty.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              icon={Download}
              loading={busy === 'own:docx'}
              disabled={busy != null && busy !== 'own:docx'}
              disabledReason="A document is already being generated."
              onClick={() => downloadOwnDay('docx')}
            >
              {t('reports.downloadDocx')}
            </Button>
            <Button
              icon={FileText}
              loading={busy === 'own:pdf'}
              disabled={busy != null && busy !== 'own:pdf'}
              disabledReason="A document is already being generated."
              onClick={() => downloadOwnDay('pdf')}
            >
              {t('reports.downloadPdf')}
            </Button>
            <Button
              variant="secondary"
              icon={FileSpreadsheet}
              loading={busy === 'own:xlsx'}
              disabled={busy != null && busy !== 'own:xlsx'}
              disabledReason="A document is already being generated."
              onClick={() => downloadOwnDay('xlsx')}
            >
              Excel
            </Button>
            <Button
              variant="secondary"
              icon={Download}
              loading={busy === 'own:csv'}
              disabled={busy != null && busy !== 'own:csv'}
              disabledReason="A document is already being generated."
              onClick={() => downloadOwnDay('csv')}
            >
              CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* ---- Office-wide range document: a month of work in one download. ---- */}
      <Card className="mt-4 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <SectionTitle caption="GET /admin/reports/range.{pdf,docx,xlsx,csv}. The picked officer above travels as user_id; with none picked the whole office is covered. At most 31 days per document.">
              <span className="inline-flex items-center gap-2">
                <Sigma size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
                The office, as one document
              </span>
            </SectionTitle>
            <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
              <Field label="From">
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    value={rangeFrom || from}
                    max={rangeTo || today}
                    onChange={(e) => setRangeFrom(e.target.value)}
                  />
                )}
              </Field>
              <Field label="To">
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    value={rangeTo || today}
                    min={rangeFrom || from}
                    max={today}
                    onChange={(e) => setRangeTo(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {['docx', 'pdf', 'xlsx', 'csv'].map((kind) => (
              <Button
                key={kind}
                variant={kind === 'pdf' ? undefined : 'secondary'}
                icon={Download}
                loading={busy === `office:${kind}`}
                disabled={busy != null && busy !== `office:${kind}`}
                disabledReason="A document is already being generated."
                onClick={() => downloadOfficeRange(kind)}
              >
                {kind.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* ---- Generated-document archive: who made what, and its hash. ---- */}
      <Card className="mt-4 p-5 sm:p-6">
        <SectionTitle caption="GET /admin/reports/history. Files stay ephemeral; rows are kept, with the sha256 so a filed copy verifies.">
          <span className="inline-flex items-center gap-2">
            <FileText size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
            Generated documents
          </span>
        </SectionTitle>
        {history.loading ? (
          <p className="mt-3 text-caption text-ink-3">Loading…</p>
        ) : (history.data?.items ?? []).length === 0 ? (
          <p className="mt-3 text-caption text-ink-3">
            {history.error ? 'Could not be loaded.' : 'Nothing generated yet — download above and it lands here.'}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {(history.data.items ?? []).slice(0, 10).map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-l-2 border-divider pl-3">
                <span className="text-small font-semibold text-ink">
                  {r.kind} · {r.fmt.toUpperCase()} · {r.label}
                </span>
                <span className="nn-mono text-caption text-ink-3">
                  {r.created_at?.slice(0, 16)?.replace('T', ' ') ?? '—'}
                  {r.file_sha256 ? ` · ${r.file_sha256.slice(0, 12)}…` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---- The honest boundary. ---- */}
      <Card className="mt-6 p-5 sm:p-6">
        <h2 className="text-h2 text-ink">What reporting cannot do here</h2>
        <p className="mt-1 max-w-prose text-caption text-ink-2">
          Named rather than faked, so a missing feature never reads as a broken one.
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {[
            [
              'Range and office-wide documents',
              'Served: GET /admin/reports/range.{pdf,docx,xlsx,csv}?start=&end= (office-wide, optional user_id) and GET /reports/range.* (own visits). A month of work is one download.',
            ],
            [
              'There is no Excel writer on this screen',
              'The server writes XLSX via GET /admin/reports/range.xlsx and per-visit routes; the CSV above is assembled in this browser from loaded rows and is offered as exactly that.',
            ],
            [
              'Documents are filed as rows, not files',
              'Each download logs who generated what and its sha256 (see Generated documents above) so a filed copy verifies. The files themselves stay ephemeral — nothing here re-serves last week\u2019s bytes.',
            ],
            [
              'Nothing is scheduled or emailed',
              'There is no job runner and no mail transport in the backend. A weekly report reaches a senior officer because someone downloaded it and sent it.',
            ],
            [
              'The officer filter is not a server filter',
              'GET /inspections accepts store, status, a date range and a shop-name search — no user id. The whole window is fetched and narrowed in this browser, which is why the count says how many were dropped.',
            ],
            [
              'A document about a draft is not evidence',
              'The route will render an unfinished visit, and the Unfinished tab exists so an administrator can chase one. Nothing that visit holds has reached a report or a total until it is submitted.',
            ],
          ].map(([title, body]) => (
            <li key={title} className="border-l-2 border-divider pl-3">
              <p className="text-small font-semibold text-ink">{title}</p>
              <p className="mt-0.5 max-w-prose text-caption text-ink-2">{body}</p>
            </li>
          ))}
        </ul>
      </Card>

      <p className="mt-6 flex items-start gap-2 text-caption text-ink-3">
        <Info size={14} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span className="max-w-prose">
          Findings an administrator has overridden are reflected the next time a document is built,
          because the document is rendered from the current record rather than from a stored copy.
          The chain head printed on it changes accordingly, which is the point of printing it.
        </span>
      </p>
    </div>
  )
}

/**
 * One visit, with its two documents.
 *
 * The visit id is a button rather than a link because the row already carries two
 * other buttons, and nesting an anchor between them makes the whole row a
 * guessing game for a keyboard. `busy` is the parent's single key, so the two
 * buttons on this row disable each other and every other row's as well — the
 * server writes each document to one path per inspection and two overlapping
 * requests would race for it.
 */
function VisitRow({ row: r, busy, onOpen, onDownload, t }) {
  const draft = r.status === 'draft'
  const mine = busy != null && busy.endsWith(`:${r.id}`)
  const locked = busy != null && !mine

  return (
    <Tr>
      <Td>
        <button
          type="button"
          onClick={onOpen}
          className="group flex flex-col items-start text-left"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="nn-mono text-caption text-ink-3">#{r.id}</span>
            <span className="text-small font-medium text-ink group-hover:text-accent-text">
              {r.shopName}
            </span>
            {draft && <Pill family="na">{t('inspection.draft')}</Pill>}
            {r.inScope === false && <Pill family="na">{t('result.out_of_scope')}</Pill>}
          </span>
          <span className="mt-0.5 block text-caption text-ink-3">
            {prettyDay(r.date)}
            {r.shopCity ? ` · ${r.shopCity}` : ''}
            {r.signature === 'refused' ? ` · ${t('inspection.refused')}` : ''}
            {r.signature === 'unavailable' ? ` · ${t('inspection.unavailable')}` : ''}
          </span>
        </button>
      </Td>

      <Td>
        <span className="flex items-center gap-2">
          <Users size={14} strokeWidth={1.8} className="shrink-0 text-ink-3" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-small text-ink">{r.officerName}</span>
            {r.officerCode && (
              <span className="nn-mono block text-caption text-ink-3">{r.officerCode}</span>
            )}
          </span>
        </span>
      </Td>

      <Td align="right" className="tabular-nums text-ink">
        {r.scans}
      </Td>

      <Td align="right">
        <span className="flex flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={Download}
            loading={busy === `docx:${r.id}`}
            disabled={locked || r.scans === 0}
            disabledReason={
              r.scans === 0
                ? 'This visit holds no package, so the document would list only the shop.'
                : 'Another document is being generated.'
            }
            onClick={() => onDownload(r, 'docx')}
          >
            Word
          </Button>
          <Button
            size="sm"
            icon={FileText}
            loading={busy === `pdf:${r.id}`}
            disabled={locked || r.scans === 0}
            disabledReason={
              r.scans === 0
                ? 'This visit holds no package, so the document would list only the shop.'
                : 'Another document is being generated.'
            }
            onClick={() => onDownload(r, 'pdf')}
          >
            PDF
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={FileSpreadsheet}
            loading={busy === `xlsx:${r.id}`}
            disabled={locked || r.scans === 0}
            disabledReason={
              r.scans === 0
                ? 'This visit holds no package, so the document would list only the shop.'
                : 'Another document is being generated.'
            }
            onClick={() => onDownload(r, 'xlsx')}
          >
            Excel
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={Download}
            loading={busy === `csv:${r.id}`}
            disabled={locked || r.scans === 0}
            disabledReason={
              r.scans === 0
                ? 'This visit holds no package, so the document would list only the shop.'
                : 'Another document is being generated.'
            }
            onClick={() => onDownload(r, 'csv')}
          >
            CSV
          </Button>
        </span>
      </Td>
    </Tr>
  )
}
