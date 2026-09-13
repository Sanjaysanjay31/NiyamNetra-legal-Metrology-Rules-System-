/**
 * Inspection history — every completed visit on the officer's record.
 *
 * The list endpoint carries no filter parameters and no verdict per visit, so
 * the filtering happens in this browser over the full scoped list, and the
 * count above the table says so. Filters: text search (shop, product, ID),
 * a date window, status, product, shop and the rule breached — the last one
 * reads the per-package findings, so a visit matches when any of its packages
 * breached the chosen rule.
 *
 * This is a review surface. There is no new-inspection action here and no
 * capture anywhere in the portal; the field app creates records, the portal
 * reads them.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, subDays } from 'date-fns'
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Clock,
  HelpCircle,
  PenLine,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react'
import { useI18n } from '../i18n'
import {
  inspectionLabel,
  INSPECTION_STATUS,
  STATUS_META,
  useInspectorData,
} from '../lib/inspector'
import { useDebounced, useDocumentTitle } from '../lib/hooks'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pill,
  Select,
  Table,
  Td,
  Th,
  Tr,
  cx,
} from '../ui'

const STATUS_ICONS = {
  compliant: CheckCircle,
  non_compliant: AlertTriangle,
  needs_review: Clock,
  out_of_scope: HelpCircle,
  draft: PenLine,
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: INSPECTION_STATUS.COMPLIANT, label: 'Compliant' },
  { value: INSPECTION_STATUS.NON_COMPLIANT, label: 'Non-Compliant' },
  { value: INSPECTION_STATUS.NEEDS_REVIEW, label: 'Needs Review' },
  { value: INSPECTION_STATUS.OUT_OF_SCOPE, label: 'Out of scope' },
  { value: INSPECTION_STATUS.DRAFT, label: 'Draft' },
]

const PRESETS = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All dates', days: null },
]

const iso = (d) => format(d, 'yyyy-MM-dd')

function StatusPill({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft
  const Icon = STATUS_ICONS[status] ?? HelpCircle
  return (
    <Pill family={meta.family} icon={Icon}>
      {meta.label}
    </Pill>
  )
}

function prettyDay(value) {
  if (!value) return '—'
  try {
    return format(parseISO(value), 'd MMM yyyy')
  } catch {
    return String(value)
  }
}

export default function InspectorInspections() {
  const { t } = useI18n()
  const navigate = useNavigate()
  useDocumentTitle(t('nav.inspections'))
  const { rows, violationRows, loading } = useInspectorData()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [product, setProduct] = useState('')
  const [shop, setShop] = useState('')
  const [rule, setRule] = useState('')
  const [preset, setPreset] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const debouncedQuery = useDebounced(query, 250)

  /* Distinct filter option lists, built from the rows themselves. */
  const shopOptions = useMemo(
    () =>
      [...new Map(rows.map((r) => [r.shopName, r])).values()].sort((a, b) =>
        a.shopName.localeCompare(b.shopName)
      ),
    [rows]
  )
  const productOptions = useMemo(() => {
    const names = new Set()
    for (const r of rows) for (const p of r.products) names.add(p)
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [rows])
  const ruleOptions = useMemo(() => {
    const seen = new Map()
    for (const v of violationRows) seen.set(v.check_id, v.title)
    return [...seen.entries()].map(([id, title]) => ({ id, title }))
  }, [violationRows])

  /* The date window. A preset writes a window directly; a manual date input
     always wins over the preset, and what the inputs show is what filters. */
  const presetDays = preset === 'all' || preset === 'custom' ? null : Number(preset)
  const presetFrom = presetDays ? iso(subDays(new Date(), presetDays - 1)) : ''
  const presetTo = presetDays ? iso(new Date()) : ''
  const effFrom = from || presetFrom
  const effTo = to || presetTo

  /* The rule filter reads findings, so it matches through the violation rows:
     a visit appears when one of its packages breached the chosen rule. */
  const ruleInspections = useMemo(() => {
    if (!rule) return null
    return new Set(violationRows.filter((v) => v.check_id === rule).map((v) => v.inspection_id))
  }, [rule, violationRows])

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    return rows.filter((r) => {
      if (status && r.status !== status) return false
      if (shop && r.shopName !== shop) return false
      if (product && !r.products.includes(product)) return false
      if (ruleInspections && !ruleInspections.has(r.id)) return false
      if (effFrom && r.inspection_date && r.inspection_date < effFrom) return false
      if (effTo && r.inspection_date && r.inspection_date > effTo) return false
      if (q) {
        const hay = [inspectionLabel(r.id), r.shopName, r.shopCity, r.products.join(' '), r.status]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, debouncedQuery, status, shop, product, ruleInspections, effFrom, effTo])

  const activeFilters = [query, status, product, shop, rule, effFrom || effTo].filter(Boolean).length

  const clearAll = () => {
    setQuery('')
    setStatus('')
    setProduct('')
    setShop('')
    setRule('')
    setPreset('all')
    setFrom('')
    setTo('')
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('nav.inspections')}
        title="Inspection history"
        subtitle="Every visit on your record — search it, filter it, and open the full inspection with its evidence and findings."
      />

      {/* ------------------------------------------------------ filters -- */}
      <Card className="p-5">
        <div className="grid gap-x-5 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Search" hint="Shop, city, product or inspection ID.">
            {(props) => (
              <Input
                {...props}
                type="search"
                icon={Search}
                placeholder="e.g. Shivneri, rice, INS-771"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
          </Field>

          <Field label="Status">
            {(props) => (
              <Select {...props} value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Rule violated" hint="A visit matches when any package breached the rule.">
            {(props) => (
              <Select {...props} value={rule} onChange={(e) => setRule(e.target.value)}>
                <option value="">Any rule</option>
                {ruleOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} — {o.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Shop">
            {(props) => (
              <Select {...props} value={shop} onChange={(e) => setShop(e.target.value)}>
                <option value="">All shops</option>
                {shopOptions.map((r) => (
                  <option key={r.id} value={r.shopName}>
                    {r.shopName}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Product">
            {(props) => (
              <Select {...props} value={product} onChange={(e) => setProduct(e.target.value)}>
                <option value="">All products</option>
                {productOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Date range" hint="From and to, inclusive. The presets fill both ends.">
            {() => (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    aria-label="From date"
                    value={effFrom}
                    onChange={(e) => {
                      setFrom(e.target.value)
                      setPreset('custom')
                    }}
                  />
                  <span className="text-ink-3" aria-hidden="true">–</span>
                  <Input
                    type="date"
                    aria-label="To date"
                    value={effTo}
                    onChange={(e) => {
                      setTo(e.target.value)
                      setPreset('custom')
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPreset(String(p.id))
                        setFrom('')
                        setTo('')
                      }}
                      className={cx(
                        'rounded-pill border px-2.5 py-1 text-caption font-medium transition-colors duration-fast ease-settle',
                        preset === String(p.id)
                          ? 'border-accent bg-accent-soft text-accent-text'
                          : 'border-divider bg-surface-2 text-ink-2 hover:text-ink'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-caption text-ink-3">
            {loading
              ? 'Loading the record…'
              : `Showing ${filtered.length} of ${rows.length} inspections · filtering happens on this device — the list endpoint takes no filter parameters.`}
          </p>
          {activeFilters > 0 && (
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={clearAll}>
              Clear {activeFilters === 1 ? 'filter' : `${activeFilters} filters`}
            </Button>
          )}
        </div>
      </Card>

      {/* -------------------------------------------------------- table -- */}
      <Card className="overflow-x-auto p-5">
        {loading ? (
          <p className="text-small text-ink-2">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No inspections match"
            body="Nothing on the record matches these filters. Clear one or two — the date window and the rule filter are the usual culprits."
            action={activeFilters > 0 ? <Button size="sm" onClick={clearAll}>Clear filters</Button> : undefined}
          />
        ) : (
          <Table caption="Inspection history, newest first">
            <thead>
              <tr>
                <Th>Inspection ID</Th>
                <Th>Shop</Th>
                <Th>Product</Th>
                <Th>Date</Th>
                <Th>Status</Th>
                <Th align="right">Violations</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Tr key={r.id} onClick={() => navigate(`/inspector/inspections/${r.id}`)}>
                  <Td>
                    <span className="nn-mono text-small font-semibold text-accent-text">
                      {inspectionLabel(r.id)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-small font-medium text-ink">{r.shopName}</span>
                    {r.shopCity && <span className="block text-caption text-ink-3">{r.shopCity}</span>}
                  </Td>
                  <Td>
                    {r.productLabel ? (
                      <span className="text-small text-ink">
                        {r.productLabel}
                        {r.productCount > 1 && (
                          <span className="text-caption text-ink-3"> +{r.productCount - 1} more</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-caption text-ink-3">—</span>
                    )}
                  </Td>
                  <Td className="text-small text-ink-2">{prettyDay(r.inspection_date)}</Td>
                  <Td>
                    <StatusPill status={r.status} />
                  </Td>
                  <Td align="right">
                    {r.violations > 0 ? (
                      <span className="nn-mono inline-flex items-center rounded-pill bg-violation-fill px-2 py-0.5 text-caption font-bold text-violation-text">
                        {r.violations}
                      </span>
                    ) : (
                      <span className="text-caption text-ink-3">—</span>
                    )}
                  </Td>
                  <Td align="right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/inspector/inspections/${r.id}`)
                      }}
                    >
                      View
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}

        {filtered.length > 0 && (
          <p className="mt-4 flex items-center justify-end gap-1 text-caption text-ink-3">
            Sorted newest first <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
          </p>
        )}
      </Card>
    </div>
  )
}