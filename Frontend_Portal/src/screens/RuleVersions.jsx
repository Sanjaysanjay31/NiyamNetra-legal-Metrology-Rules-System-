/**
 * Rule Versions — the gazette readings and historical statutory catalog.
 *
 * Sequence of statutory versions:
 *   1. 2009 — Legal Metrology Act, 2009 (Parent Act No. 1 of 2010)
 *   2. 2011 — Legal Metrology (Packaged Commodities) Rules, 2011 (Principal Rules)
 *   3. 2017 — 2017 Amendment Rules (E-commerce mandate, sticker ban, revised font heights)
 *   4. 2022 — 2022 Amendment Rules (Unit Sale Price mandate, 25kg/50kg deregulation - Active)
 *
 * Each version provides an Action to view the exact statutory rules in force at that particular time.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  ChevronRight,
  Download,
  Eye,
  Info,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  Search,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { endpoints } from '../api/client'
import { useDocumentTitle, useResource } from '../lib/hooks'
import { RULE_VERSIONS_DATA } from '../mock/ruleVersionsData'
import {
  Button,
  Callout,
  Card,
  cx,
  DemoChip,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
  useToast,
} from '../ui'

function dateLabel(s) {
  if (!s) return '—'
  try {
    return format(parseISO(s), 'd MMM yyyy')
  } catch {
    return s
  }
}

function isActiveRow(r) {
  if (typeof r.is_active === 'boolean') return r.is_active
  return !r.effective_to
}

/**
 * Modal displaying the exact statutory rules in force at the selected version.
 */
