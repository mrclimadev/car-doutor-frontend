import { useState, useRef, useCallback, useEffect } from 'react'
import MapView from './components/MapView'
import LaudoModal from './components/LaudoModal'
import ImovelModal from './components/ImovelModal'
import DashboardPanel from './components/DashboardPanel'
import './styles.css'

const API_BASE   = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const HISTORY_KEY = 'car-history'
const MAX_HISTORY = 15

const BASE_STEPS = [
  { icon: '📍', label: 'Resolvendo geometria do imóvel',          ms: 900  },
  { icon: '🌊', label: 'Calculando APP — Preservação Permanente', ms: 900  },
  { icon: '🌳', label: 'Verificando Reserva Legal',               ms: 1000 },
  { icon: '🛰️', label: 'Consultando PRODES / DETER',             ms: 4500 },
  { icon: '⚖️', label: 'Verificando TI e Unid. de Conservação',  ms: 4000 },
  { icon: '🧪', label: 'Analisando solo (SoilGrids/ISRIC)',       ms: 3500 },
]
const STEP_AI       = { icon: '🤖', label: 'Gerando resumos com inteligência artificial', ms: 99999 }
const STEP_TEMPLATE = { icon: '📄', label: 'Gerando resumo por regras',                   ms: 99999 }

const STATUS_LABEL = { ok: 'Conforme', atencao: 'Atenção', critico: 'Crítico' }
const STATUS_CLR   = { ok: '#4ecb71', atencao: '#f5a623', critico: '#f5564a' }

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [] }
  catch { return [] }
}

function saveHistory(items) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)) }
  catch { /* quota exceeded — ignore */ }
}

