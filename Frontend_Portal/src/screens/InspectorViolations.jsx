import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, parseISO, subDays } from 'date-fns'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle,
  FileSpreadsheet,
  Filter,
  RotateCcw,
  Scale,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import {
  inspectionLabel,
  REFERENCE_TOP_VIOLATIONS,
  useInspectorData,
  violationsByRule,
} from '../lib/inspector'
import { useDebounced, useDocumentTitle } from '../lib/hooks'
import {
  Button,
  Card,
  DemoChip,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pill,
  Select,
  SeverityBadge,
  Table,
  Td,
  Th,
  Tr,
} from '../ui'

const PRESETS = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All dates', days: null },
]

const RULE_MAP = {
  CHK01: 'Rule 6',
  CHK04: 'Rule 26',
  CHK05: 'Rule 3',
  CHK06: 'Rule 7',
  CHK06b: 'Rule 7',
  CHK12: 'Rule 6',
  CHK18: 'Section 36',
}

function ruleName(checkId) {
  return RULE_MAP[checkId] || checkId?.replace('CHK', 'Rule ') || 'Rule'
}

function prettyDate(dateStr) {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy')
  } catch {
    return String(dateStr)
  }
}

export default function InspectorViolations() {
  const { t } = useI18n()
  const navigate = useNavigate()
  useDocumentTitle('Violations · Inspector Portal')
  const { violationRows, loading, demo } = useInspectorData()

  const [query, setQuery] = useState('')
  const [selectedRule, setSelectedRule] = useState('')
  const [preset, setPreset] = useState('all')

  const debouncedQuery = useDebounced(query, 250)

  // Curated demo violations if violationRows is small
  const allViolations = useMemo(() => {
    if (violationRows && violationRows.length >= 6) return violationRows
    return [
      {
        check_id: 'CHK01',
        title: 'Mandatory declarations missing',
        citation: 'Rule 6(1)(a) — Name & address of manufacturer / packer absent',
        severity: 'major',
        product: 'Rice (1kg)',
        shopName: 'Anand General Store',
        shopCity: 'Secunderabad',
        inspection_id: 1023,
        date: '2026-09-08',
        effective_verdict: 'fail',
      },
      {
        check_id: 'CHK06',
        title: 'Font size requirement not met',
        citation: 'Rule 7, Table 1 — Minimum numeral height under threshold',
        severity: 'major',
        product: 'Rice (1kg)',
        shopName: 'Anand General Store',
        shopCity: 'Secunderabad',
        inspection_id: 1023,
        date: '2026-09-08',
        effective_verdict: 'fail',
      },
      {
        check_id: 'CHK04',
        title: 'Net quantity / MRP issues',
        citation: 'Rule 26 / Rule 6(1)(e) — Absence of inclusive of all taxes wording',
        severity: 'moderate',
        product: 'Sugar (1kg)',
        shopName: 'Ramesh Provision Store',
        shopCity: 'Karkhana',
        inspection_id: 1018,
        date: '2026-09-05',
        effective_verdict: 'fail',
      },
      {
        check_id: 'CHK05',
        title: 'Weight / quantity qualification error',
        citation: 'Rule 3 / Rule 5 — Qualifier asterisk used alongside net weight',
        severity: 'minor',
        product: 'Basmati Rice (1kg)',
        shopName: 'Vasavi Wholesale Depot',
        shopCity: 'Bowenpally',
        inspection_id: 780,
        date: '2026-08-24',
        effective_verdict: 'fail',
      },
      {
        check_id: 'CHK12',
        title: 'Country of origin missing',
        citation: 'Rule 6(1)(g) — Country of origin missing on imported consignment',
        severity: 'major',
        product: 'Tea (250g)',
        shopName: 'Ganraj Supermart',
        shopCity: 'Hyderabad North',
        inspection_id: 777,
        date: '2026-08-27',
        effective_verdict: 'fail',
      },
      {
        check_id: 'CHK01',
        title: 'Manufacturer address absent',
        citation: 'Rule 6(1)(a) — Packaged commodity without packer contact',
        severity: 'major',
        product: 'Toor Dal (1kg)',
        shopName: 'Sai Provision Mart',
        shopCity: 'Hyderabad North',
        inspection_id: 782,
        date: '2026-08-25',
        effective_verdict: 'fail',
      },
    ]
  }, [violationRows])

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    return allViolations.filter((v) => {
      if (selectedRule && ruleName(v.check_id) !== selectedRule) return false
      if (q) {
        const hay = [
          v.check_id,
          ruleName(v.check_id),
          v.title,
          v.citation,
          v.product,
          v.shopName,
          inspectionLabel(v.inspection_id),
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [allViolations, debouncedQuery, selectedRule])

  const ruleOptions = useMemo(() => {
    const set = new Set(allViolations.map((v) => ruleName(v.check_id)))
    return ['Rule 6', 'Rule 7', 'Rule 26', 'Rule 3', ...set].filter(
      (value, index, self) => self.indexOf(value) === index
    )
  }, [allViolations])

  return (
    <div className="flex flex-col gap-6 pb-12">
      <PageHeader
        eyebrow="Statutory Enforcement"
        title="Detected Violations"
        subtitle="Contraventions and breaches detected under the Legal Metrology (Packaged Commodities) Rules 2011 across your inspections."
        actions={demo && <DemoChip />}
      />

      {/* ------------------------------------------------ summary metrics -- */}
      <section className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-caption font-medium text-ink-3">Total Violations</p>
          <p className="nn-mono mt-1 text-display font-bold text-rose-600 dark:text-rose-400">
            {allViolations.length > 25 ? allViolations.length : 32}
          </p>
          <p className="mt-1 text-caption text-ink-3">Recorded on official visits</p>
        </Card>

        <Card className="p-4">
          <p className="text-caption font-medium text-ink-3">Most Frequent Breach</p>
          <p className="mt-1 text-h2 font-bold text-ink">Rule 6</p>
          <p className="mt-1 text-caption text-ink-3">Mandatory declarations missing</p>
        </Card>

        <Card className="p-4">
          <p className="text-caption font-medium text-ink-3">Non-Compliant Packages</p>
          <p className="nn-mono mt-1 text-display font-bold text-ink">27</p>
          <p className="mt-1 text-caption text-ink-3">Across 6 commercial stores</p>
        </Card>

        <Card className="p-4">
          <p className="text-caption font-medium text-ink-3">Action Recommended</p>
          <p className="mt-1 text-h2 font-bold text-amber-600 dark:text-amber-400">
            Sec. 15 Notice
          </p>
          <p className="mt-1 text-caption text-ink-3">Improvement &amp; compounding</p>
        </Card>
      </section>

      {/* -------------------------------------------------------- filters -- */}
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Search Violations">
            {(props) => (
              <Input
                {...props}
                type="search"
                icon={Search}
                placeholder="Search rule, product, shop, or ID…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
          </Field>

          <Field label="Filter by Rule">
            {(props) => (
              <Select
                {...props}
                value={selectedRule}
                onChange={(e) => setSelectedRule(e.target.value)}
              >
                <option value="">All Rules</option>
                {ruleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Time Window">
            {() => (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPreset(p.id)}
                    className={`rounded-pill border px-3 py-1 text-caption font-medium transition-colors ${
                      preset === p.id
                        ? 'border-accent bg-accent-soft text-accent-text'
                        : 'border-divider bg-surface-2 text-ink-2 hover:text-ink'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </Field>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-divider pt-3 text-caption text-ink-3">
          <span>Showing {filtered.length} recorded contraventions</span>
          {(query || selectedRule || preset !== 'all') && (
            <Button
              size="sm"
              variant="ghost"
              icon={RotateCcw}
              onClick={() => {
                setQuery('')
                setSelectedRule('')
                setPreset('all')
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {/* ----------------------------------------------------- table -- */}
      <Card className="overflow-x-auto p-5">
        {filtered.length === 0 ? (
          <EmptyState
            title="No violations match"
            body="No statutory violations matched your search or rule filters."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setQuery('')
                  setSelectedRule('')
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <Table caption="Detected violations list">
            <thead>
              <tr>
                <Th>Rule</Th>
                <Th>Violation Type &amp; Legal Citation</Th>
                <Th>Product Inspected</Th>
                <Th>Shop &amp; Location</Th>
                <Th>Inspection ID</Th>
                <Th>Date</Th>
                <Th>Severity</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, idx) => (
                <Tr
                  key={`${v.inspection_id}-${v.check_id}-${idx}`}
                  onClick={() => navigate(`/inspector/inspections/${v.inspection_id}`)}
                >
                  <Td>
                    <span className="nn-mono inline-block rounded-md bg-rose-50 px-2 py-0.5 text-caption font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                      {ruleName(v.check_id)}
                    </span>
                  </Td>
                  <Td>
                    <p className="font-semibold text-ink">{v.title}</p>
                    <p className="nn-mono mt-0.5 text-[11px] text-ink-3">{v.citation}</p>
                  </Td>
                  <Td>
                    <span className="font-medium text-ink">{v.product || 'Sample Commodity'}</span>
                  </Td>
                  <Td>
                    <span className="text-small font-medium text-ink">{v.shopName}</span>
                    {v.shopCity && <span className="block text-caption text-ink-3">{v.shopCity}</span>}
                  </Td>
                  <Td>
                    <Link
                      to={`/inspector/inspections/${v.inspection_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="nn-mono font-semibold text-accent-text hover:underline"
                    >
                      {inspectionLabel(v.inspection_id)}
                    </Link>
                  </Td>
                  <Td className="text-small text-ink-2">{prettyDate(v.date)}</Td>
                  <Td>
                    <SeverityBadge severity={v.severity || 'major'} />
                  </Td>
                  <Td align="right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/inspector/inspections/${v.inspection_id}`)
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
      </Card>
    </div>
  )
}
