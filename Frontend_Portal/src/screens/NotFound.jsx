/**
 * The catch-all route.
 *
 * A 404 in this portal is almost always a stale bookmark or a hand-typed id, not
 * a broken link — the routes are static and few. So the page does one useful
 * thing: it sends the officer back to the home that matches their role, rather
 * than to a generic landing that an inspector has no use for. The path they
 * missed is shown verbatim, because "the page /admin/inspctions does not exist"
 * is a faster fix than "page not found".
 */

import { useLocation, useNavigate } from 'react-router-dom'
import { Compass, Home } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { useDocumentTitle } from '../lib/hooks'
import { Button } from '../ui'

export default function NotFound() {
  const { t } = useI18n()
  const { isAdmin, isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  useDocumentTitle(t('common.notFound'))

  const home = !isAuthenticated ? '/login' : isAdmin ? '/admin' : '/inspector'
  const homeLabel = !isAuthenticated
    ? t('auth.signIn')
    : isAdmin
      ? t('nav.overview')
      : t('nav.home')

  return (
    <div className="grid min-h-[70vh] place-items-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-hero bg-surface-2 text-ink-3">
          <Compass size={26} strokeWidth={1.7} aria-hidden="true" />
        </div>

        <p className="nn-eyebrow mt-6">Error 404</p>
        <h1 className="mt-2 text-h1 text-ink">{t('common.notFound')}</h1>
        <p className="mx-auto mt-3 max-w-sm text-small text-ink-2">
          There is no page at this address. It may have been a bookmark from an older build, or an
          id that has since changed.
        </p>

        {location.pathname && (
          <p className="nn-mono mt-4 truncate rounded-sm border border-divider bg-surface-sunken px-3 py-2 text-caption text-ink-3">
            {location.pathname}
          </p>
        )}

        <div className="mt-6 flex justify-center">
          <Button onClick={() => navigate(home)} icon={Home}>
            {homeLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
