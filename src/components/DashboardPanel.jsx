import { useState, useEffect, useCallback, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function condicColor(text = '') {
  const t = (text || '').toLowerCase()
  if (t.includes('conformidade'))                        return '#4ecb71'
  if (t.includes('regulariza') && !t.includes('aguard')) return '#a3e635'
  if (t.includes('aguard') || t.includes('analise') || t.includes('análise') || t.includes('pendente')) return '#f5a623'
  if (t.includes('notifica'))                            return '#fb923c'
  if (t.includes('cancel') || t.includes('suspen'))      return '#e8413a'
  if (t.includes('retif') || t.includes('recad') || t.includes('duplic')) return '#60a5fa'
  return '#6b9e6b'
}

function fmt(n) {
  return n?.toLocaleString('pt-BR') ?? '—'
}

function geomBbox(geom) {
  if (!geom?.coordinates) return null
  const pts = []
  function collect(c) {
    if (typeof c[0] === 'number') pts.push(c)
    else c.forEach(collect)
  }
  collect(geom.coordinates)
  if (!pts.length) return null
  const lngs = pts.map(c => c[0])
  const lats  = pts.map(c => c[1])
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
}

function munFromProps(p) {
  return p?.municipio || p?.nm_municip || p?.nm_mun || p?.municipio_ || '—'
}

const ESTADOS = [
  { uf: 'MT', label: 'Mato Grosso' },
  { uf: 'DF', label: 'Distrito Federal' },
]

export default function DashboardPanel({ mapRef, open, onClose, onSelect, onAnalyze }) {
  const [uf, setUf]                 = useState('MT')
  const [stats, setStats]           = useState(null)
  const [loading, setLoading]       = useState(false)
  const [activeFilter, setActive]   = useState(null)
  const [imoveis, setImoveis]       = useState([])
  const [imoveisFeatures, setFeatures] = useState([])
  const [imoveisTotal, setTotal]    = useState(0)
  const [loadingMap, setLoadingMap] = useState(false)
  const [tab, setTab]               = useState('condicao')
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState(null)

  const [pos,  setPos]  = useState(null)
  const [size, setSize] = useState({ w: 820, h: undefined })
  const [minimized, setMinimized] = useState(false)
  const dragRef         = useRef(null)
  const hasDraggedRef   = useRef(false)
  const panelRef        = useRef(null)

  // ── Drag ─────────────────────────────────────────────────────────────────
  const onHeaderMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    hasDraggedRef.current = false
    const rect = panelRef.current.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top }
    function onMove(e) {
      const d = dragRef.current
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasDraggedRef.current = true
      setPos({ left: d.startLeft + dx, top: d.startTop + dy })
    }
    function onUp() {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const onHeaderClick = useCallback((e) => {
    if (e.target.closest('button')) return
    if (hasDraggedRef.current) return
    setMinimized(m => !m)
  }, [])

  // ── Resize ────────────────────────────────────────────────────────────────
  const onResizeMouseDown = useCallback((dir) => (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const rect   = panelRef.current.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const startW = rect.width
    const startH = rect.height
    function onMove(e) {
      if (dir === 'e' || dir === 'se') {
        setSize(s => ({ ...s, w: Math.max(500, startW + (startX - e.clientX)) }))
      }
      if (dir === 's' || dir === 'se') {
        setSize(s => ({ ...s, h: Math.max(300, startH + (e.clientY - startY)) }))
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // ── Load stats ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setStats(null)
    setActive(null)
    setImoveis([])
    setFeatures([])
    setTotal(0)
    setSearch('')
    setSelected(null)
    setTab('condicao')
    mapRef.current?.clearStatsLayer()
    setLoading(true)
    fetch(`${API_BASE}/stats?uf=${uf}`)
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(e => console.error('Dashboard stats error:', e))
      .finally(() => setLoading(false))
  }, [open, uf])

  // ── Load filter ───────────────────────────────────────────────────────────
  const loadFilter = useCallback(async (type, value) => {
    const same = activeFilter?.type === type && activeFilter?.value === value
    if (same) {
      setActive(null)
      setImoveis([])
      setFeatures([])
      setTotal(0)
      mapRef.current?.clearStatsLayer()
      setTab('condicao')
      return
    }
    setActive({ type, value })
    setLoadingMap(true)
    setImoveis([])
    setFeatures([])
    setSearch('')
    setSelected(null)
    onSelect?.()
    const param = type === 'condic'
      ? `condic=${encodeURIComponent(value)}`
      : `municipio=${encodeURIComponent(value)}`
    try {
      const res = await fetch(`${API_BASE}/stats/map?${param}&uf=${uf}&limit=1000`)
      const fc  = await res.json()
      mapRef.current?.showStatsLayer(fc)
      const feats = (fc.features || []).filter(f => f.properties?.cod_imovel)
      const list  = feats.map(f => f.properties)
      setTotal(list.length)
      setImoveis(list)
      setFeatures(feats)
      setTab('cadastros')
    } catch (e) {
      console.error('Dashboard filter error:', e)
    } finally {
      setLoadingMap(false)
    }
  }, [activeFilter, mapRef, onSelect, uf])

  function handleClearFilter() {
    setActive(null)
    setImoveis([])
    setTotal(0)
    setSearch('')
    setSelected(null)
    mapRef.current?.clearStatsLayer()
    setTab('condicao')
  }

  const filtered = imoveis.filter(p => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (p.cod_imovel || '').toLowerCase().includes(q) ||
      munFromProps(p).toLowerCase().includes(q)
    )
  })

  if (!open) return null

  const maxCondic = stats ? Math.max(...stats.por_condicao.map(x => x.count), 1) : 1
  const maxMun    = stats?.municipios?.length ? stats.municipios[0].count : 1

  const totalAtivos = stats?.por_condicao
    .filter(x => condicColor(x.codigo) === '#4ecb71')
    .reduce((s, x) => s + x.count, 0) ?? 0
  const pctAtivos = stats ? ((totalAtivos / stats.total) * 100).toFixed(0) + '%' : '—'

  const filterTotal = activeFilter
    ? activeFilter.type === 'condic'
      ? stats?.por_condicao.find(x => x.codigo === activeFilter.value)?.count ?? null
      : stats?.municipios.find(m => m.nome === activeFilter.value)?.count ?? null
    : null

  const panelStyle = {
    width: size.w,
    ...(size.h != null ? { height: size.h } : {}),
    ...(pos ? { left: pos.left, top: pos.top, right: 'auto', transform: 'none' } : {}),
  }

  return (
    <div className={`dash-panel ${minimized ? 'dash-panel--minimized' : ''}`} ref={panelRef} style={panelStyle}>
      {!minimized && <div className="dash-resize-e"  onMouseDown={onResizeMouseDown('e')} />}
      {!minimized && <div className="dash-resize-s"  onMouseDown={onResizeMouseDown('s')} />}
      {!minimized && <div className="dash-resize-se" onMouseDown={onResizeMouseDown('se')}>⤡</div>}

      {/* Header */}
      <div className="dash-hd dash-hd--drag" onMouseDown={onHeaderMouseDown} onClick={onHeaderClick}>
        <div className="dash-hd-left">
          <span className="dash-hd-icon">📊</span>
          <div>
            <div className="dash-title">Painel Analítico</div>
            {!minimized && (
              <div className="dash-subtitle">
                Cadastros SICAR · {ESTADOS.find(e => e.uf === uf)?.label ?? uf}
              </div>
            )}
          </div>
        </div>
        <div className="dash-hd-actions">
          {!minimized && (
            <div className="dash-uf-selector" onClick={e => e.stopPropagation()}>
              {ESTADOS.map(e => (
                <button
                  key={e.uf}
                  className={`dash-uf-btn ${uf === e.uf ? 'active' : ''}`}
                  onClick={() => setUf(e.uf)}
                  title={e.label}
                >
                  {e.uf}
                </button>
              ))}
            </div>
          )}
          <button
            className="dash-minimize"
            onClick={() => setMinimized(m => !m)}
            title={minimized ? 'Expandir' : 'Minimizar'}
          >
            {minimized ? '□' : '─'}
          </button>
          <button className="dash-close" onClick={onClose} title="Fechar">×</button>
        </div>
      </div>

      {/* Totais */}
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
          <div className="dash-total-card">
            <div className="dash-total-val" style={{ color: '#4ecb71' }}>{pctAtivos}</div>
            <div className="dash-total-lbl">em conformidade</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="dash-tabs">
        <button className={`dash-tab ${tab === 'condicao'   ? 'active' : ''}`} onClick={() => setTab('condicao')}>
          Condição
        </button>
        <button className={`dash-tab ${tab === 'municipios' ? 'active' : ''}`} onClick={() => setTab('municipios')}>
          Municípios
        </button>
        <button
          className={`dash-tab ${tab === 'cadastros' ? 'active' : ''} ${imoveis.length > 0 ? 'has-data' : ''}`}
          onClick={() => setTab('cadastros')}
          disabled={imoveis.length === 0}
        >
          Cadastros{imoveis.length > 0 ? ` (${fmt(imoveisTotal)})` : ''}
        </button>
        {loadingMap && <span className="dash-map-spin" />}
      </div>

      {/* Active filter chip */}
      {activeFilter && (
        <div className="dash-filter-chip">
          <span className="dash-chip-dot" style={{ background: activeFilter.type === 'condic' ? condicColor(activeFilter.value) : '#60a5fa' }} />
          <span>{activeFilter.value}</span>
          <button className="dash-chip-clear" onClick={handleClearFilter}>×</button>
        </div>
      )}

      {/* Body */}
      <div className="dash-body">
        {loading && (
          <div className="dash-loading">
            <div className="dash-spinner" />
            <span>Carregando estatísticas...</span>
          </div>
        )}

        {/* ── Tab: Condição ── */}
        {stats && tab === 'condicao' && (
          <div className="dash-bars">
            {stats.por_condicao.map(item => {
              const color    = condicColor(item.codigo)
              const pct      = (item.count / stats.total * 100).toFixed(1)
              const barW     = (item.count / maxCondic * 100).toFixed(1)
              const isActive = activeFilter?.type === 'condic' && activeFilter?.value === item.codigo
              return (
                <div
                  key={item.codigo}
                  className={`dash-bar-row ${isActive ? 'active' : ''}`}
                  onClick={() => loadFilter('condic', item.codigo)}
                  title="Clique para ver no mapa e listar cadastros"
                >
                  <div className="dash-bar-meta">
                    <span className="dash-bar-dot" style={{ background: color }} />
                    <span className="dash-bar-label">{item.codigo}</span>
                    <span className="dash-bar-count">{fmt(item.count)}</span>
                    <span className="dash-bar-pct">{pct}%</span>
                  </div>
                  <div className="dash-bar-track">
                    <div className="dash-bar-fill" style={{ width: `${barW}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Tab: Municípios ── */}
        {stats && tab === 'municipios' && (
          <div className="dash-mun-list">
            {stats.municipios.map((m, i) => {
              const isActive = activeFilter?.type === 'mun' && activeFilter?.value === m.nome
              return (
                <div
                  key={m.nome}
                  className={`dash-mun-row ${isActive ? 'active' : ''}`}
                  onClick={() => loadFilter('mun', m.nome)}
                  title="Clique para ver no mapa e listar cadastros"
                >
                  <span className="dash-mun-rank">#{i + 1}</span>
                  <span className="dash-mun-nome">{m.nome}</span>
                  <div className="dash-mun-bar-track">
                    <div className="dash-mun-bar-fill" style={{ width: `${(m.count / maxMun * 100).toFixed(1)}%` }} />
                  </div>
                  <span className="dash-mun-count">{fmt(m.count)}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Tab: Cadastros ── */}
        {tab === 'cadastros' && (
          <div className="dash-cadastros-split">

            {/* Coluna esquerda — lista */}
            <div className="dash-imoveis-wrap">
              {imoveis.length > 0 && (
                <div className="dash-search-row">
                  <span className="dash-search-icon">🔍</span>
                  <input
                    className="dash-search"
                    type="text"
                    placeholder="Código CAR ou município..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    autoFocus
                  />
                  {search && <button className="dash-search-clear" onClick={() => setSearch('')}>×</button>}
                  {search
                    ? <span className="dash-search-count">{fmt(filtered.length)} resultado{filtered.length !== 1 ? 's' : ''}</span>
                    : filterTotal != null && imoveisTotal < filterTotal
                      ? <span className="dash-search-count dash-search-trunc" title="Limite de exibição atingido">
                          {fmt(imoveisTotal)} de {fmt(filterTotal)}
                        </span>
                      : null
                  }
                </div>
              )}

              {loadingMap && (
                <div className="dash-loading">
                  <div className="dash-spinner" />
                  <span>Carregando cadastros...</span>
                </div>
              )}

              {!loadingMap && imoveis.length === 0 && (
                <div className="dash-empty">
                  Selecione uma condição ou município<br />para listar os cadastros.
                </div>
              )}

              {!loadingMap && filtered.length === 0 && search && (
                <div className="dash-empty">Nenhum resultado para "{search}".</div>
              )}

              <div className="dash-imoveis-list">
                {filtered.map(p => {
                  const code   = p.cod_imovel
                  const mun    = munFromProps(p)
                  const condic = p.des_condic || ''
                  const color  = condicColor(condic)
                  const isSel  = selected?.cod_imovel === code
                  return (
                    <div
                      key={code}
                      className={`dash-imovel-row ${isSel ? 'selected' : ''}`}
                      onClick={() => setSelected(isSel ? null : p)}
                    >
                      <span className="dash-imovel-dot" style={{ background: color }} title={condic} />
                      <div className="dash-imovel-info">
                        <span className="dash-imovel-code">{code}</span>
                        <span className="dash-imovel-meta">{mun}</span>
                      </div>
                      <span className="dash-imovel-chevron">{isSel ? '‹' : '›'}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Coluna direita — detalhes */}
            <div className={`dash-detail-pane ${selected ? 'visible' : ''}`}>
              {!selected && (
                <div className="dash-detail-empty">
                  <span className="dash-detail-empty-icon">←</span>
                  <span>Selecione um cadastro para ver detalhes</span>
                </div>
              )}

              {selected && (() => {
                const code   = selected.cod_imovel
                const mun    = munFromProps(selected)
                const condic = selected.des_condic || '—'
                const status = selected.ind_status || '—'
                const color  = condicColor(condic)

                return (
                  <div className="dash-detail-content">
                    <div className="dash-detail-hd">
                      <span className="dash-detail-badge" style={{ background: color + '22', borderColor: color, color }}>
                        {condic}
                      </span>
                    </div>

                    <div className="dash-detail-section">
                      <div className="dash-detail-label">Código CAR</div>
                      <div className="dash-detail-value dash-detail-mono">{code}</div>
                    </div>

                    <div className="dash-detail-row2">
                      <div className="dash-detail-section">
                        <div className="dash-detail-label">Município</div>
                        <div className="dash-detail-value">{mun}</div>
                      </div>
                      <div className="dash-detail-section">
                        <div className="dash-detail-label">Status</div>
                        <div className="dash-detail-value">{status === 'AT' ? 'Ativo' : status === 'CA' ? 'Cancelado' : status === 'SU' ? 'Suspenso' : status}</div>
                      </div>
                    </div>

                    <div className="dash-detail-section">
                      <div className="dash-detail-label">Situação cadastral</div>
                      <div className="dash-detail-value">{condic}</div>
                    </div>

                    <div className="dash-detail-divider" />

                    <div className="dash-detail-info-box">
                      <span className="dash-detail-info-icon">ℹ</span>
                      <span>Para visualizar APP, RL, desmatamento e demais métricas ambientais, execute a análise completa deste imóvel.</span>
                    </div>

                    <div className="dash-detail-actions">
                      <button
                        className="dash-detail-vermapa"
                        onClick={() => {
                          const feat = imoveisFeatures.find(f => f.properties?.cod_imovel === code)
                          const bbox = feat ? geomBbox(feat.geometry) : null
                          if (bbox) mapRef.current?.flyToBbox(bbox)
                          setMinimized(true)
                        }}
                      >
                        🗺️ Ver no mapa
                      </button>
                      <button
                        className="dash-detail-analisar"
                        onClick={() => { setMinimized(true); onAnalyze?.(code) }}
                      >
                        🔍 Analisar imóvel completo
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