function RulesAtVersionModal({ version, onClose }) {
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('all')

  if (!version) return null

  const rules = version.rules ?? []
  const categories = Array.from(new Set(rules.map((r) => r.category)))

  const filteredRules = rules.filter((r) => {
    if (category !== 'all' && r.category !== category) return false
    if (q) {
      const query = q.toLowerCase()
      const matchSec = r.section?.toLowerCase().includes(query)
      const matchTitle = r.title?.toLowerCase().includes(query)
      const matchText = r.text?.toLowerCase().includes(query)
      const matchCat = r.category?.toLowerCase().includes(query)
      return matchSec || matchTitle || matchText || matchCat
    }
    return true
  })

  function printRules() {
    const printWin = window.open('', '_blank')
    if (printWin) {
      printWin.document.write(`<!DOCTYPE html>
      <html>
      <head>
        <title>NiyamNetra — Rules in Force: ${version.name}</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 24px; font-size: 12px; color: #111; line-height: 1.5; }
          h1 { color: #0b1f3a; font-size: 20px; margin-bottom: 2px; }
          .meta { color: #475569; font-size: 11px; margin-bottom: 16px; }
          .summary { background: #f1f5f9; padding: 12px; border-left: 4px solid #0b1f3a; border-radius: 4px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #0b1f3a; color: #fff; padding: 8px; text-align: left; font-size: 11px; }
          td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
          tr:nth-child(even) { background: #f8fafc; }
          .sec { font-family: monospace; font-weight: bold; color: #0b1f3a; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${version.name}</h1>
        <div class="meta">
          <strong>Gazette Ref:</strong> ${version.gazette_ref} &middot;
          <strong>Effective:</strong> ${version.effective_from} to ${version.effective_to || 'Present'} &middot;
          <strong>Status:</strong> ${version.status}
        </div>
        <div class="summary">
          <strong>Regulatory Framework:</strong> ${version.summary}
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 18%;">Section / Rule</th>
              <th style="width: 25%;">Subject</th>
              <th style="width: 15%;">Category</th>
              <th>Statutory Requirement</th>
            </tr>
          </thead>
          <tbody>
            ${filteredRules
              .map(
                (r) => `<tr>
              <td class="sec">${r.section}</td>
              <td><strong>${r.title}</strong></td>
              <td>${r.category}</td>
              <td>${r.text}</td>
            </tr>`
              )
              .join('')}
          </tbody>
        </table>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>`)
      printWin.document.close()
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={version.name}
      description={version.gazette_ref}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" icon={Download} onClick={printRules}>
            Print / Export Rules
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Effective status badge & period */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-divider bg-surface-2 p-3 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">Effective Window:</span>
            <span className="nn-mono text-ink-2">
              {dateLabel(version.effective_from)} – {version.effective_to ? dateLabel(version.effective_to) : 'Present'}
            </span>
          </div>
          <span
            className={cx(
              'nn-badge rounded-pill border px-2.5 py-0.5 text-[11px] font-semibold',
              version.is_active
                ? 'border-pass-border bg-pass-fill text-pass-text'
                : 'border-divider bg-surface text-ink-3'
            )}
          >
            {version.status}
          </span>
        </div>

        {/* Regulatory Summary */}
        <Callout family="info" title="Statutory Framework at this Version" icon={Info}>
          {version.summary}
        </Callout>

        {/* Filter / Search inside Modal */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search
              size={14}
              strokeWidth={2}
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3"
            />
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search rules, sections, keywords..."
              className="pl-8 text-[12px]"
            />
          </div>

          <div className="w-44">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter rules by category"
              className="text-[12px]"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Table of Rules in Force */}
        <div className="overflow-x-auto rounded-md border border-divider">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-divider bg-surface-2 text-left">
                <th className="nn-eyebrow whitespace-nowrap px-3.5 py-2.5">Rule / Section</th>
                <th className="nn-eyebrow whitespace-nowrap px-3.5 py-2.5">Subject</th>
                <th className="nn-eyebrow whitespace-nowrap px-3.5 py-2.5">Category</th>
                <th className="nn-eyebrow whitespace-nowrap px-3.5 py-2.5">Statutory Text</th>
                <th className="nn-eyebrow whitespace-nowrap px-3.5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                    No rules match the search query "{q}".
                  </td>
                </tr>
              ) : (
                filteredRules.map((r, i) => (
                  <tr
                    key={i}
                    className="border-b border-divider transition-colors duration-fast last:border-b-0 hover:bg-surface-2/60"
                  >
                    <td className="whitespace-nowrap px-3.5 py-3 font-mono font-semibold text-ink">
                      {r.section}
                    </td>
                    <td className="px-3.5 py-3 font-medium text-ink min-w-[140px]">
                      {r.title}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap text-ink-2">
                      <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-3">
                        {r.category}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-ink-2 min-w-[240px]">
                      <p className="leading-relaxed">{r.text}</p>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-text">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}

/** Three-dot menu anchored to a button; closes on outside click or Escape. */
function RowMenu({ row, open, onOpenChange, onViewRules, onEdit, onToggle }) {
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onOpenChange(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${row.name}`}
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-pill text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-52 origin-top-right rounded-card border border-divider bg-surface shadow-card"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenChange(false)
              onViewRules()
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-small font-medium text-ink hover:bg-surface-2"
          >
            <Eye className="h-3.5 w-3.5 text-accent-text" aria-hidden="true" />
            View rules in force
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenChange(false)
              onEdit()
            }}
            className="flex w-full items-center gap-2 border-t border-divider px-3 py-2 text-left text-small text-ink hover:bg-surface-2"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit details
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenChange(false)
              onToggle()
            }}
            className="flex w-full items-center gap-2 border-t border-divider px-3 py-2 text-left text-small text-ink hover:bg-surface-2"
          >
            <Power className="h-3.5 w-3.5" aria-hidden="true" />
            {isActiveRow(row) ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      )}
    </div>
  )
}

function VersionDialog({ mode, row, onClose, onDone }) {
  const isCreate = mode === 'create'
  const isEdit = mode === 'edit'
  const isToggle = mode === 'toggle'

  const title = isCreate
    ? 'Add a rule version'
    : isEdit
      ? `Edit ${row?.name ?? 'rule version'}`
      : isToggle
        ? `${isActiveRow(row) ? 'Deactivate' : 'Activate'} ${row?.name ?? 'rule version'}`
        : 'Rule version'

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={
        isCreate
          ? 'A rule version represents one gazette reading. The engine stamps the currently-active version onto every scan.'
          : isEdit
            ? `${row?.name ?? 'This version'} is part of the rule catalogue. The portal can record intent, but the change itself is shipped in a new catalogue build.`
            : isToggle
              ? `${row?.name ?? 'This version'} is currently ${isActiveRow(row) ? 'active' : 'inactive'}. Toggling here records intent for the next catalogue build.`
              : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            icon={isCreate ? Plus : isEdit ? Pencil : Power}
            onClick={onDone}
          >
            {isCreate
              ? 'Record new version'
              : isEdit
                ? 'Save changes'
                : isActiveRow(row)
                  ? 'Mark for deactivation'
                  : 'Mark for activation'}
          </Button>
        </>
      }
    >
      <Callout family="info" title="Where the change actually happens" icon={Info}>
        The rule catalogue ships with the engine. Editing a version here records
        your intent, but the effective window takes effect on the next catalogue
        build — once the gazette reading is transcribed, the build is cut, and
        the engine reload picks it up.
      </Callout>

      {isEdit && row && (
        <dl className="mt-4 grid grid-cols-1 gap-3 text-small sm:grid-cols-2">
          <div>
            <dt className="text-caption text-ink-3">Effective from</dt>
            <dd className="text-ink">{dateLabel(row.effective_from)}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-3">Effective to</dt>
            <dd className="text-ink">{row.effective_to ? dateLabel(row.effective_to) : '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-caption text-ink-3">Description</dt>
            <dd className="text-ink-2">{row.description || '—'}</dd>
          </div>
        </dl>
      )}
    </Modal>
  )
}

export default function RuleVersions() {
  useDocumentTitle('Rule versions')
  const toast = useToast()

  /* ---- Fetch live rule versions from backend ---- */
  const rvRes = useResource(() => endpoints.admin.ruleVersions(), {
    fallback: RULE_VERSIONS_DATA,
    label: 'rule-versions',
  })

  const isDemo = rvRes.demo
  const isLoading = rvRes.loading

  // Strict chronological order requested: 1st 2009, next 2011, next 2017 amendments, next 2022 amendments
  const sorted = useMemo(() => {
    const raw = Array.isArray(rvRes.data) ? rvRes.data : []
    return [...raw].sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
  }, [rvRes.data])

  const [menuFor, setMenuFor] = useState(null)
  const [viewingRules, setViewingRules] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [toggleRow, setToggleRow] = useState(null)

  return (
    <div className="nn-admin-page mx-auto max-w-[1200px]">
      {/* Breadcrumb + title + add action */}
      <nav className="mb-2 flex items-center gap-1 text-caption text-ink-3" aria-label="Breadcrumb">
        <Link to="/admin" className="hover:text-ink-2">
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium text-ink-2">Rule Versions</span>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">Rule Versions</h1>
          {isDemo && <DemoChip />}
          <p className="mt-1 text-small text-ink-2">
            Gazette readings and statutory frameworks governing Legal Metrology inspections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button icon={Plus} onClick={() => setCreateOpen(true)}>
            Add Rule Version
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="mt-5 p-0">
        <div className="overflow-x-auto">
          <Table
            className="min-w-[820px]"
            caption={`${sorted.length} rule versions.`}
          >
            <thead>
              <tr>
                <Th>Version Name</Th>
                <Th>Gazette / Statute Reference</Th>
                <Th>Effective From</Th>
                <Th>Effective To</Th>
                <Th>Description</Th>
                <Th>Status</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title="No rule versions yet"
                      body="Add the first gazette reading so the engine has a version to stamp onto scans."
                    />
                  </td>
                </tr>
              ) : (
                sorted.map((r) => {
                  const active = isActiveRow(r)
                  return (
                    <Tr key={r.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="block text-small font-bold text-ink">{r.name}</span>
                          <span className="nn-mono rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">
                            {r.year}
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <span className="text-small font-mono text-[11px] text-ink-2">
                          {r.gazette_ref}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-small nn-mono text-ink-2">
                          {dateLabel(r.effective_from)}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-small nn-mono text-ink-2">
                          {r.effective_to ? dateLabel(r.effective_to) : 'Present'}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-small text-ink-2 max-w-[260px] line-clamp-2">
                          {r.description || '—'}
                        </span>
                      </Td>
                      <Td>
                        {active ? (
                          <StatusBadge family="pass" label="Active" />
                        ) : r.status === 'Archived' ? (
                          <StatusBadge family="na" label="Archived" />
                        ) : (
                          <StatusBadge family="review" label="Superceded" />
                        )}
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={Eye}
                            onClick={() => setViewingRules(r)}
                            className="font-semibold"
                          >
                            View Rules
                          </Button>
                          <RowMenu
                            row={r}
                            open={menuFor === r.id}
                            onOpenChange={(open) => setMenuFor(open ? r.id : null)}
                            onViewRules={() => setViewingRules(r)}
                            onEdit={() => {
                              setMenuFor(null)
                              setEditRow(r)
                            }}
                            onToggle={() => {
                              setMenuFor(null)
                              setToggleRow(r)
                            }}
                          />
                        </div>
                      </Td>
                    </Tr>
                  )
                })
              )}
            </tbody>
          </Table>
        </div>
      </Card>

      <Callout
        family="info"
        className="mt-5"
        icon={Info}
        title="Regulatory Framework Timeline"
      >
        Click <strong>View Rules</strong> on any statutory version to inspect the exact Legal Metrology provisions,
        gazette mandates, and declaration requirements enforced during that period.
      </Callout>

      {/* Rules In Force Modal */}
      {viewingRules && (
        <RulesAtVersionModal
          version={viewingRules}
          onClose={() => setViewingRules(null)}
        />
      )}

      {/* Create / Edit / Toggle Dialogs */}
      {createOpen && (
        <VersionDialog
          mode="create"
          onClose={() => setCreateOpen(false)}
          onDone={() => {
            setCreateOpen(false)
            toast.push({ family: 'pass', title: 'Rule version draft created' })
          }}
        />
      )}
      {editRow && (
        <VersionDialog
          mode="edit"
          row={editRow}
          onClose={() => setEditRow(null)}
          onDone={() => {
            setEditRow(null)
            toast.push({ family: 'pass', title: 'Rule version updated' })
          }}
        />
      )}
      {toggleRow && (
        <VersionDialog
          mode="toggle"
          row={toggleRow}
          onClose={() => setToggleRow(null)}
          onDone={() => {
            setToggleRow(null)
            toast.push({ family: 'pass', title: 'Rule version status updated' })
          }}
        />
      )}
    </div>
  )
}
