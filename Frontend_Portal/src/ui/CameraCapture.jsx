/**
 * CameraCapture — the only way a photograph enters the portal.
 *
 * This is the anti-gallery control. There is deliberately no `<input
 * type="file">` and no image picker anywhere in it: evidence is captured live
 * from the camera, on the same doctrine the Expo app follows (no
 * `expo-image-picker`, 08_UI_DESIGN.md §4.3, 05_SYSTEM_ARCHITECTURE.md §2.2).
 * A browser file dialog is a gallery by another name, so it is not offered as
 * a fallback when the camera is missing or refused — a device without a usable
 * camera is told to capture with the field app instead. That is the "absent,
 * not disabled" rule applied to JavaScript, not just to the DOM.
 *
 * Spec: 08_UI_DESIGN.md §4.3.
 *   - Guide overlay: 4:3, 80% width, 2 px dashed Netra Teal border, 3 px
 *     white corner brackets, "Place the pack inside the frame" top label.
 *   - Quality strip on *sampled* frames (not every frame — battery and
 *     thermal headroom), with the exact thresholds:
 *       Laplacian variance < 100  → too blurred  (violation tone)
 *       saturated cluster > 15%   → glare         (review tone)
 *       mean luminance < 50       → too dark      (review tone)
 *       panel < 400 px tall       → move closer   (review tone)
 *       panel corners not found   → not visible   (review tone)
 *       all clear                 → ready         (pass tone)
 *   - Shutter 72 px, Niyam Blue ring on white; bursts five frames and keeps
 *     the sharpest (highest Laplacian variance), like the field app.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Flashlight, Loader2, RotateCcw, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { Button, Callout, cx } from './index'

/* ------------------------------------------------------------------------- */
/* Frame analysis — small, sampling, and honest about its approximations.     */
/* ------------------------------------------------------------------------- */

/** Analyse one video frame at a fixed small width for speed. */
function analyse(video) {
  const w = 240
  const scale = w / video.videoWidth
  const h = Math.max(1, Math.round(video.videoHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  const g = new Float32Array(w * h)

  let lumSum = 0
  for (let i = 0; i < w * h; i++) {
    const L = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
    g[i] = L
    lumSum += L
  }
  const meanLum = lumSum / (w * h)

  /* Laplacian energy (sharpness) + blown-out (glare) fraction. */
  let lap = 0
  let blown = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const v = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i]
      lap += v * v
      const p = i * 4
      if (data[p] >= 235 && data[p + 1] >= 235 && data[p + 2] >= 235) blown++
    }
  }
  const px = (w - 2) * (h - 2) || 1
  const lv = Math.sqrt(lap / px)
  const glareFrac = blown / px

  /* Panel extent via edge projection — the "whole panel not visible" and
     "move closer" conditions. Approximates corners by the content band. */
  const row = new Float32Array(h)
  const col = new Float32Array(w)
  let maxRow = 0
  let maxCol = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const a = g[i - w - 1]
      const b = g[i - w]
      const c = g[i - w + 1]
      const d = g[i - 1]
      const f = g[i + 1]
      const gi = g[i + w - 1]
      const hh = g[i + w]
      const kk = g[i + w + 1]
      const sx = -a + c - 2 * d + 2 * f - gi + kk
      const sy = -a - 2 * b - c + gi + 2 * hh + kk
      const m = Math.abs(sx) + Math.abs(sy)
      row[y] += m
      col[x] += m
      if (row[y] > maxRow) maxRow = row[y]
      if (col[x] > maxCol) maxCol = col[x]
    }
  }
  const rowGate = maxRow * 0.35
  const colGate = maxCol * 0.35
  let top = -1
  let bottom = -1
  let left = -1
  let right = -1
  for (let y = 0; y < h; y++) {
    if (row[y] >= rowGate) {
      if (top < 0) top = y
      bottom = y
    }
  }
  for (let x = 0; x < w; x++) {
    if (col[x] >= colGate) {
      if (left < 0) left = x
      right = x
    }
  }
  const panelH = bottom > top ? (bottom - top) * (video.videoHeight / h) : 0
  const touches = top <= 1 || bottom >= h - 2 || left <= 1 || right >= w - 2

  return { meanLum, lv, glareFrac, panelH, found: top >= 0 && left >= 0, touches }
}

