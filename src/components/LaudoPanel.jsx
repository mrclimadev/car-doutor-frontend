import { useState } from 'react'

const ST = {
  ok:      { label: 'CONFORME',  clr: '#4ecb71' },
  atencao: { label: 'ATENÇÃO',   clr: '#f5a623' },
  critico: { label: 'CRÍTICO',   clr: '#f5564a' },
}

function Bar({ pct, ok }) {
  return (
    <div className="lv2-bar">
      <div className={`lv2-bar-fill ${ok ? 'good' : 'bad'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

export default function LaudoPanel({ laudo, onClose }) {
  const [techOpen, setTechOpen] = useState(false)

  const allP = [
    ...laudo.app.pendencias,
    ...laudo.rl.pendencias,
    ...laudo.desmatamento.pendencias,
    ...laudo.restricoes.pendencias,
  ]

  const st       = ST[laudo.status_geral]
  const appOk    = laudo.app.deficit_ha <= 0
  const rlOk     = laudo.rl.percentual_declarado >= laudo.rl.percentual_minimo
  const appPct   = laudo.app.area_calculada_ha > 0
    ? (laudo.app.area_declarada_ha / laudo.app.area_calculada_ha) * 100 : 100
  const rlPct    = laudo.rl.percentual_minimo > 0
    ? (laudo.rl.percentual_declarado / laudo.rl.percentual_minimo) * 100 : 100

  return (
    <div className="lv2">
      {/* ── Banner ── */}
      <div className={`lv2-banner ${laudo.status_geral}`}>
        <div className="lv2-banner-row">
          <div>
            <div className="lv2-status-eyebrow" style={{ color: st.clr }}>Status Geral</div>
            <div className="lv2-status-value" style={{ color: st.clr }}>{st.label}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div className="lv2-area-block">
              <div>
                <span className="lv2-area-num">{laudo.area_imovel_ha.toFixed(0)}</span>
                <span className="lv2-area-unit">ha</span>
              </div>
              {laudo.municipio && <div className="lv2-municipio">{laudo.municipio} · MT</div>}
            </div>
            {onClose && (
              <button onClick={onClose} className="lv2-close-btn" title="Fechar laudo">×</button>
            )}
          </div>
        </div>
        {laudo.car_code && <div className="lv2-code">{laudo.car_code}</div>}
      </div>

      {/* ── Resumo simples ── */}
      <div className="lv2-resumo">
        <div className="lv2-eyebrow">Diagnóstico</div>
        <div className={`lv2-resumo-text ${laudo.status_geral}`}>{laudo.resumo_simples}</div>
      </div>

      {/* ── APP ── */}
      <div className="lv2-section">
        <div className="lv2-section-hd">
          <div className="lv2-section-title">APP — Preservação Permanente</div>
          <div className={`lv2-chip ${laudo.app.status}`}>{ST[laudo.app.status].label}</div>
        </div>
        <div className="lv2-grid-2">
          <div>
            <div className="lv2-stat-val good">{laudo.app.area_declarada_ha.toFixed(1)} ha</div>
            <div className="lv2-stat-lbl">Declarada no SICAR</div>
          </div>
          <div>
            <div className={`lv2-stat-val ${appOk ? 'good' : 'bad'}`}>{laudo.app.area_calculada_ha.toFixed(1)} ha</div>
            <div className="lv2-stat-lbl">Necessária (estimada)</div>
          </div>
        </div>
        <Bar pct={appPct} ok={appOk} />
        {!appOk && (
          <div className="lv2-deficit">déficit de {laudo.app.deficit_ha.toFixed(1)} ha</div>
        )}
      </div>

      {/* ── RL ── */}
      <div className="lv2-section">
        <div className="lv2-section-hd">
          <div className="lv2-section-title">RL — Reserva Legal · {laudo.rl.bioma}</div>
          <div className={`lv2-chip ${laudo.rl.status}`}>{ST[laudo.rl.status].label}</div>
        </div>
        <div className="lv2-grid-2">
          <div>
            <div className="lv2-stat-val good">{laudo.rl.percentual_declarado.toFixed(1)}%</div>
            <div className="lv2-stat-lbl">Declarada · {laudo.rl.area_declarada_ha.toFixed(0)} ha</div>
          </div>
          <div>
            <div className={`lv2-stat-val ${rlOk ? 'good' : 'bad'}`}>{laudo.rl.percentual_minimo.toFixed(1)}%</div>
            <div className="lv2-stat-lbl">Mínimo legal · {laudo.rl.area_minima_ha.toFixed(0)} ha</div>
          </div>
        </div>
        <Bar pct={rlPct} ok={rlOk} />
        {!rlOk && (
          <div className="lv2-deficit">déficit de {(laudo.rl.area_minima_ha - laudo.rl.area_declarada_ha).toFixed(1)} ha</div>
        )}
      </div>

      {/* ── Desmatamento ── */}
      <div className="lv2-section">
        <div className="lv2-section-hd">
          <div className="lv2-section-title">Alertas de Desmatamento</div>
          <div className={`lv2-chip ${laudo.desmatamento.status}`}>{ST[laudo.desmatamento.status].label}</div>
        </div>
        <div className="lv2-grid-3">
          <div>
            <div className={`lv2-stat-val ${laudo.desmatamento.alertas_prodes > 0 ? 'bad' : 'good'}`}>
              {laudo.desmatamento.alertas_prodes}
            </div>
            <div className="lv2-stat-lbl">PRODES</div>
          </div>
          <div>
            <div className={`lv2-stat-val ${laudo.desmatamento.alertas_deter > 0 ? 'warn' : 'good'}`}>
              {laudo.desmatamento.alertas_deter}
            </div>
            <div className="lv2-stat-lbl">DETER</div>
          </div>
          <div>
            <div className={`lv2-stat-val ${laudo.desmatamento.area_desmatada_ha > 0 ? 'bad' : 'good'}`}>
              {laudo.desmatamento.area_desmatada_ha.toFixed(1)}
            </div>
            <div className="lv2-stat-lbl">ha afetados</div>
          </div>
        </div>
      </div>

      {/* ── Restrições ── */}
      <div className="lv2-section">
        <div className="lv2-section-hd">
          <div className="lv2-section-title">Restrições Territoriais</div>
          <div className={`lv2-chip ${laudo.restricoes.status}`}>{ST[laudo.restricoes.status].label}</div>
        </div>
        <div className="lv2-restrict-row">
          <div className={`lv2-dot ${laudo.restricoes.sobreposicao_ti ? 'bad' : 'good'}`} />
          <span className="lv2-restrict-text">
            Terra Indígena
            {laudo.restricoes.sobreposicao_ti
              ? ` — ${laudo.restricoes.area_ti_ha.toFixed(1)} ha sobrepostos`
              : ' — sem sobreposição'}
          </span>
        </div>
        <div className="lv2-restrict-row">
          <div className={`lv2-dot ${laudo.restricoes.sobreposicao_uc ? 'bad' : 'good'}`} />
          <span className="lv2-restrict-text">
            Unidade de Conservação
            {laudo.restricoes.sobreposicao_uc
              ? ` — ${laudo.restricoes.area_uc_ha.toFixed(1)} ha sobrepostos`
              : ' — sem sobreposição'}
          </span>
        </div>
      </div>

      {/* ── Pendências ── */}
      <div className="lv2-pendencias">
        <div className="lv2-p-count">
          {allP.length === 0
            ? 'Nenhuma pendência'
            : `${allP.length} pendência${allP.length > 1 ? 's' : ''}${laudo.pendencias_criticas > 0 ? ` · ${laudo.pendencias_criticas} crítica${laudo.pendencias_criticas > 1 ? 's' : ''}` : ''}`}
        </div>

        {allP.length === 0 ? (
          <div className="lv2-ok-card">
            <div className="lv2-dot good" />
            <span className="lv2-ok-text">Imóvel em conformidade com o Código Florestal</span>
          </div>
        ) : (
          allP.map((p, i) => (
            <div key={i} className={`lv2-p-card ${p.status}`}>
              <div className="lv2-p-row">
                <div className="lv2-dot" style={{ background: ST[p.status].clr }} />
                <span className="lv2-p-title">{p.titulo}</span>
                {p.area_ha != null && (
                  <span className="lv2-p-area">{p.area_ha.toFixed(1)} ha</span>
                )}
              </div>
              <div className="lv2-p-orient">{p.orientacao}</div>
            </div>
          ))
        )}
      </div>

      {/* ── Resumo técnico ── */}
      <div className="lv2-tech">
        <button className="lv2-tech-btn" onClick={() => setTechOpen(o => !o)}>
          <span>Resumo Técnico (OEMA)</span>
          <span className={`lv2-tech-chevron ${techOpen ? 'open' : ''}`}>▾</span>
        </button>
        {techOpen && <div className="lv2-tech-body">{laudo.resumo_tecnico}</div>}
      </div>
    </div>
  )
}
