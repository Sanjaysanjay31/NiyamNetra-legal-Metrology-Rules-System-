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
  useInspectorData,
  violationsByRule,
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
  const { violationRows, loading } = useInspectorData()

  const [query, setQuery] = useState('')
  const [selectedRule, setSelectedRule] = useState('')
  const [preset, setPreset] = useState('all')

  const debouncedQuery = useDebounced(query, 250)

  const allViolations = useMemo(() => {
    return violationRows ?? []
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
    return Array.from(set)
  }, [allViolations])

  const byRule = useMemo(() => violationsByRule(allViolations), [allViolations])
  const topRule = byRule[0] ?? null
  const affectedStores = useMemo(() => new Set(allViolations.map((v) => v.shopName).filter(Boolean)).size, [allViolations])
  const affectedScans = useMemo(() => new Set(allViolations.map((v) => v.scan_id || v.id).filter(Boolean)).size, [allViolations])

  return (
    <div className="flex flex-col gap-6 pb-12">
      <PageHeader
        eyebrow="Statutory Enforcement"
        title="Detected Violations"
        subtitle="Contraventions and breaches detected under the Legal Metrology (Packaged Commodities) Rules 2011 across your inspections."
      />

      {/* ------------------------------------------------ summary metrics -- */}
      <section className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-caption font-medium text-ink-3">Total Violations</p>
          <p className="nn-mono mt-1 text-display font-bold text-rose-600 dark:text-rose-400">
            {allViolations.length}
          </p>
          <p className="mt-1 text-caption text-ink-3">Recorded on official visits</p>
        </Card>

        <Card className="p-4">
          <p className="text-caption font-medium text-ink-3">Most Frequent Breach</p>
          <p className="mt-1 text-h2 font-bold text-ink">{topRule ? (topRule.rule || topRule.check_id) : '—'}</p>
          <p className="mt-1 text-caption text-ink-3">{topRule ? (topRule.title || `${topRule.count} occurrences`) : 'No breaches'}</p>
        </Card>

        <Card className="p-4">
          <p className="text-caption font-medium text-ink-3">Non-Compliant Packages</p>
          <p className="nn-mono mt-1 text-display font-bold text-ink">{affectedScans}</p>
          <p className="mt-1 text-caption text-ink-3">
            {allViolations.length > 0 ? `Across ${affectedStores} commercial store${affectedStores === 1 ? '' : 's'}` : 'No stores affected'}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-caption font-medium text-ink-3">Action Recommended</p>
          <p className="mt-1 text-h2 font-bold text-amber-600 dark:text-amber-400">
            {allViolations.length > 0 ? 'Statutory Notice' : '—'}
          </p>
          <p className="mt-1 text-caption text-ink-3">
            {allViolations.length > 0 ? 'Improvement & compounding' : 'No action needed'}
          </p>
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