/** The single quality verdict from one analysis pass (08 §4.3 table order). */
function qualityKey(r) {
  if (r.meanLum < 50) return 'dark'
  if (r.glareFrac > 0.15) return 'glare'
  if (!r.found || r.touches) return 'panel'
  if (r.panelH < 400) return 'small'
  if (r.lv < 100) return 'blur'
  return 'ready'
}

/** Sharpness of an already-drawn canvas, for the burst keep-sharpest pick. */
function sharpness(canvas) {
  const w = 160
  const h = Math.max(1, Math.round((canvas.height * w) / canvas.width))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(canvas, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  const L = (i) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  let lap = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const v = L(i - w) + L(i + w) + L(i - 1) + L(i + 1) - 4 * L(i)
      lap += v * v
    }
  }
  return Math.sqrt(lap / ((w - 2) * (h - 2) || 1))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop())
}

/* The strip colours are the measured text tones from 08 §2.1, never raw hex:
   pass #047857 5.21:1, review #B45309 4.84:1, violation #B91C1C 5.91:1. */
const QUALITY = {
  ready: { tone: 'text-pass-text', dot: 'bg-pass-text' },
  dark: { tone: 'text-review-text', dot: 'bg-review-text' },
  glare: { tone: 'text-review-text', dot: 'bg-review-text' },
  panel: { tone: 'text-review-text', dot: 'bg-review-text' },
  small: { tone: 'text-review-text', dot: 'bg-review-text' },
  blur: { tone: 'text-violation-text', dot: 'bg-violation-text' },
}

/* ------------------------------------------------------------------------- */
/* Flash control — auto / on / off via the torch constraint, when the browser */
/* exposes it. "Auto" releases the torch back off; an unsupported torch sets  */
/* a caption rather than pretending the control works.                        */
/* ------------------------------------------------------------------------- */

