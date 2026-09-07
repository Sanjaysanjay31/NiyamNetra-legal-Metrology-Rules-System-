import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * CoverageMap — registered stores and violation premises on OpenStreetMap.
 *
 * Plain Leaflet (no react wrapper), circleMarkers only — so there are no
 * marker-image assets for Vite to resolve and nothing to break the PWA
 * build. Blue = registered store, red = store with violations in the
 * period. Tiles need network; without it the markers still render on grey,
 * which is stated in the caption rather than hidden.
 */
export default function CoverageMap({ stores = [], violators = [] }) {
  const divRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    const map = L.map(divRef.current, { scrollWheelZoom: false }).setView([17.4, 78.48], 11)
    map.scrollWheelZoom.disable()
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }
    const group = L.layerGroup()
    const bad = new Set((violators ?? []).map((v) => v.store_id))
    const pts = []
    for (const s of stores ?? []) {
      if (s.latitude == null || s.longitude == null) continue
      const isBad = bad.has(s.id)
      pts.push([s.latitude, s.longitude])
      L.circleMarker([s.latitude, s.longitude], {
        radius: isBad ? 9 : 6,
        color: isBad ? '#B71C1C' : '#0F2A44',
        weight: 2,
        fillColor: isBad ? '#B71C1C' : '#2E7D32',
        fillOpacity: 0.55,
      })
        .bindTooltip(`${s.name}${isBad ? ' — violations in period' : ''}`)
        .addTo(group)
    }
    group.addTo(map)
    layerRef.current = group
    if (pts.length > 0) map.fitBounds(L.latLngBounds(pts).pad(0.2))
  }, [stores, violators])

  return (
    <div
      ref={divRef}
      role="img"
      aria-label="Map of registered stores; red markers have violations in this period"
      className="z-0 h-72 w-full rounded-card border border-divider"
    />
  )
}
