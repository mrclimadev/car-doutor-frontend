import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const MT_CENTER = [-56.0, -13.5]
const MT_ZOOM   = 5.5

const RESULT_SOURCE    = 'result-source'
const PROPERTY_LAYER   = 'property-fill'
const PROPERTY_OUTLINE = 'property-outline'
const STATS_SOURCE     = 'stats-dots'
const STATS_LAYER      = 'stats-dots-layer'
const REGION_SOURCE    = 'region-hull'
const REGION_FILL      = 'region-fill'
const REGION_OUTLINE   = 'region-outline'

// SICAR internal layers shown after property analysis
const SICAR_LAYERS = [
  { key: 'reserva_legal',           label: 'Reserva Legal',          color: '#1b5e20', opacity: 0.5 },
  { key: 'vegetacao_nativa',        label: 'Vegetação Nativa',       color: '#388e3c', opacity: 0.4 },
  { key: 'area_consolidada',        label: 'Área Consolidada',       color: '#c8a97e', opacity: 0.5 },
  { key: 'uso_restrito',            label: 'Uso Restrito',           color: '#f5a623', opacity: 0.55 },
  { key: 'area_pousio',             label: 'Pousio',                 color: '#d4c200', opacity: 0.5 },
  { key: 'servidao_administrativa', label: 'Servidão Adm.',          color: '#9c27b0', opacity: 0.55 },
]

const SICAR_SOURCE  = k => `sicar-src-${k}`
const SICAR_FILL    = k => `sicar-fill-${k}`
const SICAR_OUTLINE = k => `sicar-outline-${k}`

const SCAN_BBOX_SRC  = 'scan-bbox'
const SCAN_LINE_SRC  = 'scan-line'
const SPOTLIGHT_SRC  = 'spotlight'

function makeSpotlightData(holeCoords) {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[-180, -85], [-180, 85], [180, 85], [180, -85], [-180, -85]],
          holeCoords,
        ],
      },
    }],
  }
}

function bboxToHoleRing([minLng, minLat, maxLng, maxLat]) {
  const dLng = (maxLng - minLng) * 0.1
  const dLat = (maxLat - minLat) * 0.1
  return [
    [minLng - dLng, minLat - dLat],
    [maxLng + dLng, minLat - dLat],
    [maxLng + dLng, maxLat + dLat],
    [minLng - dLng, maxLat + dLat],
    [minLng - dLng, minLat - dLat],
  ]
}

function geometryToRing(geometry) {
  if (!geometry) return null
  let ring
  if (geometry.type === 'Polygon') ring = geometry.coordinates[0]
  else if (geometry.type === 'MultiPolygon') {
    ring = geometry.coordinates.reduce((a, b) =>
      a[0].length >= b[0].length ? a : b
    )[0]
  }
  // GeoJSON exterior rings são CCW; para buraco no polígono invertido precisa de CW
  return ring ? [...ring].reverse() : null
}

const STEP_LAYERS = { 3: ['prodes'], 4: ['deter', 'ti'], 5: ['uc'] }
const STEP_MAP_LABELS = {
  0: { icon: '📍', text: 'Localizando imóvel...' },
  1: { icon: '🌊', text: 'Verificando APP...' },
  2: { icon: '🌳', text: 'Verificando RL...' },
  3: { icon: '🛰️', text: 'Consultando PRODES/DETER...' },
  4: { icon: '⚖️', text: 'Verificando TI/UC...' },
  5: { icon: '🧪', text: 'Analisando solo...' },
}

const OVERLAYS = [
  { id: 'prodes', label: 'PRODES Desmatamento', color: '#cc2200', dot: '#ff4422',
    fill: '#cc2200', fillOpacity: 0.45, line: '#ff4422' },
  { id: 'deter',  label: 'DETER Alertas',       color: '#ff8800', dot: '#ffaa22',
    fill: '#ff8800', fillOpacity: 0.45, line: '#ffcc44' },
  { id: 'ti',     label: 'Terra Indígena',       color: '#cc6600', dot: '#ff9933',
    fill: '#cc6600', fillOpacity: 0.35, line: '#ffaa44' },
  { id: 'uc',     label: 'Unid. Conservação',    color: '#0055cc', dot: '#3388ff',
    fill: '#0055cc', fillOpacity: 0.30, line: '#44aaff' },
]