function FlashControl({ value, onChange, disabled }) {
  const { t } = useI18n()
  const opts = [
    { id: 'auto', label: t('capture.auto') },
    { id: 'on', label: t('capture.on') },
    { id: 'off', label: t('capture.off') },
  ]
  return (
    <div
      role="radiogroup"
      aria-label={t('capture.flash')}
      className="inline-flex items-center gap-2"
    >
      <Flashlight size={16} strokeWidth={1.8} className="text-ink-3" aria-hidden="true" />
      <div className="inline-flex rounded-pill border border-divider bg-surface p-0.5">
        {opts.map((o) => {
          const on = value === o.id
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => !disabled && onChange(o.id)}
              className={cx(
                'min-w-[36px] rounded-pill px-2 py-1 text-caption font-semibold transition-colors',
                'duration-fast ease-settle',
                on ? 'bg-accent text-accent-on' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* CameraCapture                                                              */
/* ------------------------------------------------------------------------- */

export default function CameraCapture({ label, onCapture, onCancel }) {
  const { t } = useI18n()
  const [status, setStatus] = useState('starting')
  const [attempt, setAttempt] = useState(0)
  const [quality, setQuality] = useState({ key: 'ready' })
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState(false)
  const [flash, setFlash] = useState('auto')
  const [flashUnsupported, setFlashUnsupported] = useState(false)
  const [frame, setFrame] = useState(null) // { url, blob }
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  /* ------------------------------------------------------ camera lifecycle -- */
  useEffect(() => {
    let active = true
    async function init() {
      setStatus('starting')
      try {
        const getUserMedia = navigator.mediaDevices?.getUserMedia
        if (typeof getUserMedia !== 'function') {
          throw new Error('getUserMedia unavailable — not a secure context?')
        }
        const stream = await getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        }).catch(() => getUserMedia({ video: true, audio: false }))
        if (!active) {
          stopStream(stream)
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setStatus('ready')
      } catch (e) {
        if (!active) return
        setStatus(e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError' ? 'denied' : 'error')
      }
    }
    init()
    return () => {
      active = false
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }, [attempt])

  /* ------------------------------------------------------------ quality -- */
  /* Sampled, not continuous: re-render only when the verdict changes.       */
  useEffect(() => {
    if (status !== 'ready' || frame || capturing) return
    const timer = setInterval(() => {
      const video = videoRef.current
      if (!video || video.readyState < 2 || !video.videoWidth) return
      const key = qualityKey(analyse(video))
      setQuality((prev) => {
        if (prev.key === key) return prev
        if (key === 'blur' && prev.key !== 'blur') navigator.vibrate?.(80)
        return { key }
      })
    }, 600)
    return () => clearInterval(timer)
  }, [status, frame, capturing])

  const q = QUALITY[quality.key] ?? QUALITY.ready
  const message = {
    ready: t('capture.ready'),
    dark: t('capture.tooDark'),
    glare: t('capture.glare'),
    panel: t('capture.panelNotVisible'),
    small: t('capture.moveCloser'),
    blur: t('capture.tooBlurred'),
  }[quality.key]

  /* -------------------------------------------------------------- flash -- */
  const changeFlash = useCallback(
    async (mode) => {
      setFlash(mode)
      try {
        const track = streamRef.current?.getVideoTracks?.()[0]
        if (!track) throw new Error('no track')
        await track.applyConstraints({
          advanced: [{ torch: mode === 'on' }],
        })
      } catch {
        setFlashUnsupported(true)
      }
    },
    []
  )

  /* ----------------------------------------------------- burst capture -- */
  const shoot = useCallback(async () => {
    const video = videoRef.current
    if (!video || capturing || !video.videoWidth) return
    setCapturing(true)
    try {
      const frames = []
      for (let i = 0; i < 5; i++) {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push({ canvas, score: sharpness(canvas) })
        if (i < 4) await sleep(60)
      }
      const best = frames.sort((a, b) => b.score - a.score)[0].canvas
      const blob = await new Promise((resolve, reject) =>
        best.toBlob((b) => (b ? resolve(b) : reject(new Error('capture-encode'))), 'image/jpeg', 0.92)
      )
      setFrame({ url: URL.createObjectURL(blob), blob })
      setCaptureError(false)
    } catch {
      setCaptureError(true)
    } finally {
      setCapturing(false)
    }
  }, [capturing])

  const retake = useCallback(() => {
    if (frame) URL.revokeObjectURL(frame.url)
    setFrame(null)
    setCaptureError(false)
  }, [frame])

  const useThis = useCallback(() => {
    if (!frame) return
    stopStream(streamRef.current)
    streamRef.current = null
    onCapture(frame.blob)
  }, [frame, onCapture])

  const done = useCallback(() => {
    stopStream(streamRef.current)
    streamRef.current = null
    onCancel?.()
  }, [onCancel])

  useEffect(
    () => () => {
      if (frame) URL.revokeObjectURL(frame.url)
    },
    [frame]
  )

  /* ---------------------------------------------------------------- UI -- */
  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card bg-navy">
        {frame ? (
          <img
            src={frame.url}
            alt={`${label} capture preview`}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 grid place-content-center justify-items-center text-ink-inverse">
            <Loader2 size={24} strokeWidth={1.8} className="animate-spin" aria-hidden="true" />
            <span className="mt-2 text-caption font-medium">{t('capture.starting')}</span>
          </div>
        )}

        {status === 'ready' && !frame && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-[4/3] w-[80%] -translate-x-1/2 -translate-y-1/2">
            <div
              className="absolute inset-0 rounded-card border-2 border-dashed border-teal"
              aria-hidden="true"
            />
            {/* L-shaped white corner brackets, 3 px — visible over any video feed */}
            <div className="absolute -left-[1px] -top-[1px] h-7 w-7 rounded-tl-card border-[3px] border-white" aria-hidden="true" />
            <div className="absolute -right-[1px] -top-[1px] h-7 w-7 rounded-tr-card border-[3px] border-white" aria-hidden="true" />
            <div className="absolute -bottom-[1px] -left-[1px] h-7 w-7 rounded-bl-card border-[3px] border-white" aria-hidden="true" />
            <div className="absolute -bottom-[1px] -right-[1px] h-7 w-7 rounded-br-card border-[3px] border-white" aria-hidden="true" />
            <span className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-pill bg-navy px-2 py-1 text-caption font-medium text-ink-inverse">
              {t('capture.guideTop')}
            </span>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-pill bg-navy px-2 py-1 text-caption font-medium text-ink-inverse">
              {label}
            </span>
          </div>
        )}

        {(status === 'denied' || status === 'error') && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="grid place-items-center text-ink-inverse opacity-70">
              <CameraIconStub />
            </span>
          </div>
        )}
      </div>

      {/* quality strip — sampled live region, beneath the frame per §4.3 */}
      {status === 'ready' && (
        <div className="mt-2 flex min-h-[20px] items-center gap-2" aria-live="polite">
          <span className={cx('h-2.5 w-2.5 shrink-0 rounded-pill', q.dot)} aria-hidden="true" />
          <span className={cx('text-caption font-medium', q.tone)}>
            {capturing ? t('capture.capturing') : message}
          </span>
        </div>
      )}

      {status !== 'ready' && status !== 'starting' && (
        <div className="mt-3">
          <Callout
            family="violation"
            title={status === 'denied' ? t('capture.cameraDenied') : t('capture.cameraUnavailable')}
          >
            <p>{t('capture.appOnly')}</p>
            <div className="mt-3">
              <Button size="sm" icon={RotateCcw} onClick={() => setAttempt((a) => a + 1)}>
                {t('common.retry')}
              </Button>
            </div>
          </Callout>
        </div>
      )}

      {captureError && (
        <div className="mt-3">
          <Callout family="violation" title={t('capture.captureFailed')}>
            <p>{t('capture.captureFailedHint')}</p>
          </Callout>
        </div>
      )}

      {frame ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
          <Button variant="ghost" icon={RotateCcw} onClick={retake}>
            {t('capture.retake')}
          </Button>
          <Button
            variant="primary"
            icon={Check}
            onClick={useThis}
            disabled={captureError}
            disabledReason={t('capture.captureFailed')}
          >
            {t('capture.use')}
          </Button>
        </div>
      ) : (
        status === 'ready' && (
          <>
            {flashUnsupported && (
              <p className="mt-2 text-caption text-ink-3">{t('capture.flashUnavailable')}</p>
            )}
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <FlashControl value={flash} onChange={changeFlash} disabled={capturing} />
              <button
                type="button"
                onClick={shoot}
                disabled={capturing}
                aria-label={t('capture.shutterLabel')}
                className={cx(
                  'grid h-[72px] w-[72px] place-items-center rounded-pill border-4 border-navy bg-white',
                  'shadow-card transition-transform duration-fast ease-settle enabled:active:scale-95',
                  'disabled:cursor-not-allowed disabled:opacity-70'
                )}
              >
                {capturing ? (
                  <Loader2 size={28} strokeWidth={2} className="animate-spin text-navy" aria-hidden="true" />
                ) : (
                  <span className="h-[52px] w-[52px] rounded-pill bg-navy" aria-hidden="true" />
                )}
              </button>
              <div className="justify-self-end">
                <Button variant="ghost" icon={X} onClick={done}>
                  {t('capture.done')}
                </Button>
              </div>
            </div>
          </>
        )
      )}
    </div>
  )
}

/** Small inline camera glyph for the error placeholder — no icon import needed. */
function CameraIconStub() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M2 8a2 2 0 0 1 2-2h1.5l1.6-2.2A2 2 0 0 1 8.6 3h6.8a2 2 0 0 1 1.5.8L18.5 6H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}