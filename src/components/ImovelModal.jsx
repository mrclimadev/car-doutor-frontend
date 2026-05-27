import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const STATUS_META = {
  AT: { label: 'Ativo',           color: '#4ecb71' },
  SU: { label: 'Suspenso',        color: '#f5a623' },
  CA: { label: 'Cancelado',       color: '#e8413a' },
  PE: { label: 'Pendente',        color: '#f5c842' },
  CC: { label: 'Cancelado',       color: '#e8413a' },
  CS: { label: 'Com Suspensão',   color: '#ff6b6b' },
  PA: { label: 'Pend. Análise',   color: '#f5c842' },
  RA: { label: 'Recadastrado',    color: '#60a5fa' },
  RE: { label: 'Retificação',     color: '#60a5fa' },
  RF: { label: 'Req. Fase II',    color: '#a78bfa' },
  AN: { label: 'Ag. Análise',     color: '#f5a623' },
  AC: { label: 'Ag. Confirmação', color: '#f5c842' },
}

// Campos que sempre mostramos em destaque (quando presentes)
const HERO_COLS = ['num_area', 'area_ha', 'municipio', 'nm_municip', 'nm_mun', 'municipio_',
                   'nom_area', 'ind_tipo', 'mod_fiscal', 'uf', 'dat_criacao', 'dat_atualizacao']

// Labels amigáveis para campos conhecidos
const LABELS = {
  num_area:       'Área (ha)',
  area_ha:        'Área (ha)',
  municipio:      'Município',
  nm_municip:     'Município',
  nm_mun:         'Município',
  municipio_:     'Município',
  nom_area:       'Nome da propriedade',
  ind_status:     'Status',
  des_condic:     'Condição cadastral',
  ind_tipo:       'Tipo de imóvel',
  mod_fiscal:     'Módulos fiscais',
  uf:             'UF',
  dat_criacao:    'Cadastrado em',
  dat_atualizacao:'Última atualização',
  cod_imovel:     'Código CAR',
  num_cpf_cnpj_p: 'CPF/CNPJ (oculto)',
  classi_fun:     'Função',
  ind_geo_rur:    'Georreferenciado',
  cod_estado:     'Estado (código)',
  cod_munici:     'Município (código)',
}

function label(col) {
  return LABELS[col] || col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function fmtVal(key, val) {
  if (val == null || val === 'None' || val === 'nan') return '—'
  if ((key === 'num_area' || key === 'area_ha') && !isNaN(val)) {
    return `${Number(val).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha`
  }
  if (key === 'mod_fiscal' && !isNaN(val)) {
    return `${Number(val).toFixed(2)} MF`
  }
  if (key === 'dat_criacao' || key === 'dat_atualizacao') {
    return val.slice(0, 10).split('-').reverse().join('/')
  }
  return String(val)
}

export default function ImovelModal({ carCode, onClose, onAnalyze }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    setLoading(true); setError(null); setData(null)
    fetch(`${API_BASE}/imovel/${encodeURIComponent(carCode)}`)
      .then(r => { if (!r.ok) throw new Error('Imóvel não encontrado'); return r.json() })
      .then(d  => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [carCode])

  const dados      = data?.dados ?? {}
  const status     = dados.ind_status
  const statusMeta = STATUS_META[status] ?? { label: status ?? '—', color: '#6b9e6b' }

  // Separa campos "hero" (destaque) dos demais
  const heroFields = HERO_COLS
    .filter(k => dados[k] != null && dados[k] !== 'None' && dados[k] !== 'nan')
    .filter((k, _, arr) => {
      // Deduplicar campos de município
      if (['nm_municip', 'nm_mun', 'municipio_'].includes(k) && arr.includes('municipio')) return false
      if (['nm_mun', 'municipio_'].includes(k) && arr.includes('nm_municip')) return false
      // Deduplicar área
      if (k === 'area_ha' && arr.includes('num_area')) return false
      return true
    })

  const heroSet = new Set(HERO_COLS)
  const extraFields = Object.entries(dados)
    .filter(([k]) => !heroSet.has(k) && k !== 'ind_status' && k !== 'des_condic' && k !== 'cod_imovel')
    .filter(([, v]) => v != null && v !== 'None' && v !== 'nan' && String(v).trim() !== '')

  return (
    <div className="im-backdrop" onClick={onClose}>
      <div className="im-card" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="im-hd">
          <div className="im-hd-left">
            <div className="im-hd-eyebrow">Imóvel SICAR · Mato Grosso</div>
            <div className="im-car-code">{carCode}</div>
          </div>
          <div className="im-hd-right">
            {status && (
              <span className="im-status-badge" style={{ background: statusMeta.color + '22', color: statusMeta.color, borderColor: statusMeta.color + '55' }}>
                <span className="im-status-dot" style={{ background: statusMeta.color }} />
                {statusMeta.label}
              </span>
            )}
            <button className="im-close" onClick={onClose}>×</button>
          </div>
        </div>

        {/* ── Condição ── */}
        {dados.des_condic && (
          <div className="im-condic">
            {dados.des_condic}
          </div>
        )}

        {/* ── Body ── */}
        <div className="im-body">
          {loading && (
            <div className="im-loading">
              <div className="im-spinner" />
              <span>Buscando dados cadastrais...</span>
            </div>
          )}

          {error && <div className="im-error">⚠ {error}</div>}

          {data && (
            <>
              {/* Hero grid */}
              {heroFields.length > 0 && (
                <div className="im-hero-grid">
                  {heroFields.map(k => (
                    <div key={k} className="im-hero-cell">
                      <div className="im-hero-lbl">{label(k)}</div>
                      <div className="im-hero-val">{fmtVal(k, dados[k])}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Extra fields */}
              {extraFields.length > 0 && (
                <div className="im-extra">
                  <div className="im-extra-title">Dados adicionais</div>
                  <div className="im-extra-grid">
                    {extraFields.map(([k, v]) => (
                      <div key={k} className="im-extra-row">
                        <span className="im-extra-lbl">{label(k)}</span>
                        <span className="im-extra-val">{fmtVal(k, v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="im-footer">
          <button className="im-btn-analyze" onClick={() => { onClose(); onAnalyze(carCode) }}>
            🔍 Analisar este imóvel
          </button>
        </div>

      </div>
    </div>
  )
}
