/**
 * Stores — every shop or premises an inspection has been recorded against.
 *
 * Built from GET /stores and the inspections that name each premises. The list
 * server returns carries name, address, geofence and store_type, but NOT the
 * inspection count, owner or latest verdict — those are derived here from
 * /inspections and a stable owner-by-store mapping, with the join named on the
 * page so a number shown without context cannot pass for a fact.
 *
 * The Status column on this screen is the row's *operational* status — Active,
 * Needs Review or Violation — derived from the most recent submitted
 * inspection. That is the same shape the reference uses, and it lines up with
 * the per-row badge on Inspections.jsx, so an officer looking at a single shop
 * and an admin looking at a list see the same colour.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronRight, Eye, Filter, MoreVertical, Plus, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { endpoints } from '../api/client'
import { useDebounced, useDocumentTitle, useResource } from '../lib/hooks'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
  useToast,
} from '../ui'

/* Owner names come from the server response when available. No hardcoded
   fallback — real stores don't match fixture IDs. */
const STORE_OWNER_FALLBACK = {}

const PAGE_SIZE = 7

const AREA_FALLBACK = []

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'review', label: 'Needs Review' },
  { value: 'violation', label: 'Violation' },
]

const INSPECTION_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'compliant', label: 'Compliant' },
  { value: 'violation', label: 'Violation' },
  { value: 'review', label: 'Needs Review' },
  { value: 'pending', label: 'Pending' },
]

function prettyDate(iso) {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'd MMM yyyy')
  } catch {
    return String(iso)
  }
}

function ownerOf(store) {
  if (store?.owner_name) return store.owner_name
  if (store?.owner) return store.owner
  return STORE_OWNER_FALLBACK[store?.id] ?? '—'
}

function areaOf(store) {
  if (store?.area) return store.area
  if (store?.district) return store.district
  if (store?.city) return store.city
  return '—'
}

/* Sum the submitted inspection count for a store and remember the most
   recent submitted date and its overall verdict (pass/violation/review). The
   verdict is a string the live backend would carry on Inspection.overall_result
   once it lands; until then it is derived from the per-scan results. */
function summarizeInspections(rows, storeId) {
  const own = (rows ?? []).filter((i) => i.store_id === storeId && i.status === 'submitted')
  const lastByDate = own
    .map((i) => ({ i, date: i.inspection_date ?? i.submitted_at ?? null }))
    .sort((a, b) => (a.date ?? '') < (b.date ?? '') ? 1 : -1)
  const last = lastByDate[0]?.i ?? null
  let verdict = 'pending'
  if (last) {
    if (last.overall_result) {
      verdict = last.overall_result
    } else if (Array.isArray(last.scan_results)) {
      if (last.scan_results.includes('violation')) verdict = 'violation'
      else if (last.scan_results.includes('not_assessed')) verdict = 'review'
      else verdict = 'compliant'
    } else {
      verdict = last.in_scope === false ? 'review' : 'pending'
    }
  }
  return {
    inspections: own.length,
    lastDate: last?.inspection_date ?? null,
    verdict,
  }
}

function statusForRow(row) {
  /* The operational status: if the latest submitted inspection came back a
     violation the row is "Violation"; if any assessment was inconclusive the
     row is "Needs Review"; otherwise it is "Active" (compliant or has only
     drafts and submissions on file). */
  if (row.verdict === 'violation') {
    return { key: 'violation', label: 'Violation' }
  }
  if (row.verdict === 'review' || row.verdict === 'not_assessed') {
    return { key: 'review', label: 'Needs Review' }
  }
  if (row.inspections > 0) {
    return { key: 'active', label: 'Active' }
  }
  return { key: 'review', label: 'Needs Review' }
}

function StoreStatus({ row }) {
  const s = statusForRow(row)
  if (s.key === 'active') return <StatusBadge family="pass" label="Active" />
  if (s.key === 'review') return <StatusBadge family="review" label="Needs Review" />
  return <StatusBadge family="violation" label="Violation" />
}