function fmtTime(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function App() {
  const [carCode, setCarCode]   = useState('')
  const [drawingMode, setDrawingMode] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [laudo, setLaudo]       = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [theme, setTheme]       = useState(() => localStorage.getItem('car-theme') || 'dark')
  const [history, setHistory]   = useState(loadHistory)
  const [histOpen, setHistOpen] = useState(true)
  const [dashOpen, setDashOpen] = useState(false)
  const [useAI, setUseAI]       = useState(() => localStorage.getItem('car-use-ai') !== 'false')
  const [imovelCode, setImovelCode] = useState(null)

  const mapRef     = useRef(null)
  const stepTimer  = useRef(null)
  const [loadingStep, setLoadingStep] = useState(0)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('car-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('car-use-ai', String(useAI))
  }, [useAI])

  // Globais para popups do mapa dispararem ações React
  useEffect(() => {
    window.__carDoutorAnalyze  = (code) => { setCarCode(code); runAnalysis({ car_code: code }, null) }
    window.__carDoutorImovelData = (code) => { setModalOpen(false); setImovelCode(code) }
    return () => { delete window.__carDoutorAnalyze; delete window.__carDoutorImovelData }
  }, [useAI]) // re-registra quando useAI muda para capturar o valor atual

  const analysisSteps = [...BASE_STEPS, useAI ? STEP_AI : STEP_TEMPLATE]

  useEffect(() => {
    clearTimeout(stepTimer.current)
    if (!loading) { setLoadingStep(0); return }

    setLoadingStep(0)
    let idx = 0

    function advance() {
      idx += 1
      if (idx >= analysisSteps.length) return
      setLoadingStep(idx)
      if (analysisSteps[idx].ms < 99999) {
        stepTimer.current = setTimeout(advance, analysisSteps[idx].ms)
      }
    }
    stepTimer.current = setTimeout(advance, analysisSteps[0].ms)
    return () => clearTimeout(stepTimer.current)
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runAnalysis(body, geometry) {
    setLoading(true)
    setError(null)
    setLaudo(null)
    setModalOpen(false)

    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, use_ai: useAI }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Erro na análise')
      }

      const data = await res.json()
      setLaudo(data)
      setModalOpen(true)

      // Show on map
      const geom = geometry || data.geometry || null
      if (geom) mapRef.current?.showResult(data, geom)

      // Save to history
      const entry = {
        id: Date.now(),
        ts: new Date().toISOString(),
        car_code: data.car_code || null,
        area_ha: data.area_imovel_ha,
        municipio: data.municipio || null,
        status: data.status_geral,
        pendencias: data.total_pendencias,
        laudo: data,
      }
      setHistory(prev => {
        const next = [entry, ...prev.filter(h => h.id !== entry.id)].slice(0, MAX_HISTORY)
        saveHistory(next)
        return next
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleCarSearch(e) {
    e.preventDefault()
    if (!carCode.trim()) return
    runAnalysis({ car_code: carCode.trim() }, null)
  }

  const handlePolygonDrawn = useCallback((geometry) => {
    setDrawingMode(false)
    runAnalysis({ geometry }, geometry)
  }, [])

  function toggleDrawing() {
    setDrawingMode(prev => {
      if (prev) mapRef.current?.clearResult()
      return !prev
    })
    setLaudo(null)
    setError(null)
  }

  function openHistoryItem(entry) {
    setLaudo(entry.laudo)
    setModalOpen(true)
    const geom = entry.laudo.geometry || null
    if (geom) mapRef.current?.showResult(entry.laudo, geom)
  }

  function removeHistoryItem(id, e) {
    e.stopPropagation()
    setHistory(prev => {
      const next = prev.filter(h => h.id !== id)
      saveHistory(next)
      return next
    })
  }

  function clearHistory() {
    setHistory([])
    saveHistory([])
  }

  function handleReset() {
    setLaudo(null)
    setModalOpen(false)
    mapRef.current?.clearResult()
  }

  const statusColor = laudo ? STATUS_CLR[laudo.status_geral] : null

  return (
    <div id="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="header">
          <div className="header-row">
            <h1>🌿 CAR Doutor</h1>
            <div className="header-actions">
              <button
                className={`dash-toggle-btn ${dashOpen ? 'active' : ''}`}
                onClick={() => setDashOpen(o => !o)}
                title="Painel analítico"
              >
                📊
              </button>
              <button
                className="theme-toggle"
                onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
          <p>Análise automática de inconsistências do CAR</p>
        </div>

        <div className="search-panel">
          <form onSubmit={handleCarSearch}>
            <label>Código CAR</label>
            <div className="input-row">
              <input
                value={carCode}
                onChange={e => setCarCode(e.target.value)}
                placeholder="MT-XXXXXXX-..."
                disabled={loading || drawingMode}
              />
              <button className="btn-primary" type="submit"
                disabled={loading || drawingMode || !carCode.trim()}>
                Analisar
              </button>
            </div>
          </form>

          <div className="divider">ou</div>

          <button className={`btn-secondary ${drawingMode ? 'active' : ''}`}
            onClick={toggleDrawing} disabled={loading}>
            {drawingMode ? '✋ Cancelar desenho' : '✏️ Desenhar imóvel'}
          </button>

          {drawingMode && (
            <div className="draw-hint">
              Clique para adicionar pontos.<br />
              <strong>Duplo clique</strong> para fechar o polígono.
            </div>
          )}

          <div
            className={`ai-toggle-row ${loading ? 'disabled' : ''}`}
            onClick={() => !loading && setUseAI(v => !v)}
          >
            <div className="ai-toggle-info">
              <span className="ai-toggle-ico">{useAI ? '🤖' : '📄'}</span>
              <span className="ai-toggle-txt">{useAI ? 'Resumos com IA' : 'Template padrão'}</span>
            </div>
            <div className={`ai-sw ${useAI ? 'on' : ''}`}>
              <div className="ai-sw-thumb" />
            </div>
          </div>
        </div>

        {loading && (
          <div className="steps-wrap">
            {/* Barra de progresso */}
            <div className="steps-progress-bar">
              <div
                className="steps-progress-fill"
                style={{ width: `${((loadingStep + 1) / analysisSteps.length) * 100}%` }}
              />
            </div>

            {/* Passo ativo em destaque */}
            <div className="steps-active-row">
              <div className="steps-spinner" />
              <span className="steps-active-ico">{analysisSteps[loadingStep]?.icon}</span>
              <span className="steps-active-lbl">{analysisSteps[loadingStep]?.label}</span>
              <span className="steps-counter">{loadingStep + 1}/{analysisSteps.length}</span>
            </div>

            {/* Lista compacta de todos os passos */}
            <div className="steps-list">
              {analysisSteps.map((step, i) => {
                const done   = i < loadingStep
                const active = i === loadingStep
                return (
                  <div key={i} className={`steps-item ${done ? 'done' : active ? 'active' : 'pending'}`}>
                    <span className="steps-ico">{step.icon}</span>
                    <span className="steps-lbl">{step.label}</span>
                    {done   && <span className="steps-check">✓</span>}
                    {active && <span className="steps-dot-spin" />}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {error && <div className="error-msg">⚠️ {error}</div>}

        {laudo && !loading && (
          <div className="laudo-ready">
            <div className="laudo-ready-status" style={{ color: statusColor }}>
              <span className="laudo-ready-dot" style={{ background: statusColor }} />
              {STATUS_LABEL[laudo.status_geral]}
            </div>
            <div className="laudo-ready-info">
              {laudo.area_imovel_ha.toFixed(0)} ha{laudo.municipio ? ` · ${laudo.municipio}` : ''}
            </div>
            <button className="btn-ver-laudo" onClick={() => setModalOpen(true)}>
              Ver Laudo Completo
            </button>
            <button className="btn-reset" onClick={handleReset}>Nova análise</button>
          </div>
        )}

        {!laudo && !loading && !error && history.length === 0 && (
          <div className="sidebar-hint">
            Insira um código CAR ou desenhe o imóvel no mapa para iniciar a análise.
          </div>
        )}

        {/* ── Histórico ── */}
        {history.length > 0 && (
          <div className="hist-wrap">
            <div className="hist-hd">
              <button className="hist-toggle" onClick={() => setHistOpen(o => !o)}>
                <span className={`hist-chevron ${histOpen ? 'open' : ''}`}>›</span>
                Histórico ({history.length})
              </button>
              <button className="hist-clear" onClick={clearHistory} title="Limpar histórico">
                Limpar
              </button>
            </div>

            {histOpen && (
              <div className="hist-list">
                {history.map(entry => (
                  <div
                    key={entry.id}
                    className={`hist-item ${laudo === entry.laudo ? 'active' : ''}`}
                    onClick={() => openHistoryItem(entry)}
                  >
                    <div className="hist-item-row">
                      <span className="hist-dot" style={{ background: STATUS_CLR[entry.status] }} />
                      <span className="hist-area">
                        {entry.area_ha.toFixed(0)} ha
                        {entry.municipio ? ` · ${entry.municipio}` : ''}
                      </span>
                      <span className="hist-status" style={{ color: STATUS_CLR[entry.status] }}>
                        {STATUS_LABEL[entry.status]}
                      </span>
                      <button
                        className="hist-del"
                        onClick={e => removeHistoryItem(entry.id, e)}
                        title="Remover"
                      >×</button>
                    </div>
                    <div className="hist-meta">
                      {fmtTime(entry.ts)}
                      {entry.car_code && ` · ${entry.car_code.slice(-8)}`}
                      {entry.pendencias > 0 && ` · ${entry.pendencias} pendência${entry.pendencias > 1 ? 's' : ''}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ── Map ── */}
      <MapView ref={mapRef} drawingMode={drawingMode} onPolygonDrawn={handlePolygonDrawn} />

      {/* ── Dashboard Panel ── */}
      <DashboardPanel mapRef={mapRef} open={dashOpen} onClose={() => setDashOpen(false)} onSelect={() => setModalOpen(false)} />

      {/* ── Laudo Modal ── */}
      {modalOpen && laudo && (
        <LaudoModal laudo={laudo} onClose={() => setModalOpen(false)} />
      )}

      {/* ── Imovel Data Modal ── */}
      {imovelCode && (
        <ImovelModal
          carCode={imovelCode}
          onClose={() => setImovelCode(null)}
          onAnalyze={(code) => { setImovelCode(null); setCarCode(code); runAnalysis({ car_code: code }, null) }}
        />
      )}
    </div>
  )
}
