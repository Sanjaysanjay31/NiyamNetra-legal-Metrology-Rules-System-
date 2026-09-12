/**
 * Audit trail — the tamper-evident record, read newest-first.
 *
 * The integrity guarantee here is a property of the whole chain, not of any one
 * row: each entry stores the hash of the one before it, so a single altered or
 * deleted row breaks every link after it. The server verifies that chain and
 * returns one boolean — `chain_intact` — plus the head hash. This screen leads
 * with that boolean, because an auditor's first question is not "what happened"
 * but "can I trust that this is everything that happened".
 *
 * Two honest limits of the endpoint are stated rather than hidden:
 *   - When the chain does NOT verify, the response says so but does not name the
 *     failing sequence number — so this screen reports the break without
 *     claiming to pinpoint it.
 *   - Every entry stores an IP address, but the response schema omits it. The
 *     portal cannot show it, and says as much, so nobody assumes it was never
 *     recorded.
 *
 * Paging is genuinely server-side: the endpoint takes limit/offset and returns
 * the total, so Prev/Next move a real window over the real table rather than
 * slicing a list this browser happens to hold. The actor is a bare `user_id`,
 * joined here against /admin/users exactly as the inspection list joins officer
 * names; when that join is unavailable the officer number is shown plainly.
 */

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, Info, Link2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { endpoints } from '../api/client'
import { useI18n } from '../i18n'
import { useDocumentTitle, useResource } from '../lib/hooks'
import { auditLog, usersById } from '../mock/fixtures'
import {
  Button,
  Callout,
  Card,
  DemoChip,
  EmptyState,
  PageHeader,
  Pill,
  SectionTitle,
  Table,
  Td,
  Th,
  Tr,
} from '../ui'

const PAGE_SIZE = 50

/* The exact action strings the backend writes (append_audit call sites),
   mapped to a reading label. An unknown action falls back to its raw string
   rather than being dropped — an audit view must never quietly omit a row. */
const ACTION_LABELS = {
  login: 'Signed in',
  login_failed: 'Sign-in failed',
  password_changed: 'Password changed',
  password_change_failed: 'Password change failed',
  install_reset: 'Device binding released',
  user_created: 'Inspector created',
  user_updated: 'Inspector updated',
  store_created: 'Shop created',
  inspection_created: 'Inspection created',
  inspection_submitted: 'Inspection submitted',
  scan_created: 'Package added',
  scan_updated: 'Package updated',
  image_uploaded: 'Image uploaded',
  listing_attached: 'Listing attached',
  assessed: 'Assessed',
  assessment_rerun: 'Re-assessed',
  finding_overridden: 'Finding overridden',
  review: 'Reviewed',
  prosecution: 'Prosecution recorded',
  none: 'No action',
}

/* Actions that record a human decision carry the most weight in a review, so
   they are tinted. Everything else is neutral. */
const NOTABLE = new Set(['finding_overridden', 'install_reset', 'prosecution', 'login_failed', 'password_change_failed'])