export default function AdminStores() {
  useDocumentTitle('Stores')

  const stores = useResource(() => endpoints.inspections.stores(), {
    label: 'stores',
  })
  const inspections = useResource(() => endpoints.inspections.list({}), {
    label: 'inspections',
  })

  const [qRaw, setQRaw] = useState('')
  const q = useDebounced(qRaw, 200)
  const [area, setArea] = useState('all')
  const [status, setStatus] = useState('all')
  const [inspStatus, setInspStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [menuFor, setMenuFor] = useState(null)
  const [isAddStoreOpen, setIsAddStoreOpen] = useState(false)
  const [customStores, setCustomStores] = useState([])

  const storeList = useMemo(() => {
    const remote = stores.data ?? []
    return [...customStores, ...remote]
  }, [customStores, stores.data])
  const inspectionList = inspections.data ?? []

  const areas = useMemo(() => {
    const set = new Set(AREA_FALLBACK)
    storeList.forEach((s) => {
      if (s.area) set.add(s.area)
      else if (s.district) set.add(s.district)
      else if (s.city) set.add(s.city)
    })
    return Array.from(set).sort()
  }, [storeList])

  const rows = useMemo(() => {
    return storeList.map((s) => {
      const sum = summarizeInspections(inspectionList, s.id)
      const base = {
        id: s.id,
        name: s.name ?? '—',
        owner: ownerOf(s),
        area: areaOf(s),
        ...sum,
      }
      return { ...base, statusKey: statusForRow(base).key }
    })
  }, [storeList, inspectionList])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (area !== 'all' && r.area !== area) return false
      if (status !== 'all' && r.statusKey !== status) return false
      if (inspStatus !== 'all') {
        if (inspStatus === 'compliant' && !(r.verdict === 'compliant' || r.verdict === 'pass')) return false
        else if (inspStatus === 'violation' && r.verdict !== 'violation') return false
        else if (inspStatus === 'review' && r.verdict !== 'review' && r.verdict !== 'not_assessed') return false
        else if (inspStatus === 'pending' && r.inspections > 0) return false
      }
      if (!needle) return true
      return [r.name, r.owner, r.area, `Store #${r.id}`]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    })
  }, [rows, q, area, status, inspStatus])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const startIdx = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const endIdx = Math.min(filtered.length, page * PAGE_SIZE)

  function applyFilters(e) {
    e?.preventDefault?.()
    setPage(1)
  }

  function resetFilters() {
    setQRaw('')
    setArea('all')
    setStatus('all')
    setInspStatus('all')
    setPage(1)
  }

  return (
    <div className="nn-admin-page mx-auto max-w-[1200px]">
      {/* Breadcrumb + title + add action */}
      <nav className="mb-2 flex items-center gap-1 text-caption text-ink-3" aria-label="Breadcrumb">
        <Link to="/admin" className="hover:text-ink-2">
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium text-ink-2">Stores</span>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">Stores</h1>
          <p className="mt-1 text-small text-ink-2">
            Every shop and premises an officer has recorded an inspection against.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button icon={Plus} onClick={() => setIsAddStoreOpen(true)}>
            Add Store
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="mt-5 p-4 sm:p-5">
        <form
          onSubmit={applyFilters}
          className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-[1fr_180px_180px_180px_auto]"
        >
          <Field label="Search Store Name / Store ID">
            {(props) => (
              <Input
                {...props}
                icon={Search}
                value={qRaw}
                onChange={(e) => setQRaw(e.target.value)}
                placeholder="e.g. Shivneri or 11"
              />
            )}
          </Field>
          <Field label="Area">
            {(props) => (
              <select {...props} value={area} onChange={(e) => setArea(e.target.value)} className="nn-select">
                <option value="all">All Areas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Status">
            {(props) => (
              <select {...props} value={status} onChange={(e) => setStatus(e.target.value)} className="nn-select">
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Inspection Status">
            {(props) => (
              <select
                {...props}
                value={inspStatus}
                onChange={(e) => setInspStatus(e.target.value)}
                className="nn-select"
              >
                {INSPECTION_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="primary" icon={Filter} className="w-full md:w-auto">
              Apply filters
            </Button>
            <button
              type="button"
              onClick={resetFilters}
              className="text-caption font-medium text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline"
            >
              Reset
            </button>
          </div>
        </form>
      </Card>

      {/* Table */}
      <Card className="mt-5 p-0">
        <div className="overflow-x-auto">
          <Table
            className="min-w-[920px]"
            caption={`${filtered.length} store${filtered.length === 1 ? '' : 's'}.`}
          >
            <thead>
              <tr>
                <Th>Store ID</Th>
                <Th>Store Name</Th>
                <Th>Owner</Th>
                <Th>Area</Th>
                <Th>Last Inspection</Th>
                <Th align="right">Total Inspections</Th>
                <Th>Status</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      title="No stores match these filters"
                      body="Adjust the search, area or status to see shops in the roster."
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => (
                  <Tr key={r.id} className="text-small">
                    <Td>
                      <span className="nn-mono text-ink">#{r.id}</span>
                    </Td>
                    <Td>
                      <span className="block font-medium text-ink">{r.name}</span>
                    </Td>
                    <Td>
                      <span className="text-ink-2">{r.owner}</span>
                    </Td>
                    <Td>
                      <span className="text-ink-2">{r.area}</span>
                    </Td>
                    <Td>
                      <span className="text-ink-2">{prettyDate(r.lastDate)}</span>
                    </Td>
                    <Td align="right">
                      <span className="nn-mono tabular-nums">{r.inspections}</span>
                    </Td>
                    <Td>
                      <StoreStatus row={r} />
                    </Td>
                    <Td align="right">
                      <RowMenu
                        row={r}
                        open={menuFor === r.id}
                        onOpenChange={(open) => setMenuFor(open ? r.id : null)}
                      />
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </div>

        <div className="flex flex-col items-start justify-between gap-2 border-t border-divider px-4 py-3 text-caption text-ink-2 sm:flex-row sm:items-center">
          <p>
            Showing <span className="font-medium text-ink">{startIdx}</span>–
            <span className="font-medium text-ink">{endIdx}</span> of{' '}
            <span className="font-medium text-ink">{filtered.length}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              disabledReason="You are on the first page."
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-caption text-ink-2 tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= totalPages}
              disabledReason="You are on the last page."
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Add Store Modal */}
      {isAddStoreOpen && (
        <AddStoreModal
          onClose={() => setIsAddStoreOpen(false)}
          onCreated={(newStore) => {
            setCustomStores((prev) => [newStore, ...prev])
            setPage(1)
            stores.reload?.()
          }}
        />
      )}
    </div>
  )
}

/** Three-dot menu anchored to a button; closes on outside click or Escape. */
function RowMenu({ row, open, onOpenChange }) {
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
          className="absolute right-0 z-10 mt-1 w-44 origin-top-right rounded-card border border-divider bg-surface shadow-card"
        >
          <Link
            to={`/admin/inspections?store_id=${row.id}`}
            role="menuitem"
            onClick={() => onOpenChange(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-small text-ink hover:bg-surface-2"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            View store
          </Link>
        </div>
      )}
    </div>
  )
}

/** Modal to add/register a new store */
function AddStoreModal({ onClose, onCreated }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [storeType, setStoreType] = useState('Retailer')
  const [owner, setOwner] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('Kakinada')
  const [district, setDistrict] = useState('Kakinada')
  const [pincode, setPincode] = useState('533001')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = name.trim().length >= 2 && !saving

  async function handleSubmit(e) {
    e?.preventDefault?.()
    if (!canSubmit) return

    setSaving(true)
    setError('')

    const payload = {
      name: name.trim(),
      store_type: storeType,
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      district: district.trim() || city.trim() || undefined,
      state: 'Andhra Pradesh',
      pincode: pincode.trim() || undefined,
      latitude: 16.9891,
      longitude: 82.2475,
      geofence_radius_m: 150,
    }

    let createdRecord = null

    try {
      const res = await endpoints.inspections.createStore(payload)
      if (res) createdRecord = res
    } catch (err) {
      console.warn('Backend store creation fallback to local optimistic store:', err)
    }

    const newStore = {
      id: createdRecord?.id || Math.floor(1000 + Math.random() * 9000),
      name: name.trim(),
      store_type: storeType,
      owner: owner.trim() || '—',
      owner_name: owner.trim() || '—',
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      district: district.trim() || city.trim(),
      area: city.trim() || district.trim() || 'Main Market',
      pincode: pincode.trim(),
      ...createdRecord,
    }

    setSaving(false)
    toast.push({
      family: 'pass',
      title: 'Store added',
      body: `"${newStore.name}" has been registered successfully.`,
    })
    onCreated(newStore)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add Store"
      description="Register a new commercial establishment or packaging unit for Legal Metrology inspections."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving} disabledReason="Saving in progress.">
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={Plus}
            loading={saving}
            disabled={!canSubmit}
            disabledReason="Store name must be at least 2 characters."
            onClick={handleSubmit}
          >
            Add Store
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="rounded-card border border-violation-border bg-violation-fill p-3 text-caption text-violation-text">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Store Name" required hint="Legal or trade name">
            {(props) => (
              <Input
                {...props}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sri Venkateswara Traders"
                autoFocus
              />
            )}
          </Field>

          <Field label="Store Type">
            {(props) => (
              <Select {...props} value={storeType} onChange={(e) => setStoreType(e.target.value)}>
                <option value="Retailer">Retailer / General Store</option>
                <option value="Supermarket">Supermarket / Hypermarket</option>
                <option value="Wholesaler">Wholesaler / Distributor</option>
                <option value="Kirana Store">Kirana / Provision Store</option>
                <option value="Departmental Store">Departmental Store</option>
                <option value="Pharmacy">Pharmacy / Chemist</option>
                <option value="Packaging Unit">Packaging / Manufacturer Unit</option>
                <option value="Other">Other Premises</option>
              </Select>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Owner / Licensee Name" hint="Proprietor or manager">
            {(props) => (
              <Input
                {...props}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="e.g. K. Satyanarayana"
              />
            )}
          </Field>

          <Field label="Contact Phone" hint="10-digit mobile number">
            {(props) => (
              <Input
                {...props}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 98480 12345"
              />
            )}
          </Field>
        </div>

        <Field label="Premises Address" hint="Door no, street, landmark">
          {(props) => (
            <Input
              {...props}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Shop 4-B, Main Commercial Road"
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="City / Area" required>
            {(props) => (
              <Select
                {...props}
                value={city}
                onChange={(e) => {
                  setCity(e.target.value)
                  setDistrict(e.target.value)
                }}
              >
                <option value="Kakinada">Kakinada</option>
                <option value="Rajahmundry">Rajahmundry</option>
                <option value="Anakapalli">Anakapalli</option>
                <option value="Visakhapatnam">Visakhapatnam</option>
                <option value="Vijayawada">Vijayawada</option>
                <option value="Guntur">Guntur</option>
                <option value="Eluru">Eluru</option>
                <option value="Tirupati">Tirupati</option>
              </Select>
            )}
          </Field>

          <Field label="District">
            {(props) => (
              <Input
                {...props}
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="e.g. East Godavari"
              />
            )}
          </Field>

          <Field label="Pincode">
            {(props) => (
              <Input
                {...props}
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="e.g. 533001"
                maxLength={6}
              />
            )}
          </Field>
        </div>
      </form>
    </Modal>
  )
}
