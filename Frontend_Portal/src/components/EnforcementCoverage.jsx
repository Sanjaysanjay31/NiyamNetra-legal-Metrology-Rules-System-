import { endpoints } from '../api/client'
import { useResource } from '../lib/hooks'
import { Card } from '../ui'
import CoverageMap from '../components/CoverageMap'

/**
 * EnforcementCoverage — map + repeat violators + proximity flags.
 *
 * Three endpoints, each honest about what it is: registered store points
 * (/stores), violation-ranked premises (/admin/repeat-violators), and
 * same-doorstep different-name pairs (/admin/proximity-flags, review items,
 * never verdicts). Everything here degrades to a stated empty state when
 * its endpoint is unreachable — no invented pins, no invented rows.
 */
export default function EnforcementCoverage({ start, end }) {
  const stores = useResource(() => endpoints.inspections.stores(), {
    fallback: [],
    label: 'coverage-stores',
  })
  const violators = useResource(
    () => endpoints.admin.repeatViolators({ start, end, limit: 20 }),
    { deps: [start, end], label: 'repeat-violators' }
  )
  const proximity = useResource(
    () => endpoints.admin.proximityFlags({ days: 29, meters: 50, limit: 50 }),
    { deps: [start, end], label: 'proximity-flags' }
  )

  const storeRows = Array.isArray(stores.data) ? stores.data : []
  const badRows = violators.data?.stores ?? []
  const flags = proximity.data?.flags ?? []
  const located = storeRows.filter((s) => s.latitude != null && s.longitude != null).length

  return (
    <section aria-label="Enforcement coverage" className="mt-6 grid gap-4 xl:grid-cols-2">
      <Card className="flex flex-col p-5">
        <h3 className="text-h2 text-ink">Coverage map</h3>
        <p className="mt-1 max-w-prose text-caption text-ink-2">
          {located} of {storeRows.length} registered stores have coordinates
          {badRows.length > 0 && `; ${badRows.length} with violations in this period (red)`}.
          Tiles need network; pins render regardless.
        </p>
        <div className="mt-4">
          <CoverageMap stores={storeRows} violators={badRows} />
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col p-5">
          <h3 className="text-h2 text-ink">Repeat violators</h3>
          <p className="mt-1 max-w-prose text-caption text-ink-2">
            Premises ranked by violation count — where enforcement attention goes first.
          </p>
          {violators.loading ? (
            <p className="mt-3 text-caption text-ink-3">Loading…</p>
          ) : badRows.length === 0 ? (
            <p className="mt-3 text-caption text-ink-3">
              {violators.error ? 'Could not be loaded.' : 'No violations in this period.'}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {badRows.slice(0, 8).map((r) => (
                <li key={r.store_id} className="flex items-baseline justify-between gap-3 border-l-2 border-violation-border pl-3">
                  <span className="text-small font-semibold text-ink">{r.store_name}</span>
                  <span className="nn-mono shrink-0 text-caption text-ink-2">
                    {r.violations}× · last {r.last_violation_date ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col p-5">
          <h3 className="text-h2 text-ink">Proximity flags</h3>
          <p className="mt-1 max-w-prose text-caption text-ink-2">
            Different stores within 50 m — duplicated records, mis-tagged visits, or GPS
            trouble. Review items, never verdicts.
          </p>
          {proximity.loading ? (
            <p className="mt-3 text-caption text-ink-3">Loading…</p>
          ) : flags.length === 0 ? (
            <p className="mt-3 text-caption text-ink-3">
              {proximity.error ? 'Could not be loaded.' : 'No close pairs in the window.'}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {flags.slice(0, 6).map((f, i) => (
                <li key={i} className="border-l-2 border-review-border pl-3">
                  <p className="text-small font-semibold text-ink">
                    Visits {f.inspection_a} and {f.inspection_b} — {f.distance_m} m apart
                  </p>
                  <p className="text-caption text-ink-2">
                    Stores {f.store_a} / {f.store_b} · {f.date_a} / {f.date_b}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </section>
  )
}