export default function Audit() {
  const { t } = useI18n()
  useDocumentTitle(t('admin.auditTrail'))
  const [offset, setOffset] = useState(0)

  const audit = useResource(() => endpoints.admin.audit({ limit: PAGE_SIZE, offset }), {
    fallback: auditLog,
    deps: [offset],
    label: t('admin.auditTrail'),
  })
  const officers = useResource(() => endpoints.admin.users(), {
    fallback: Object.values(usersById),
    label: t('admin.users'),
  })

  const env = audit.data ?? auditLog
  const entries = env.entries ?? []
  const total = env.total ?? entries.length
  const intact = env.chain_intact !== false
  const head = env.chain_head

  const userById = useMemo(
    () => new Map((officers.data ?? []).map((u) => [u.id, u])),
    [officers.data]
  )
  const actorLabel = (id) => {
    if (id == null) return 'System / unauthenticated'
    const u = userById.get(id)
    return u ? `${u.full_name} · ${u.employee_id}` : `Officer #${id}`
  }

  const first = total === 0 ? 0 : offset + 1
  const last = Math.min(offset + entries.length, total)
  const hasPrev = offset > 0
  const hasNext = offset + PAGE_SIZE < total
  const demo = audit.demo

  return (
    <div className="mx-auto max-w-[1040px] px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={t('nav.audit')}
        title={t('admin.auditTrail')}
        subtitle="Every recorded action, newest first, in a chain where any change to a past entry breaks every entry after it."
        actions={demo ? <DemoChip /> : null}
      />

      {/* ---- The chain verdict, first. ---- */}
      {intact ? (
        <Callout family="pass" title={t('admin.auditIntact')} icon={ShieldCheck} className="mt-6">
          The server re-hashed every entry and each links correctly to the one before it. Nothing in
          the visible history has been altered or removed.
          {head && (
            <span className="mt-2 block">
              <span className="nn-eyebrow">Chain head</span>{' '}
              <span className="nn-mono break-all text-ink-2">{head}</span>
            </span>
          )}
        </Callout>
      ) : (
        <Callout family="violation" title={t('admin.auditBroken')} icon={ShieldAlert} className="mt-6">
          At least one entry does not link correctly to the one before it, which means a past record
          was altered or removed. This endpoint reports the break but does not return the failing
          sequence number, so it cannot be pinpointed from here — escalate for a direct database
          check.
        </Callout>
      )}

      {/* ---- The log. ---- */}
      <Card className="mt-6 p-0">
        {entries.length === 0 ? (
          <div className="p-6">
            <EmptyState title={t('common.empty')} body="No audit entries have been recorded yet." />
          </div>
        ) : (
          <Table caption={`Audit entries ${first}–${last} of ${total.toLocaleString()}, newest first.`}>
            <thead>
              <tr>
                <Th align="right">#</Th>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>Detail</Th>
                <Th>Reason</Th>
                <Th align="right">Link</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <AuditRow key={e.seq} entry={e} actorLabel={actorLabel} />
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* ---- Server-side paging. ---- */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-caption text-ink-3">
          {total > 0 ? (
            <>
              Showing <span className="tabular-nums">{first.toLocaleString()}</span>–
              <span className="tabular-nums">{last.toLocaleString()}</span> of{' '}
              <span className="tabular-nums">{total.toLocaleString()}</span>
            </>
          ) : (
            'No entries'
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={ChevronLeft}
            disabled={!hasPrev || audit.loading}
            disabledReason="You are on the most recent page."
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          >
            {t('common.back')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            iconRight={ChevronRight}
            disabled={!hasNext || audit.loading}
            disabledReason="There are no older entries."
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
          >
            {t('common.next')}
          </Button>
        </div>
      </div>

      {/* ---- The honest boundary of this endpoint. ---- */}
      <Card className="mt-6 p-5 sm:p-6">
        <SectionTitle>What this view cannot show</SectionTitle>
        <ul className="mt-3 space-y-2 text-small text-ink-2">
          <li className="flex gap-2">
            <Info size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            The IP address is recorded on every entry but omitted from this response, so it cannot be
            displayed here.
          </li>
          <li className="flex gap-2">
            <Info size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            There is no free-text search or action filter on the endpoint; entries can only be paged
            in sequence order.
          </li>
          <li className="flex gap-2">
            <Info size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            Which object an entry concerns is carried by its inspection and package numbers; for
            account actions it lives inside the change text, shown verbatim.
          </li>
        </ul>
      </Card>
    </div>
  )
}

/** One entry. Kept separate so the row's small formatting decisions do not
    clutter the table body above. */
function AuditRow({ entry, actorLabel }) {
  const e = entry
  const label = ACTION_LABELS[e.action] ?? e.action
  const notable = NOTABLE.has(e.action)
  const when = (() => {
    try {
      return format(parseISO(e.timestamp), 'd MMM yyyy, HH:mm')
    } catch {
      return e.timestamp
    }
  })()

  return (
    <Tr>
      <Td align="right">
        <span className="nn-mono text-caption text-ink-3">{e.seq}</span>
      </Td>
      <Td>
        <span className="whitespace-nowrap text-small text-ink-2">{when}</span>
      </Td>
      <Td>
        <span className="text-small text-ink">{actorLabel(e.user_id)}</span>
      </Td>
      <Td>
        {notable ? (
          <Pill family={e.action === 'finding_overridden' ? 'review' : 'na'}>{label}</Pill>
        ) : (
          <span className="text-small text-ink-2">{label}</span>
        )}
      </Td>
      <Td>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-1.5">
            {e.inspection_id != null && (
              <span className="nn-mono rounded-sm border border-divider bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-3">
                Insp #{e.inspection_id}
              </span>
            )}
            {e.scan_id != null && (
              <span className="nn-mono rounded-sm border border-divider bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-3">
                Pkg #{e.scan_id}
              </span>
            )}
          </div>
          {(e.old_value || e.new_value) && (
            <span className="nn-mono text-caption text-ink-2">
              {e.old_value != null && <span className="text-ink-3">{e.old_value}</span>}
              {e.old_value != null && e.new_value != null && <span className="px-1 text-ink-3">→</span>}
              {e.new_value != null && <span>{e.new_value}</span>}
            </span>
          )}
        </div>
      </Td>
      <Td>
        {e.reason ? (
          <span className="block max-w-[26rem] text-caption leading-5 text-ink-2">{e.reason}</span>
        ) : (
          <span className="text-caption text-ink-3">—</span>
        )}
      </Td>
      <Td align="right">
        <span
          className="nn-mono inline-flex items-center gap-1 text-[11px] text-ink-3"
          title={`Chain link hash: ${e.hash_self}`}
        >
          <Link2 size={12} strokeWidth={1.8} aria-hidden="true" />
          {String(e.hash_self).slice(0, 8)}
        </span>
      </Td>
    </Tr>
  )
}


