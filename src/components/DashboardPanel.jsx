import { useState, useEffect, useCallback, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const CONDIC_LABELS = {
  AT: 'Ativo',
  AC: 'Ag. Confirmação',
  AN: 'Ag. Análise',
  PE: 'Pendente',
  CC: 'Cancelado',
  CS: 'Com Suspensão',
  SU: 'Suspenso',
  CA: 'Cancelado',
  RF: 'Req. Fase II',
  PA: 'Pend. Análise',
  RA: 'Recadastrado',
  RE: 'Retificação',
  'N/A': 'Não Informado',
}

const CONDIC_COLORS = {
  AT: '#4ecb71',
  AC: '#f5c842',
  AN: '#f5a623',
  PE: '#f5a623',
  PA: '#f5c842',
  RA: '#60a5fa',
  RE: '#60a5fa',
  CC: '#e8413a',
  CS: '#ff6b6b',
  SU: '#e8413a',
  CA: '#e8413a',
  RF: '#a78bfa',
  'N/A': '#6b9e6b',
}

function fmt(n) {
  return n?.toLocaleString('pt-BR') ?? '—'
}

export default function DashboardPanel({ mapRef, open, onClose, onSelect }) {
  const [stats, setStats]           = useState(null)
  const [loading, setLoading]       = useState(false)
  const [activeCondic, setActive]   = useState(null)
  const [loadingMap, setLoadingMap] = useState(false)
  const [tab, setTab]               = useState('condicao')

  // ── Drag ──────────────────────────────────────────────────────────────────
  const [pos,  setPos]  = useState(null) // null = CSS default (top:72 right:16)
  const [size, setSize] = useState({ w: 310, h: null }) // null h = CSS max-height
  const dragRef         = useRef(null)
  const panelRef        = useRef(null)

  const onHeaderMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const rect = panelRef.current.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top }

    function onMove(e) {
      const d = dragRef.current
      setPos({ left: d.startLeft + e.clientX - d.startX, top: d.startTop + e.clientY - d.startY })
    }
    function onUp() {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // ── Resize ────────────────────────────────────────────────────────────────
  const onResizeMouseDown = useCallback((dir) => (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const rect    = panelRef.current.getBoundingClientRect()
    const startX  = e.clientX
    const startY  = e.clientY
    const startW  = rect.width
    const startH  = rect.height

    function onMove(e) {
      if (dir === 'e' || dir === 'se') {
        // resize from left edge → wider to the right
        const dw = startX - e.clientX
        setSize(s => ({ ...s, w: Math.max(240, startW + dw) }))
      }
      if (dir === 's' || dir === 'se') {
        const dh = e.clientY - startY
        setSize(s => ({ ...s, h: Math.max(200, startH + dh) }))
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  useEffect(() => {
    if (!open) return
    if (stats) return
    setLoading(true)
    fetch(`${API_BASE}/stats`)
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(e => console.error('Dashboard stats error:', e))
      .finally(() => setLoading(false))
  }, [open, stats])

  const handleSelectCondic = useCallback(async (condic) => {
    if (activeCondic === condic) {
      setActive(null)
      mapRef.current?.clearStatsLayer()
      return
    }
    setActive(condic)
    setLoadingMap(true)
    onSelect?.()
    try {
      const res = await fetch(`${API_BASE}/stats/map?condic=${encodeURIComponent(condic)}&limit=500`)
      const fc = await res.json()
      mapRef.current?.showStatsLayer(fc)
    } catch (e) {
      console.error('Dashboard map error:', e)
    } finally {
      setLoadingMap(false)
    }
  }, [activeCondic, mapRef, onSelect])

  const handleSelectMun = useCallback(async (municipio) => {
    setActive('__mun__' + municipio)
    setLoadingMap(true)
    onSelect?.()
    try {
      const res = await fetch(`${API_BASE}/stats/map?municipio=${encodeURIComponent(municipio)}&limit=500`)
      const fc = await res.json()
      mapRef.current?.showStatsLayer(fc)
    } catch (e) {
      console.error('Dashboard mun error:', e)
    } finally {
      setLoadingMap(false)
    }
  }, [mapRef, onSelect])

  function handleClearFilter() {
    setActive(null)
    mapRef.current?.clearStatsLayer()
  }

  if (!open) return null

  const maxCondic = stats ? Math.max(...stats.por_condicao.map(x => x.count), 1) : 1
  const maxMun = stats?.municipios?.length ? stats.municipios[0].count : 1

  const panelStyle = {
    width: size.w,
    ...(size.h ? { height: size.h, maxHeight: size.h } : {}),
    ...(pos ? { left: pos.left, top: pos.top, right: 'auto' } : {}),
  }

  return (
    <div className="dash-panel" ref={panelRef} style={panelStyle}>
      {/* Resize handles */}
      <div className="dash-resize-e"  onMouseDown={onResizeMouseDown('e')} />
      <div className="dash-resize-s"  onMouseDown={onResizeMouseDown('s')} />
      <div className="dash-resize-se" onMouseDown={onResizeMouseDown('se')}>⤡</div>

      {/* Header */}
      <div className="dash-hd dash-hd--drag" onMouseDown={onHeaderMouseDown}>
        <div className="dash-hd-left">
          <span className="dash-hd-icon">📊</span>
          <div>
            <div className="dash-title">Painel Analítico</div>
            <div className="dash-subtitle">Cadastros SICAR · MT</div>
          </div>
        </div>
        <button className="dash-close" onClick={onClose} title="Fechar">×</button>
      </div>

      {/* Total card */}
      {stats && (
        <div className="dash-totals">
          <div className="dash-total-card">
            <div className="dash-total-val">{fmt(stats.total)}</div>
            <div className="dash-total-lbl">imóveis cadastrados</div>
          </div>
          <div className="dash-total-card">
            <div className="dash-total-val">{stats.municipios?.length ?? '—'}</div>
            <div className="dash-total-lbl">municípios</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="dash-tabs">
        <button
          className={`dash-tab ${tab === 'condicao' ? 'active' : ''}`}
          onClick={() => setTab('condicao')}
        >Condição</button>
        <button
          className={`dash-tab ${tab === 'municipios' ? 'active' : ''}`}
          onClick={() => setTab('municipios')}
        >Municípios</button>
        {loadingMap && <span className="dash-map-spin" />}
      </div>

      {/* Body */}
      <div className="dash-body">
        {loading && (
          <div className="dash-loading">
            <div className="dash-spinner" />
            <span>Carregando estatísticas...</span>
          </div>
        )}

        {/* Condição cadastral */}
        {stats && tab === 'condicao' && (
          <div className="dash-bars">
            {stats.por_condicao.map(item => {
              const label  = CONDIC_LABELS[item.codigo] || item.codigo
              const color  = CONDIC_COLORS[item.codigo] || '#888'
              const pct    = (item.count / stats.total * 100).toFixed(1)
              const barW   = (item.count / maxCondic * 100).toFixed(1)
              const active = activeCondic === item.codigo
              return (
                <div
                  key={item.codigo}
                  className={`dash-bar-row ${active ? 'active' : ''}`}
                  onClick={() => handleSelectCondic(item.codigo)}
                  title="Clique para visualizar no mapa"
                >
                  <div className="dash-bar-meta">
                    <span className="dash-bar-dot" style={{ background: color }} />
                    <span className="dash-bar-label">{label}</span>
                    <span className="dash-bar-count">{fmt(item.count)}</span>
                    <span className="dash-bar-pct">{pct}%</span>
                  </div>
                  <div className="dash-bar-track">
                    <div
                      className="dash-bar-fill"
                      style={{ width: `${barW}%`, background: color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Municípios */}
        {stats && tab === 'municipios' && (
          <div className="dash-mun-list">
            {stats.municipios.map((m, i) => {
              const active = activeCondic === `__mun__${m.nome}`
              return (
                <div
                  key={m.nome}
                  className={`dash-mun-row ${active ? 'active' : ''}`}
                  onClick={() => handleSelectMun(m.nome)}
                  title="Clique para visualizar no mapa"
                >
                  <span className="dash-mun-rank">#{i + 1}</span>
                  <span className="dash-mun-nome">{m.nome}</span>
                  <div className="dash-mun-bar-track">
                    <div
                      className="dash-mun-bar-fill"
                      style={{ width: `${(m.count / maxMun * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <span className="dash-mun-count">{fmt(m.count)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Active filter chip */}
      {activeCondic && (
        <div className="dash-filter-chip">
          <span className="dash-chip-dot" />
          <span>
            {activeCondic.startsWith('__mun__')
              ? activeCondic.slice(7)
              : (CONDIC_LABELS[activeCondic] || activeCondic)}
            {' '}no mapa
          </span>
          <button className="dash-chip-clear" onClick={handleClearFilter}>×</button>
        </div>
      )}
    </div>
  )
}