// ── Convex hull (Graham scan) ─────────────────────────────────────────────────
function _cross(O, A, B) {
  return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0])
}
function convexHull(pts) {
  if (pts.length < 3) return pts
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const lower = []
  for (const p of sorted) {
    while (lower.length >= 2 && _cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && _cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop()
    upper.push(p)
  }
  upper.pop(); lower.pop()
  return [...lower, ...upper]
}

function bboxString(map) {
  const b = map.getBounds()
  return `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`
}

function srcId(id)      { return `overlay-src-${id}` }
function fillId(id)     { return `overlay-fill-${id}` }
function outlineId(id)  { return `overlay-outline-${id}` }

function ensureOverlaySources(map) {
  OVERLAYS.forEach(ov => {
    if (!map.getSource(srcId(ov.id))) {
      map.addSource(srcId(ov.id), {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
    }
  })
}

function addOverlayLayers(map, ov) {
  if (map.getLayer(fillId(ov.id))) return
  // Ensure source exists (defensive: may not if load event hasn't fired)
  if (!map.getSource(srcId(ov.id))) {
    map.addSource(srcId(ov.id), {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }
  map.addLayer({
    id: fillId(ov.id),
    type: 'fill',
    source: srcId(ov.id),
    paint: { 'fill-color': ov.fill, 'fill-opacity': ov.fillOpacity },
  })
  map.addLayer({
    id: outlineId(ov.id),
    type: 'line',
    source: srcId(ov.id),
    paint: { 'line-color': ov.line, 'line-width': 1.5 },
  })
}

function removeOverlayLayers(map, ov) {
  if (map.getLayer(outlineId(ov.id))) map.removeLayer(outlineId(ov.id))
  if (map.getLayer(fillId(ov.id)))    map.removeLayer(fillId(ov.id))
}

function clearOverlaySource(map, id) {
  const src = map.getSource(srcId(id))
  if (src) src.setData({ type: 'FeatureCollection', features: [] })
}

// ── Layer toggle panel ────────────────────────────────────────────────────────
function LayerPanel({ active, loading, onToggle }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    const activeCount = active.size
    return (
      <button
        className={`layer-panel-btn ${activeCount > 0 ? 'has-active' : ''}`}
        onClick={() => setOpen(true)}
        title="Camadas"
      >
        <span className="layer-panel-btn-icon">◧</span>
        {activeCount > 0 && <span className="layer-panel-btn-badge">{activeCount}</span>}
      </button>
    )
  }

  return (
    <div className="layer-panel">
      <button className="layer-panel-hd" onClick={() => setOpen(false)}>
        <span className="layer-panel-icon">◧</span>
        <span>Camadas</span>
        <span className="layer-panel-close">✕</span>
      </button>
      <div className="layer-panel-items">
        {OVERLAYS.map(ov => {
          const on  = active.has(ov.id)
          const ldg = loading.has(ov.id)
          return (
            <button
              key={ov.id}
              className={`layer-btn ${on ? 'on' : ''} ${ldg ? 'loading' : ''}`}
              onClick={() => onToggle(ov.id)}
              style={on ? { borderColor: ov.color, background: ov.color + '18' } : {}}
              disabled={ldg}
            >
              {ldg
                ? <span className="layer-spinner" />
                : <span className="layer-dot" style={{ background: on ? ov.dot : 'var(--lp-dot-off)' }} />
              }
              <span>{ov.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default forwardRef(function MapView({ onPolygonDrawn, drawingMode }, ref) {
  const mapContainer   = useRef(null)
  const map            = useRef(null)
  const drawnPoints    = useRef([])
  const tempMarkers    = useRef([])
  const popupRef       = useRef(null)
  const debounceRef    = useRef(null)
  const laudoMarker    = useRef(null)
  const scanRafRef     = useRef(null)
  const scanBboxRef    = useRef(null)
  const scanStartRef   = useRef(0)
  const scanMarkersRef = useRef([])

  const [activeLayers, setActiveLayers] = useState(new Set())
  const [loadingLayers, setLoadingLayers] = useState(new Set())

  async function fetchSicarLayers(carCode) {
    if (!map.current || !carCode) return
    try {
      const res = await fetch(`${API_BASE}/property-layers/${encodeURIComponent(carCode)}`)
      if (!res.ok) return
      const data = await res.json()
      SICAR_LAYERS.forEach(sl => {
        const fc = data[sl.key]
        if (!fc) return
        const src = map.current?.getSource(SICAR_SOURCE(sl.key))
        if (src) src.setData(fc)
      })
    } catch (err) {
      console.warn('Erro ao carregar camadas SICAR:', err)
    }
  }

  function clearSicarLayers() {
    if (!map.current) return
    const empty = { type: 'FeatureCollection', features: [] }
    SICAR_LAYERS.forEach(sl => {
      map.current.getSource(SICAR_SOURCE(sl.key))?.setData(empty)
    })
  }

  useImperativeHandle(ref, () => ({
    showResult(laudo, geometry) {
      if (!map.current) return
      showPropertyOnMap(geometry)
      placeLaudoMarker(laudo, geometry)
      if (laudo?.car_code) fetchSicarLayers(laudo.car_code)
      // Troca spotlight e scan-bbox-outline para o contorno exato do polígono
      const ring = geometryToRing(geometry)
      if (ring) {
        if (map.current.getLayer('spotlight')) {
          map.current.getSource(SPOTLIGHT_SRC)?.setData(makeSpotlightData(ring))
        }
        map.current.getSource(SCAN_BBOX_SRC)?.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry, properties: {} }],
        })
      }
    },
    clearResult() {
      if (!map.current) return
      if (map.current.getSource(RESULT_SOURCE))
        map.current.getSource(RESULT_SOURCE).setData({ type: 'FeatureCollection', features: [] })
      if (laudoMarker.current) {
        laudoMarker.current.remove()
        laudoMarker.current = null
      }
      clearSicarLayers()
    },
    showStatsLayer(fc) {
      if (!map.current) return
      const src = map.current.getSource(STATS_SOURCE)
      if (src) src.setData(fc)

      const points = fc.features
        ?.map(f => f.geometry?.coordinates)
        .filter(c => c != null)

      if (points?.length > 0) {
        // Fit bounds
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
        points.forEach(([lng, lat]) => {
          if (lng < minLng) minLng = lng; if (lat < minLat) minLat = lat
          if (lng > maxLng) maxLng = lng; if (lat > maxLat) maxLat = lat
        })
        if (isFinite(minLng)) {
          map.current.fitBounds(
            [[minLng, minLat], [maxLng, maxLat]],
            { padding: 80, maxZoom: 10, duration: 900 },
          )
        }

        // Draw convex hull outline
        const hull = convexHull(points)
        if (hull.length >= 3) {
          const hullFeature = {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [[...hull, hull[0]]] },
          }
          const regionSrc = map.current.getSource(REGION_SOURCE)
          if (regionSrc) regionSrc.setData({ type: 'FeatureCollection', features: [hullFeature] })
        }
      }
    },
    clearStatsLayer() {
      if (!map.current) return
      const empty = { type: 'FeatureCollection', features: [] }
      map.current.getSource(STATS_SOURCE)?.setData(empty)
      map.current.getSource(REGION_SOURCE)?.setData(empty)
    },
    flyToBbox(bbox) {
      if (!map.current) return
      // bbox: [minLng, minLat, maxLng, maxLat]
      map.current.fitBounds(
        [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
        { padding: 120, maxZoom: 14, duration: 1100, essential: true },
      )
    },

    startScanAnimation(bbox) {
      if (!map.current?.isStyleLoaded()) return
      const [minLng, minLat, maxLng, maxLat] = bbox
      scanBboxRef.current = bbox

      // Spotlight: dark overlay com buraco no bbox
      map.current.getSource(SPOTLIGHT_SRC)?.setData(makeSpotlightData(bboxToHoleRing(bbox)))
      map.current.setPaintProperty('spotlight', 'fill-opacity', 0.75)

      map.current.getSource(SCAN_BBOX_SRC)?.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [minLng, minLat], [maxLng, minLat],
              [maxLng, maxLat], [minLng, maxLat],
              [minLng, minLat],
            ]],
          },
        }],
      })

      if (scanRafRef.current) cancelAnimationFrame(scanRafRef.current)
      scanStartRef.current = performance.now()

      const rafAnimate = (ts) => {
        if (!map.current || !scanBboxRef.current) return
        const [bMinLng, bMinLat, bMaxLng, bMaxLat] = scanBboxRef.current
        const elapsed = ts - scanStartRef.current

        const sweepT = (elapsed % 3000) / 3000
        const sweepLat = bMaxLat - sweepT * (bMaxLat - bMinLat)
        map.current.getSource(SCAN_LINE_SRC)?.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: {
            type: 'LineString',
            coordinates: [[bMinLng, sweepLat], [bMaxLng, sweepLat]],
          }}],
        })

        const bboxOpacity = 0.4 + 0.4 * Math.sin(elapsed / 600)
        if (map.current.getLayer('scan-bbox-outline'))
          map.current.setPaintProperty('scan-bbox-outline', 'line-opacity', bboxOpacity)

        scanRafRef.current = requestAnimationFrame(rafAnimate)
      }
      scanRafRef.current = requestAnimationFrame(rafAnimate)
    },

    updateScanStep(step) {
      if (!map.current || !scanBboxRef.current) return
      const [minLng, minLat, maxLng, maxLat] = scanBboxRef.current
      const lngRange = maxLng - minLng
      const latRange = maxLat - minLat

      const label = STEP_MAP_LABELS[step]
      if (label) {
        const el = document.createElement('div')
        el.className = 'scan-step-label'
        el.innerHTML = `<span class="scan-step-icon">${label.icon}</span><span>${label.text}</span>`
        const lngPos = maxLng + lngRange * 0.06
        const latPos = maxLat - step * latRange * 0.14
        const marker = new maplibregl.Marker({ element: el, anchor: 'left' })
          .setLngLat([lngPos, latPos])
          .addTo(map.current)
        scanMarkersRef.current.push(marker)
        setTimeout(() => {
          el.style.opacity = '0'
          setTimeout(() => marker.remove(), 500)
        }, 2500)
      }

      const layers = STEP_LAYERS[step] || []
      layers.forEach(id => {
        const ov = OVERLAYS.find(o => o.id === id)
        if (!ov) return
        addOverlayLayers(map.current, ov)
        fetchLayer(id)
        setActiveLayers(prev => new Set([...prev, id]))
      })
    },

    stopScanAnimation() {
      if (scanRafRef.current) {
        cancelAnimationFrame(scanRafRef.current)
        scanRafRef.current = null
      }
      scanBboxRef.current = null
      if (!map.current) return
      const empty = { type: 'FeatureCollection', features: [] }
      map.current.getSource(SCAN_BBOX_SRC)?.setData(empty)
      map.current.getSource(SCAN_LINE_SRC)?.setData(empty)
      scanMarkersRef.current.forEach(m => m.remove())
      scanMarkersRef.current = []
      // Limpa spotlight imediatamente, sem fade
      const emptySpot = { type: 'FeatureCollection', features: [] }
      map.current.getSource(SPOTLIGHT_SRC)?.setData(emptySpot)
      if (map.current.getLayer('spotlight'))
        map.current.setPaintProperty('spotlight', 'fill-opacity', 0)
    },
  }))

  // ── Fetch a single overlay layer ──
  const fetchLayer = useCallback(async (id) => {
    if (!map.current) return
    setLoadingLayers(prev => new Set([...prev, id]))
    const bbox = bboxString(map.current)
    try {
      const res = await fetch(`${API_BASE}/map-layer?layer=${id}&bbox=${bbox}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const fc = await res.json()
      const src = map.current?.getSource(srcId(id))
      if (src) src.setData(fc)
    } catch (err) {
      console.warn(`Erro ao carregar camada ${id}:`, err)
      clearOverlaySource(map.current, id)
    } finally {
      setLoadingLayers(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }, [])

  // ── Map init ──
  useEffect(() => {
    if (map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: MT_CENTER,
      zoom: MT_ZOOM,
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.current.on('load', () => {
      // Result source (property polygon)
      map.current.addSource(RESULT_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.current.addLayer({
        id: PROPERTY_LAYER,
        type: 'fill',
        source: RESULT_SOURCE,
        filter: ['==', ['get', 'type'], 'property'],
        paint: { 'fill-color': '#2d6e2d', 'fill-opacity': 0.2 },
      })
      map.current.addLayer({
        id: PROPERTY_OUTLINE,
        type: 'line',
        source: RESULT_SOURCE,
        filter: ['==', ['get', 'type'], 'property'],
        paint: { 'line-color': '#00ffaa', 'line-width': 3.5, 'line-opacity': 1 },
      })

      // Overlay GeoJSON sources (empty until toggled)
      ensureOverlaySources(map.current)

      // Region hull layer (for DashboardPanel selection outline)
      map.current.addSource(REGION_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.current.addLayer({
        id: REGION_FILL,
        type: 'fill',
        source: REGION_SOURCE,
        paint: { 'fill-color': '#4ecb71', 'fill-opacity': 0.04 },
      })
      map.current.addLayer({
        id: REGION_OUTLINE,
        type: 'line',
        source: REGION_SOURCE,
        paint: {
          'line-color': '#4ecb71',
          'line-width': 1.5,
          'line-opacity': 0.55,
          'line-dasharray': [4, 3],
        },
      })

      // Stats dots layer (for DashboardPanel)
      map.current.addSource(STATS_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.current.addLayer({
        id: STATS_LAYER,
        type: 'circle',
        source: STATS_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 6],
          'circle-color': [
            'match', ['get', 'des_condic'],
            'AT', '#4ecb71',
            'AC', '#f5c842',
            'AN', '#f5a623',
            'PE', '#f5a623',
            'CC', '#e8413a',
            'CS', '#ff6b6b',
            'SU', '#e8413a',
            'CA', '#e8413a',
            'RF', '#a78bfa',
            '#60a5fa',
          ],
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.5)',
          'circle-opacity': 0.8,
        },
      })
      // SICAR property overlay sources (empty until analysis result arrives)
      SICAR_LAYERS.forEach(sl => {
        map.current.addSource(SICAR_SOURCE(sl.key), {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.current.addLayer({
          id: SICAR_FILL(sl.key),
          type: 'fill',
          source: SICAR_SOURCE(sl.key),
          paint: { 'fill-color': sl.color, 'fill-opacity': sl.opacity * 0.4 },
        })
        map.current.addLayer({
          id: SICAR_OUTLINE(sl.key),
          type: 'line',
          source: SICAR_SOURCE(sl.key),
          paint: { 'line-color': sl.color, 'line-width': 1.2, 'line-opacity': sl.opacity },
        })
      })

      // ── Scan animation + spotlight sources & layers ───────────────────────────
      const scanEmpty = { type: 'FeatureCollection', features: [] }
      map.current.addSource(SPOTLIGHT_SRC, { type: 'geojson', data: scanEmpty })
      map.current.addLayer({
        id: 'spotlight',
        type: 'fill',
        source: SPOTLIGHT_SRC,
        paint: {
          'fill-color': '#030f03',
          'fill-opacity': 0,
        },
      })
      map.current.addSource(SCAN_BBOX_SRC, { type: 'geojson', data: scanEmpty })
      map.current.addLayer({
        id: 'scan-bbox-outline',
        type: 'line',
        source: SCAN_BBOX_SRC,
        paint: {
          'line-color': '#00ffaa',
          'line-width': 2.5,
          'line-opacity': 1,
          'line-dasharray': [8, 4],
        },
      })
      map.current.addSource(SCAN_LINE_SRC, { type: 'geojson', data: scanEmpty })
      map.current.addLayer({
        id: 'scan-sweep',
        type: 'line',
        source: SCAN_LINE_SRC,
        paint: { 'line-color': '#00ffaa', 'line-width': 2, 'line-opacity': 0.9 },
      })
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  // ── Sync active overlay layers on map ──
  useEffect(() => {
    if (!map.current?.isStyleLoaded()) return
    OVERLAYS.forEach(ov => {
      if (activeLayers.has(ov.id)) {
        addOverlayLayers(map.current, ov)
      } else {
        removeOverlayLayers(map.current, ov)
        clearOverlaySource(map.current, ov.id)
      }
    })
  }, [activeLayers])

  // ── Refetch on map move (debounced) ──
  useEffect(() => {
    if (!map.current) return
    const handleMoveEnd = () => {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        activeLayers.forEach(id => fetchLayer(id))
      }, 600)
    }
    map.current.on('moveend', handleMoveEnd)
    return () => map.current?.off('moveend', handleMoveEnd)
  }, [activeLayers, fetchLayer])

  // ── Click popup on overlay features ──
  useEffect(() => {
    if (!map.current) return

    const layerIds = OVERLAYS.flatMap(ov => [fillId(ov.id), outlineId(ov.id)])

    const handleClick = (e) => {
      const existingLayers = layerIds.filter(id => map.current.getLayer(id))
      if (!existingLayers.length) return
      const features = map.current.queryRenderedFeatures(e.point, { layers: existingLayers })
      if (!features.length) return

      const feat  = features[0]
      const layId = OVERLAYS.find(ov =>
        feat.layer.id === fillId(ov.id) || feat.layer.id === outlineId(ov.id)
      )
      const ov    = layId
      const p     = feat.properties || {}

      const lines = []
      if (p.terrai_nom)  lines.push(`<strong>${p.terrai_nom}</strong>`)
      if (p.fase_ti)     lines.push(`Fase: ${p.fase_ti}`)
      if (p.modalidade)  lines.push(`Modalidade: ${p.modalidade}`)
      if (p.nome)        lines.push(`<strong>${p.nome}</strong>`)
      if (p.categoria)   lines.push(`Categoria: ${p.categoria}`)
      if (p.esfera)      lines.push(`Esfera: ${p.esfera}`)
      if (p.ano_cria)    lines.push(`Criada em: ${p.ano_cria}`)
      if (p.year)        lines.push(`Ano: ${p.year}`)
      if (p.classname)   lines.push(`Classe: ${p.classname}`)
      if (p.view_date)   lines.push(`Data: ${p.view_date}`)
      if (p.area_km != null) lines.push(`Área: ${(+p.area_km).toFixed(2)} km²`)

      if (popupRef.current) popupRef.current.remove()
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font:13px/1.5 sans-serif;color:#111">${lines.join('<br/>')}</div>`)
        .addTo(map.current)
    }

    map.current.on('click', handleClick)
    return () => map.current?.off('click', handleClick)
  }, [activeLayers])

  // ── Stats dots click popup ──
  useEffect(() => {
    if (!map.current) return

    const handleStatsClick = (e) => {
      const features = map.current.queryRenderedFeatures(e.point, { layers: [STATS_LAYER] })
      if (!features.length) return
      const p      = features[0].properties || {}
      const car    = p.cod_imovel || null
      const mun    = p.municipio || p.nm_municip || p.nm_mun || p.municipio_ || '—'
      const condic = p.des_condic || '—'

      const btnHtml = car ? `
        <button
          onclick="window.__carDoutorImovelData && window.__carDoutorImovelData('${car}');this.closest('.maplibregl-popup').remove();"
          style="
            margin-top:10px;width:100%;padding:6px 0;
            background:#0d2a0d;color:#4ecb71;border:1px solid #2d6e2d;border-radius:6px;
            font:600 11px sans-serif;cursor:pointer;letter-spacing:.3px;
          "
          onmouseover="this.style.background='#163016'"
          onmouseout="this.style.background='#0d2a0d'"
        >📋 Ver dados do imóvel</button>
        <button
          onclick="window.__carDoutorAnalyze && window.__carDoutorAnalyze('${car}',${e.lngLat.lng},${e.lngLat.lat});this.closest('.maplibregl-popup').remove();"
          style="
            margin-top:5px;width:100%;padding:6px 0;
            background:#1b6e1b;color:#fff;border:none;border-radius:6px;
            font:600 12px sans-serif;cursor:pointer;letter-spacing:.3px;
          "
          onmouseover="this.style.background='#2d8a2d'"
          onmouseout="this.style.background='#1b6e1b'"
        >🔍 Analisar este imóvel</button>` : ''

      if (popupRef.current) popupRef.current.remove()
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '270px' })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font:12px/1.5 sans-serif;color:#111;padding:2px 0">
            <div style="font-size:9px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">
              Imóvel SICAR · Painel Analítico
            </div>
            <div style="font-weight:700;font-size:13px">${mun}</div>
            <div style="color:#555;margin-top:5px;font-size:11px;line-height:1.5">
              <span style="color:#999">Condição:</span><br/>
              <strong>${condic}</strong>
            </div>
            ${car ? `<div style="font:10px/1.4 monospace;color:#aaa;margin-top:6px;word-break:break-all;padding:4px 6px;background:#f5f5f5;border-radius:4px">${car}</div>` : ''}
            ${btnHtml}
          </div>
        `)
        .addTo(map.current)
    }

    map.current.on('click', STATS_LAYER, handleStatsClick)
    map.current.on('mouseenter', STATS_LAYER, () => {
      if (map.current) map.current.getCanvas().style.cursor = 'pointer'
    })
    map.current.on('mouseleave', STATS_LAYER, () => {
      if (map.current) map.current.getCanvas().style.cursor = ''
    })

    return () => {
      map.current?.off('click', STATS_LAYER, handleStatsClick)
    }
  }, [])

  // ── Toggle handler ──
  function handleToggle(id) {
    setActiveLayers(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        // fetch immediately on activation
        setTimeout(() => fetchLayer(id), 0)
      }
      return next
    })
  }

  // ── Drawing mode ──
  useEffect(() => {
    if (!map.current) return

    if (!drawingMode) {
      drawnPoints.current = []
      clearTempMarkers()
      map.current.getCanvas().style.cursor = ''
      return
    }

    map.current.getCanvas().style.cursor = 'crosshair'

    const handleClick = (e) => {
      const pt = [e.lngLat.lng, e.lngLat.lat]
      drawnPoints.current.push(pt)
      const el = document.createElement('div')
      el.style.cssText = 'width:8px;height:8px;background:#4ecb71;border-radius:50%;border:2px solid #fff;'
      const marker = new maplibregl.Marker({ element: el }).setLngLat(pt).addTo(map.current)
      tempMarkers.current.push(marker)
    }

    const handleDblClick = (e) => {
      e.preventDefault()
      if (drawnPoints.current.length < 3) return
      const coords   = [...drawnPoints.current, drawnPoints.current[0]]
      const geometry = { type: 'Polygon', coordinates: [coords] }
      clearTempMarkers()
      drawnPoints.current = []
      map.current.getCanvas().style.cursor = ''
      onPolygonDrawn(geometry)
    }

    map.current.on('click', handleClick)
    map.current.on('dblclick', handleDblClick)
    return () => {
      map.current.off('click', handleClick)
      map.current.off('dblclick', handleDblClick)
      map.current.getCanvas().style.cursor = ''
    }
  }, [drawingMode, onPolygonDrawn])

  function clearTempMarkers() {
    tempMarkers.current.forEach(m => m.remove())
    tempMarkers.current = []
  }

  function geomCentroid(geometry) {
    const allCoords = geometry.type === 'MultiPolygon'
      ? geometry.coordinates.flatMap(p => p[0])
      : geometry.coordinates[0]
    const lngs = allCoords.map(c => c[0])
    const lats = allCoords.map(c => c[1])
    return [
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
      (Math.min(...lats) + Math.max(...lats)) / 2,
    ]
  }

  function placeLaudoMarker(laudo, geometry) {
    if (laudoMarker.current) {
      laudoMarker.current.remove()
      laudoMarker.current = null
    }

    const center = geomCentroid(geometry)
    const status = laudo?.status_geral ?? 'ok'
    const colors = { ok: '#4ecb71', atencao: '#f5a623', critico: '#e8413a' }
    const labels = { ok: 'Conforme', atencao: 'Atenção', critico: 'Crítico' }
    const color  = colors[status] ?? colors.ok

    // Custom pin element
    const el = document.createElement('div')
    el.style.cssText = `
      width: 32px; height: 40px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      filter: drop-shadow(0 3px 6px rgba(0,0,0,0.45));
    `
    el.innerHTML = `
      <svg viewBox="0 0 32 40" width="32" height="40" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0 C7.163 0 0 7.163 0 16 C0 28 16 40 16 40 C16 40 32 28 32 16 C32 7.163 24.837 0 16 0 Z"
          fill="${color}" stroke="#fff" stroke-width="2"/>
        <circle cx="16" cy="16" r="6" fill="#fff" fill-opacity="0.9"/>
      </svg>
    `

    const car   = laudo?.car_code ?? '—'
    const area  = laudo?.area_imovel_ha != null ? `${laudo.area_imovel_ha.toFixed(1)} ha` : '—'
    const mun   = laudo?.municipio ?? '—'
    const pend  = laudo?.total_pendencias ?? 0
    const crit  = laudo?.pendencias_criticas ?? 0
    const stLbl = labels[status] ?? status

    const popup = new maplibregl.Popup({
      offset: [0, -42],
      closeButton: true,
      maxWidth: '280px',
      className: 'laudo-popup',
    }).setHTML(`
      <div style="font-family:'Segoe UI',sans-serif;padding:2px 0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;letter-spacing:.5px">${stLbl.toUpperCase()}</span>
          <span style="font-size:11px;color:#666">${car !== '—' ? car.slice(-12) : '—'}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <tr><td style="color:#888;padding:2px 0">Município</td><td style="text-align:right;font-weight:600">${mun}</td></tr>
          <tr><td style="color:#888;padding:2px 0">Área</td><td style="text-align:right;font-weight:600">${area}</td></tr>
          <tr><td style="color:#888;padding:2px 0">Pendências</td><td style="text-align:right;font-weight:600">${pend} total · <span style="color:#e8413a">${crit} críticas</span></td></tr>
        </table>
      </div>
    `)

    laudoMarker.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat(center)
      .setPopup(popup)
      .addTo(map.current)

    // Auto-open popup
    laudoMarker.current.togglePopup()
  }

  function showPropertyOnMap(geometry) {
    if (!map.current?.isStyleLoaded()) return
    const features = [{ type: 'Feature', geometry, properties: { type: 'property' } }]
    map.current.getSource(RESULT_SOURCE).setData({ type: 'FeatureCollection', features })
    const coords = geometry.coordinates[0]
    const lngs   = coords.map(c => c[0])
    const lats   = coords.map(c => c[1])
    map.current.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 80, duration: 1000 },
    )
  }

  return (
    <div style={{ flex: 1, position: 'relative', height: '100vh' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      <LayerPanel active={activeLayers} loading={loadingLayers} onToggle={handleToggle} />

      {drawingMode && (
        <div className="map-tip">
          Clique para adicionar pontos · Duplo clique para finalizar
        </div>
      )}
    </div>
  )
})
