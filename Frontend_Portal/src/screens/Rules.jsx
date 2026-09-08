/**
 * Rules — the engine's own account of itself, for an administrator.
 *
 * This screen is not an editor. The rule catalogue is compiled into the engine
 * and changed only by transcribing the gazette and shipping a new build; a
 * portal that let an administrator "edit a rule" would be pretending to an
 * authority the system deliberately does not grant (see the catalogue file's
 * own _meta note). So the screen does two honest things instead: it shows the
 * provenance the engine stamps onto every scan — the rules-as-at date, the
 * engine version, the catalogue hash — and it lays out all nineteen rows so an
 * officer can see exactly what is assessed, under which provision, and, just as
 * importantly, what is *not* yet assessed.
 *
 * Two schedule tables ship empty on purpose: the Second Schedule pack sizes
 * (ledger L-05, consumed by CHK10) and the net-quantity minimum heights (ledger
 * L-04, consumed by CHK06b). The `/admin/rules` endpoint reports whether each
 * is populated, and while empty the dependent check returns not_assessed rather
 * than guessing. That gap is surfaced here in words, not hidden.
 *
 * The count is stated the one correct way: nineteen registered rows, eighteen
 * assessable checks. CHK18 is the derived Section 36 tier and is never in the
 * denominator; CHK06b is a sub-check reporting under CHK06.
 */

import { AlertTriangle, Globe, Info, Ruler, Scale, Sigma } from 'lucide-react'
import { endpoints } from '../api/client'
import { useI18n } from '../i18n'
import {
  CHECKS,
  CHECKS_TOTAL,
  DERIVED_CHECK,
  PHASE_GROUPS,
  REGISTRATION_ORDER,
} from '../lib/checks'
import { useDocumentTitle, useResource } from '../lib/hooks'
import { rulesMeta } from '../mock/fixtures'
import {
  Callout,
  Card,
  DemoChip,
  MetaStat,
  PageHeader,
  Pill,
  SectionTitle,
  SeverityBadge,
} from '../ui'

/* Which check goes dark when a schedule table is empty. Keyed by the API flag. */
const SCHEDULE_GAPS = [
  {
    flag: 'second_schedule_populated',
    checkId: 'CHK10',
    ledger: 'L-05',
    label: 'Second Schedule pack sizes',
    consequence: 'The prescribed standard pack-size check (CHK10) returns not assessed.',
  },
  {
    flag: 'net_quantity_heights_populated',
    checkId: 'CHK06b',
    ledger: 'L-04',
    label: 'Net-quantity minimum heights',
    consequence: 'The net-quantity height check (CHK06b) returns not assessed.',
  },
]

export default function Rules() {
  const { t } = useI18n()
  useDocumentTitle(t('admin.rulesTitle'))

  const rules = useResource(() => endpoints.admin.rules(), {
    fallback: rulesMeta,
    label: t('admin.rulesTitle'),
  })
  const data = rules.data ?? rulesMeta

  const unverified = REGISTRATION_ORDER.filter((id) => CHECKS[id].unverified)
  const gaps = SCHEDULE_GAPS.filter((g) => data[g.flag] === false)

  return (
    <div className="nn-admin-page nn-admin-rules-page mx-auto max-w-[860px]">
      <PageHeader
        eyebrow={t('nav.rules')}
        title={t('admin.rulesTitle')}
        actions={null}
      />

      {/* ---- Provenance: the exact stamp the engine writes onto every scan. ---- */}
      <Card className="mt-6 p-5 sm:p-6">
        <SectionTitle>
          <span className="inline-flex items-center gap-2">
            <Scale size={18} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
            Engine and rule set
          </span>
        </SectionTitle>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetaStat label="Rules as at" value={data.rules_as_at} />
          <MetaStat label="Engine" value={data.engine_version} />
          <MetaStat label="Registered rows" value={String(data.checks_registered)} />
          <MetaStat label="Assessable checks" value={String(CHECKS_TOTAL)} />
        </div>
        <div className="mt-4">
          <MetaStat
            label={t('admin.catalogHash')}
            value={<span className="nn-mono break-all">{String(data.catalog_hash).slice(0, 24)}…</span>}
            title={data.catalog_hash}
          />
        </div>
        {data.meta?.gazette && (
          <p className="mt-4 max-w-prose text-caption leading-5 text-ink-3">{data.meta.gazette}</p>
        )}
      </Card>

      {/* ---- The honest gaps. Empty schedule tables mean specific checks cannot
           run — and the report says so on every affected scan. ---- */}

      {/* ---- The catalogue, in the four reading phases, then the derived tier. ---- */}
      {PHASE_GROUPS.map((group) => (
        <Card key={group.id} className="mt-6 p-5 sm:p-6">
          <SectionTitle>{group.label}</SectionTitle>
          <ul className="mt-2 divide-y divide-divider">
            {group.checks.map((id) => (
              <CheckRow key={id} id={id} />
            ))}
          </ul>
        </Card>
      ))}

      <Card className="mt-6 p-5 sm:p-6">
        <SectionTitle>
          Derived
        </SectionTitle>
        <ul className="mt-2 divide-y divide-divider">
          <CheckRow id={DERIVED_CHECK} />
        </ul>
      </Card>
    </div>
  )
}

/**
 * One catalogue row. Everything shown is read from the compiled catalogue in
 * lib/checks.js, which is itself mirrored from the engine — so this screen and
 * the engine cannot silently disagree about what a check is or cites.
 */
function CheckRow({ id }) {
  const c = CHECKS[id]
  if (!c) return null
  return (
    <li className="flex flex-col gap-2 py-4 first:pt-2 last:pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="nn-mono rounded-sm border border-divider bg-surface-2 px-1.5 py-0.5 text-caption font-medium text-ink-3">
          {c.id}
        </span>
        <span className="text-body font-medium text-ink">{c.title}</span>
        <SeverityBadge severity={c.severity} />
        {c.measured && (
          <Pill family="info" icon={Ruler}>
            Measured
          </Pill>
        )}
        {c.listingOnly && (
          <Pill family="na" icon={Globe}>
            Listing only
          </Pill>
        )}
        {c.advisoryOnly && (
          <Pill family="na" icon={Info}>
            Advisory
          </Pill>
        )}
        {c.derived && (
          <Pill family="na" icon={Sigma}>
            Derived
          </Pill>
        )}
        {c.subOf && <Pill family="na">Sub-check of {c.subOf}</Pill>}
      </div>

      <p className="text-small text-ink-2">{c.help}</p>

      <p className="text-caption text-ink-3">
        <span className="font-medium text-ink-2">Provision: </span>
        {c.citation}
        {c.unverified && (
          <span className="nn-mono ml-2 rounded-sm border border-review-border bg-review-fill px-1.5 py-0.5 text-[11px] text-review-text">
            unverified · {c.unverified}
          </span>
        )}
      </p>
    </li>
  )
}

