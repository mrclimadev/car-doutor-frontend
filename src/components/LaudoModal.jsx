import { useState } from 'react'
import { jsPDF } from 'jspdf'

/* ── Markdown renderer ───────────────────────────────────────────────────── */
function inlineMd(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  )
}

function Markdown({ text, className }) {
  if (!text) return null
  // Normalize: ensure newline before every # or ## marker
  const normalized = text.replace(/([^\n])\s*(#{1,3})\s+/g, '$1\n$2 ').trim()
  const lines = normalized.split('\n').filter(l => l.trim())
  return (
    <div className={className}>
      {lines.map((line, i) => {
        const t = line.trim()
        if (t.startsWith('### ')) return <h4 key={i} className="md-h3">{inlineMd(t.slice(4))}</h4>
        if (t.startsWith('## '))  return <h3 key={i} className="md-h2">{inlineMd(t.slice(3))}</h3>
        if (t.startsWith('# '))   return <h2 key={i} className="md-h1">{inlineMd(t.slice(2))}</h2>
        if (/^[-*]\s/.test(t))    return <p  key={i} className="md-li">{inlineMd(t.slice(2))}</p>
        if (/^\d+\.\s/.test(t))   return <p  key={i} className="md-li md-ol">{inlineMd(t)}</p>
        return                           <p  key={i} className="md-p">{inlineMd(t)}</p>
      })}
    </div>
  )
}

const ST = {
  ok:      { label: 'CONFORME', clr: '#4ecb71', rgb: [27, 110, 27] },
  atencao: { label: 'ATENÇÃO',  clr: '#f5a623', rgb: [150, 80, 0] },
  critico: { label: 'CRÍTICO',  clr: '#f5564a', rgb: [180, 20, 20] },
}

function Bar({ pct, ok }) {
  return (
    <div className="lv2-bar">
      <div className={`lv2-bar-fill ${ok ? 'good' : 'bad'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

/* ── PDF markdown helpers ────────────────────────────────────────────────── */
function stripInline(s) { return s.replace(/\*\*([^*]+)\*\*/g, '$1') }

function parseMd(text) {
  if (!text) return []
  const normalized = text.replace(/([^\n])\s*(#{1,3})\s+/g, '$1\n$2 ').trim()
  return normalized.split('\n').filter(l => l.trim()).map(line => {
    const t = line.trim()
    if (t === '---' || t === '--') return { type: 'sep' }
    if (t.startsWith('### ')) return { type: 'h3', text: stripInline(t.slice(4)) }
    if (t.startsWith('## '))  return { type: 'h2', text: stripInline(t.slice(3)) }
    if (t.startsWith('# '))   return { type: 'h1', text: stripInline(t.slice(2)) }
    if (/^[-*]\s/.test(t))    return { type: 'li', text: stripInline(t.slice(2)) }
    if (/^\d+\.\s/.test(t))   return { type: 'li', text: stripInline(t) }
    return { type: 'p', text: stripInline(t) }
  })
}

/* ── PDF export ─────────────────────────────────────────────────────────── */
function exportPDF(laudo) {
  const doc  = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const W    = 210
  const mg   = 16
  const cw   = W - mg * 2
  let y      = 0

  const stL = { ok: 'CONFORME', atencao: 'ATENCAO', critico: 'CRITICO' }
  const stC = { ok: [27, 110, 27], atencao: [150, 80, 0], critico: [180, 20, 20] }

  const hdrBg    = [7, 40, 7]
  const secBg    = [236, 248, 236]
  const bodyTxt  = [30, 60, 30]
  const mutedTxt = [90, 130, 90]
  const borderC  = [190, 220, 190]

  function addPage() { doc.addPage(); y = 22 }
  function guard(h = 20) { if (y + h > 272) addPage() }

  function renderMdBlock(text, fontSize = 9.5) {
    parseMd(text).forEach(seg => {
      if (seg.type === 'sep') { y += 3; return }
      if (seg.type === 'h1') {
        guard(12); y += 2
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 110, 27)
        doc.splitTextToSize(seg.text, cw - 8).forEach(l => { guard(7); doc.text(l, mg + 5, y); y += 6.5 })
        y += 2
      } else if (seg.type === 'h2') {
        guard(10); y += 1
        doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 90, 27)
        doc.splitTextToSize(seg.text, cw - 8).forEach(l => { guard(7); doc.text(l, mg + 5, y); y += 6 })
        y += 1
      } else if (seg.type === 'h3') {
        guard(9)
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...bodyTxt)
        doc.splitTextToSize(seg.text, cw - 8).forEach(l => { guard(7); doc.text(l, mg + 5, y); y += 5.5 })
      } else if (seg.type === 'li') {
        guard(8)
        doc.setFontSize(fontSize); doc.setFont('helvetica', 'normal'); doc.setTextColor(...bodyTxt)
        doc.text('•', mg + 5, y)
        doc.splitTextToSize(seg.text, cw - 14).forEach(l => { guard(7); doc.text(l, mg + 10, y); y += 6 })
      } else {
        guard(8)
        doc.setFontSize(fontSize); doc.setFont('helvetica', 'normal'); doc.setTextColor(...bodyTxt)
        doc.splitTextToSize(seg.text, cw - 8).forEach(l => { guard(7); doc.text(l, mg + 5, y); y += 6 })
        y += 2
      }
    })
  }

  doc.setFillColor(...hdrBg)
  doc.rect(0, 0, W, 25, 'F')
  doc.setTextColor(78, 203, 78)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('CAR Doutor', mg, 15)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(130, 190, 130)
  doc.text('Analise Automatica de Inconsistencias do Cadastro Ambiental Rural', mg, 21)
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.text(`Gerado em ${today}`, W - mg, 21, { align: 'right' })
  y = 33

  const sc = stC[laudo.status_geral]
  doc.setFillColor(...secBg)
  doc.roundedRect(mg, y, cw, 28, 3, 3, 'F')
  doc.setDrawColor(...sc)
  doc.setLineWidth(0.6)
  doc.roundedRect(mg, y, cw, 28, 3, 3, 'S')
  doc.setLineWidth(0.2)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...mutedTxt)
  doc.text('STATUS GERAL', mg + 6, y + 9)
  doc.setFontSize(17)
  doc.setTextColor(...sc)
  doc.text(stL[laudo.status_geral], mg + 6, y + 21)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...bodyTxt)
  doc.text(`${laudo.area_imovel_ha.toFixed(0)} ha`, W - mg - 5, y + 20, { align: 'right' })
  if (laudo.municipio) {
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...mutedTxt)
    doc.text(`${laudo.municipio} - MT`, W - mg - 5, y + 26, { align: 'right' })
  }
  y += 35

  if (laudo.car_code) {
    doc.setFontSize(8)
    doc.setFont('courier', 'normal')
    doc.setTextColor(...mutedTxt)
    doc.text(laudo.car_code, mg, y)
    y += 10
  }

  function secHd(title, status) {
    guard(16)
    doc.setFillColor(...secBg)
    doc.rect(mg, y, cw, 10, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...bodyTxt)
    doc.text(title, mg + 5, y + 7)
    if (status) {
      doc.setTextColor(...stC[status])
      doc.text(stL[status], W - mg - 5, y + 7, { align: 'right' })
    }
    y += 14
  }

  function kv(label, value, hi) {
    guard(9)
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...mutedTxt)
    doc.text(label, mg + 5, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(hi === 'bad' ? 180 : hi === 'warn' ? 150 : bodyTxt[0],
                     hi === 'bad' ? 20  : hi === 'warn' ? 80  : bodyTxt[1],
                     hi === 'bad' ? 20  : hi === 'warn' ? 0   : bodyTxt[2])
    doc.text(String(value), W - mg - 5, y, { align: 'right' })
    doc.setDrawColor(...borderC)
    doc.setLineWidth(0.15)
    doc.line(mg + 5, y + 2.5, W - mg - 5, y + 2.5)
    y += 8
  }

  secHd('Area de Preservacao Permanente (APP)', laudo.app.status)
  kv('APP Declarada (SICAR)', `${laudo.app.area_declarada_ha.toFixed(1)} ha`)
  kv('APP Necessaria (estimada)', `${laudo.app.area_calculada_ha.toFixed(1)} ha`, laudo.app.deficit_ha > 0 ? 'bad' : null)
  if (laudo.app.deficit_ha > 0) kv('Deficit de APP', `${laudo.app.deficit_ha.toFixed(1)} ha`, 'bad')
  y += 5

  secHd(`Reserva Legal (RL) - ${laudo.rl.bioma}`, laudo.rl.status)
  kv('RL Declarada', `${laudo.rl.percentual_declarado.toFixed(1)}% (${laudo.rl.area_declarada_ha.toFixed(0)} ha)`)
  kv('Minimo Legal exigido', `${laudo.rl.percentual_minimo.toFixed(1)}% (${laudo.rl.area_minima_ha.toFixed(0)} ha)`, laudo.rl.area_declarada_ha < laudo.rl.area_minima_ha ? 'bad' : null)
  if (laudo.rl.area_declarada_ha < laudo.rl.area_minima_ha)
    kv('Deficit de RL', `${(laudo.rl.area_minima_ha - laudo.rl.area_declarada_ha).toFixed(1)} ha`, 'bad')
  y += 5

  secHd('Alertas de Desmatamento', laudo.desmatamento.status)
  kv('PRODES (desmatamento anual)', laudo.desmatamento.alertas_prodes, laudo.desmatamento.alertas_prodes > 0 ? 'bad' : null)
  kv('DETER (alertas recentes)', laudo.desmatamento.alertas_deter, laudo.desmatamento.alertas_deter > 0 ? 'warn' : null)
  kv('Area desmatada total', `${laudo.desmatamento.area_desmatada_ha.toFixed(1)} ha`, laudo.desmatamento.area_desmatada_ha > 0 ? 'bad' : null)
  y += 5

  secHd('Restricoes Territoriais', laudo.restricoes.status)
  kv('Terra Indigena (FUNAI)',
    laudo.restricoes.sobreposicao_ti ? `SIM — ${laudo.restricoes.area_ti_ha.toFixed(1)} ha sobrepostos` : 'Sem sobreposicao',
    laudo.restricoes.sobreposicao_ti ? 'bad' : null)
  kv('Unidade de Conservacao (CNUC)',
    laudo.restricoes.sobreposicao_uc ? `SIM — ${laudo.restricoes.area_uc_ha.toFixed(1)} ha sobrepostos` : 'Sem sobreposicao',
    laudo.restricoes.sobreposicao_uc ? 'bad' : null)
  y += 5

  const allP = [
    ...laudo.app.pendencias, ...laudo.rl.pendencias,
    ...laudo.desmatamento.pendencias, ...laudo.restricoes.pendencias,
  ]
  secHd(`Pendencias (${allP.length})`)
  if (allP.length === 0) {
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(27, 110, 27)
    doc.text('Imovel em conformidade com o Codigo Florestal nas bases analisadas.', mg + 5, y)
    y += 10
  } else {
    const LH_TITLE  = 6
    const LH_DETAIL = 5
    const LH_ORIENT = 5.2

    allP.forEach(p => {
      const pr  = stC[p.status]
      const pbg = p.status === 'critico' ? [255, 240, 240]
                : p.status === 'atencao' ? [255, 250, 232]
                : [240, 252, 240]

      // Pre-compute wrapped lines to know exact height
      doc.setFontSize(9.5)
      const titleLines  = doc.splitTextToSize(p.titulo, cw - 26)
      doc.setFontSize(7.8)
      const detailLines = p.detalhe ? doc.splitTextToSize(p.detalhe, cw - 14) : []
      doc.setFontSize(8.5)
      const orientLines = p.orientacao ? doc.splitTextToSize(p.orientacao, cw - 14) : []

      const innerH = 6
        + titleLines.length  * LH_TITLE
        + (detailLines.length > 0 ? detailLines.length * LH_DETAIL + 3 : 0)
        + (orientLines.length > 0 ? orientLines.length * LH_ORIENT + 3 : 0)
        + 4
      const cardH = Math.max(innerH, 22)

      guard(cardH + 4)

      doc.setFillColor(...pbg)
      doc.roundedRect(mg, y, cw, cardH, 2, 2, 'F')
      doc.setDrawColor(...pr)
      doc.setLineWidth(0.9)
      doc.line(mg + 0.5, y + 2, mg + 0.5, y + cardH - 2)
      doc.setLineWidth(0.2)

      let cy = y + 7

      // Title
      doc.setFontSize(9.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...pr)
      titleLines.forEach(l => { doc.text(l, mg + 6, cy); cy += LH_TITLE })

      if (p.area_ha != null) {
        doc.setFontSize(9)
        doc.setTextColor(...bodyTxt)
        doc.text(`${p.area_ha.toFixed(1)} ha`, W - mg - 5, y + 7, { align: 'right' })
      }

      // Detail (italic, muted)
      if (detailLines.length > 0) {
        cy += 2
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(7.8)
        doc.setTextColor(100, 130, 100)
        detailLines.forEach(l => { doc.text(l, mg + 6, cy); cy += LH_DETAIL })
      }

      // Orientation
      if (orientLines.length > 0) {
        cy += 3
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(50, 80, 50)
        orientLines.forEach(l => { doc.text(l, mg + 6, cy); cy += LH_ORIENT })
      }

      y += cardH + 4
    })
  }
  y += 5

  guard(35)
  secHd('Diagnostico — Linguagem Acessivel ao Produtor')
  renderMdBlock(laudo.resumo_simples, 10)
  y += 4

  guard(35)
  secHd('Resumo Tecnico — OEMA / Orgao Ambiental')
  renderMdBlock(laudo.resumo_tecnico, 9.5)

  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFillColor(...secBg)
    doc.rect(0, 285, W, 12, 'F')
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...mutedTxt)
    doc.text('CAR Doutor — Analise Automatica do Cadastro Ambiental Rural — ENAP Hackathon 2026', mg, 292)
    doc.text(`Pagina ${i} de ${pages}`, W - mg, 292, { align: 'right' })
  }

  const fname = laudo.car_code ? `laudo_${laudo.car_code.slice(-8)}.pdf` : `laudo_${Date.now()}.pdf`
  doc.save(fname)
}

/* ── Aba Produtor ────────────────────────────────────────────────────────── */
function ProducerTab({ laudo, allP }) {
  const appOk = laudo.app.deficit_ha <= 0
  const rlOk  = laudo.rl.percentual_declarado >= laudo.rl.percentual_minimo
  const desfOk = laudo.desmatamento.alertas_deter === 0 && laudo.desmatamento.alertas_prodes === 0
  const restOk = !laudo.restricoes.sobreposicao_ti && !laudo.restricoes.sobreposicao_uc
  const criticas = allP.filter(p => p.status === 'critico')
  const atencoes = allP.filter(p => p.status === 'atencao')

  const heroMsg = {
    ok:      { icon: '✅', title: 'Imóvel em Conformidade', sub: 'Parabéns! Sua propriedade está em dia com o Código Florestal.' },
    atencao: { icon: '⚠️', title: 'Atenção Necessária',     sub: 'Há pontos que precisam ser corrigidos no cadastro.' },
    critico: { icon: '🚨', title: 'Irregularidades Graves',  sub: 'Foram encontradas irregularidades que exigem ação imediata.' },
  }[laudo.status_geral]

  const health = [
    { icon: '🌊', label: 'Preservação Permanente',  status: laudo.app.status,          ok: appOk,
      value: appOk ? 'Dentro do limite' : `Déficit ${laudo.app.deficit_ha.toFixed(0)} ha` },
    { icon: '🌳', label: 'Reserva Legal',            status: laudo.rl.status,           ok: rlOk,
      value: rlOk ? `${laudo.rl.percentual_declarado.toFixed(0)}% ✓` : `Déficit ${(laudo.rl.area_minima_ha - laudo.rl.area_declarada_ha).toFixed(0)} ha` },
    { icon: '🛰️', label: 'Alertas Desmatamento',     status: laudo.desmatamento.status, ok: desfOk,
      value: desfOk ? 'Sem alertas' : `${laudo.desmatamento.alertas_deter + laudo.desmatamento.alertas_prodes} alertas` },
    { icon: '⚖️', label: 'Restrições Legais',        status: laudo.restricoes.status,   ok: restOk,
      value: restOk ? 'Sem sobreposição' : 'Área sobreposta!' },
  ]

  return (
    <div className="tab-prod">

      {/* ── Hero ── */}
      <div className={`prod-hero prod-hero--${laudo.status_geral}`}>
        <div className="prod-hero-left">
          <span className="prod-hero-emoji">{heroMsg.icon}</span>
          <div>
            <div className="prod-hero-title">{heroMsg.title}</div>
            <div className="prod-hero-sub">{heroMsg.sub}</div>
          </div>
        </div>
        <div className="prod-hero-right">
          <div className="prod-hero-area">{laudo.area_imovel_ha.toFixed(0)}<span className="prod-hero-unit"> ha</span></div>
          {laudo.municipio && <div className="prod-hero-mun">{laudo.municipio} · MT</div>}
        </div>
      </div>

      {/* ── 2-column body ── */}
      <div className="tab-prod-body">

        {/* Left: health + diagnóstico */}
        <div className="tab-prod-left">

          <div className="prod-section-lbl">Diagnóstico</div>
          <Markdown text={laudo.resumo_simples} className={`prod-diag prod-diag--${laudo.status_geral}`} />

          <div className="prod-section-lbl" style={{ marginTop: 20 }}>Saúde do Imóvel</div>
          <div className="prod-health-grid">
            {health.map((h, i) => (
              <div key={i} className={`prod-hcard prod-hcard--${h.status}`}>
                <div className="prod-hcard-top">
                  <span className="prod-hcard-icon">{h.icon}</span>
                  <span className={`prod-hcard-badge ${h.status}`}>{ST[h.status].label}</span>
                </div>
                <div className="prod-hcard-label">{h.label}</div>
                <div className={`prod-hcard-val ${h.ok ? 'good' : h.status}`}>{h.value}</div>
              </div>
            ))}
          </div>

          {/* Solo amigável */}
          {laudo.solo?.disponivel && (
            <>
              <div className="prod-section-lbl" style={{ marginTop: 20 }}>Solo da Propriedade</div>
              <div className="prod-solo-grid">
                {laudo.solo.ph != null && (
                  <div className="prod-solo-card">
                    <div className="prod-solo-ico">🧪</div>
                    <div className={`prod-solo-val ${laudo.solo.ph < 5.5 ? 'bad' : laudo.solo.ph < 6.0 ? 'warn' : 'good'}`}>
                      {laudo.solo.ph.toFixed(1)}
                    </div>
                    <div className="prod-solo-lbl">pH · {laudo.solo.ph_classe}</div>
                  </div>
                )}
                {laudo.solo.textura && (
                  <div className="prod-solo-card">
                    <div className="prod-solo-ico">🏔️</div>
                    <div className="prod-solo-val">{laudo.solo.textura}</div>
                    <div className="prod-solo-lbl">Textura</div>
                  </div>
                )}
                {laudo.solo.risco_erosao && (
                  <div className="prod-solo-card">
                    <div className="prod-solo-ico">💧</div>
                    <div className={`prod-solo-val ${laudo.solo.risco_erosao === 'Alto' ? 'bad' : laudo.solo.risco_erosao?.includes('Médio') ? 'warn' : 'good'}`}>
                      {laudo.solo.risco_erosao}
                    </div>
                    <div className="prod-solo-lbl">Risco erosão</div>
                  </div>
                )}
                {laudo.solo.estoque_carbono_tC_ha != null && (
                  <div className="prod-solo-card">
                    <div className="prod-solo-ico">🌿</div>
                    <div className="prod-solo-val good">{laudo.solo.estoque_carbono_tC_ha.toFixed(1)}</div>
                    <div className="prod-solo-lbl">tC/ha carbono</div>
                  </div>
                )}
              </div>
              {laudo.solo.ph != null && laudo.solo.ph < 5.5 && (
                <div className="prod-tip prod-tip--warn">💡 Solo muito ácido — uma análise agronômica pode indicar a necessidade de calagem para melhorar a produtividade.</div>
              )}
              {laudo.solo.risco_erosao === 'Alto' && (
                <div className="prod-tip prod-tip--warn">💡 Alto risco de erosão — considere práticas conservacionistas como curvas de nível ou cobertura vegetal.</div>
              )}
              {laudo.solo.classe_ibge && (
                <div className="prod-tip prod-tip--info">🗺️ Tipo de solo (IBGE): {laudo.solo.classe_ibge}</div>
              )}
            </>
          )}
        </div>

        {/* Right: actions */}
        <div className="tab-prod-right">
          {allP.length === 0 ? (
            <div className="prod-ok-banner">
              <div className="prod-ok-icon">🎉</div>
              <div className="prod-ok-title">Tudo em ordem!</div>
              <div className="prod-ok-sub">Nenhuma pendência encontrada. Seu imóvel está em conformidade com o Código Florestal nas bases consultadas. Continue mantendo as áreas de preservação.</div>
            </div>
          ) : (
            <>
              <div className="prod-section-lbl">
                O que você precisa fazer
                <span className="prod-count-badge">{allP.length} ação{allP.length > 1 ? 'ões' : ''}</span>
              </div>
              {criticas.map((p, i) => (
                <div key={`c${i}`} className="prod-action prod-action--critico">
                  <div className="prod-action-hd">
                    <span className="prod-action-tag prod-action-tag--critico">🚨 Urgente</span>
                    <span className="prod-action-titulo">{p.titulo}</span>
                    {p.area_ha != null && <span className="prod-action-area">{p.area_ha.toFixed(1)} ha</span>}
                  </div>
                  <p className="prod-action-txt">{p.orientacao}</p>
                </div>
              ))}
              {atencoes.map((p, i) => (
                <div key={`a${i}`} className="prod-action prod-action--atencao">
                  <div className="prod-action-hd">
                    <span className="prod-action-tag prod-action-tag--atencao">⚠️ Atenção</span>
                    <span className="prod-action-titulo">{p.titulo}</span>
                    {p.area_ha != null && <span className="prod-action-area">{p.area_ha.toFixed(1)} ha</span>}
                  </div>
                  <p className="prod-action-txt">{p.orientacao}</p>
                </div>
              ))}
            </>
          )}

          {/* Perfil cadastral simplificado */}
          {laudo.cadastro?.ind_status && (
            <div className="prod-cadastro">
              <div className="prod-section-lbl">Situação Cadastral</div>
              <div className="prod-cad-row">
                <div className="prod-cad-item">
                  <div className={`prod-cad-status ${laudo.cadastro.ind_status === 'AT' ? 'good' : 'warn'}`}>
                    {laudo.cadastro.ind_status === 'AT' ? '✓ Ativo' :
                     laudo.cadastro.ind_status === 'SU' ? '⚠ Suspenso' :
                     laudo.cadastro.ind_status === 'CA' ? '✕ Cancelado' : laudo.cadastro.ind_status}
                  </div>
                  <div className="prod-cad-lbl">Status CAR</div>
                </div>
                {laudo.cadastro.classificacao_porte && (
                  <div className="prod-cad-item">
                    <div className="prod-cad-status">{laudo.cadastro.classificacao_porte}</div>
                    <div className="prod-cad-lbl">{laudo.cadastro.mod_fiscal?.toFixed(1)} módulos fiscais</div>
                  </div>
                )}
              </div>
              {laudo.cadastro.des_condic && (
                <div className="prod-cad-condic">{laudo.cadastro.des_condic}</div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

/* ── Aba Analista ────────────────────────────────────────────────────────── */
function AnalystTab({ laudo, allP }) {
  const st     = ST[laudo.status_geral]
  const appOk  = laudo.app.deficit_ha <= 0
  const rlOk   = laudo.rl.percentual_declarado >= laudo.rl.percentual_minimo
  const appPct = laudo.app.area_calculada_ha > 0
    ? (laudo.app.area_declarada_ha / laudo.app.area_calculada_ha) * 100 : 100
  const rlPct  = laudo.rl.percentual_minimo > 0
    ? (laudo.rl.percentual_declarado / laudo.rl.percentual_minimo) * 100 : 100

  return (
    <div className="modal-body">

      {/* Left — metrics */}
      <div className="modal-col">
        <div className={`lv2-banner ${laudo.status_geral}`} style={{ borderRadius: 8 }}>
          <div className="lv2-banner-row">
            <div>
              <div className="lv2-status-eyebrow" style={{ color: st.clr }}>Status Geral</div>
              <div className="lv2-status-value" style={{ color: st.clr }}>{st.label}</div>
            </div>
            <div className="lv2-area-block">
              <div><span className="lv2-area-num">{laudo.area_imovel_ha.toFixed(0)}</span><span className="lv2-area-unit"> ha</span></div>
              {laudo.municipio && <div className="lv2-municipio">{laudo.municipio} · MT</div>}
            </div>
          </div>
        </div>

        <div className="msec">
          <div className="lv2-section-hd">
            <div className="lv2-section-title">APP — Preservação Permanente</div>
            <div className={`lv2-chip ${laudo.app.status}`}>{ST[laudo.app.status].label}</div>
          </div>
          <div className="lv2-grid-2">
            <div><div className="lv2-stat-val good">{laudo.app.area_declarada_ha.toFixed(1)} ha</div><div className="lv2-stat-lbl">Declarada no SICAR</div></div>
            <div><div className={`lv2-stat-val ${appOk ? 'good' : 'bad'}`}>{laudo.app.area_calculada_ha.toFixed(1)} ha</div><div className="lv2-stat-lbl">Necessária (estimada)</div></div>
          </div>
          <Bar pct={appPct} ok={appOk} />
          {!appOk && <div className="lv2-deficit">déficit de {laudo.app.deficit_ha.toFixed(1)} ha</div>}
        </div>

        <div className="msec">
          <div className="lv2-section-hd">
            <div className="lv2-section-title">RL — Reserva Legal · {laudo.rl.bioma}</div>
            <div className={`lv2-chip ${laudo.rl.status}`}>{ST[laudo.rl.status].label}</div>
          </div>
          <div className="lv2-grid-2">
            <div><div className="lv2-stat-val good">{laudo.rl.percentual_declarado.toFixed(1)}%</div><div className="lv2-stat-lbl">Declarada · {laudo.rl.area_declarada_ha.toFixed(0)} ha</div></div>
            <div><div className={`lv2-stat-val ${rlOk ? 'good' : 'bad'}`}>{laudo.rl.percentual_minimo.toFixed(1)}%</div><div className="lv2-stat-lbl">Mínimo legal · {laudo.rl.area_minima_ha.toFixed(0)} ha</div></div>
          </div>
          <Bar pct={rlPct} ok={rlOk} />
          {!rlOk && <div className="lv2-deficit">déficit de {(laudo.rl.area_minima_ha - laudo.rl.area_declarada_ha).toFixed(1)} ha</div>}
        </div>

        <div className="msec">
          <div className="lv2-section-hd">
            <div className="lv2-section-title">Alertas de Desmatamento</div>
            <div className={`lv2-chip ${laudo.desmatamento.status}`}>{ST[laudo.desmatamento.status].label}</div>
          </div>
          <div className="lv2-grid-3">
            <div><div className={`lv2-stat-val ${laudo.desmatamento.alertas_prodes > 0 ? 'bad' : 'good'}`}>{laudo.desmatamento.alertas_prodes}</div><div className="lv2-stat-lbl">PRODES</div></div>
            <div><div className={`lv2-stat-val ${laudo.desmatamento.alertas_deter > 0 ? 'warn' : 'good'}`}>{laudo.desmatamento.alertas_deter}</div><div className="lv2-stat-lbl">DETER</div></div>
            <div><div className={`lv2-stat-val ${laudo.desmatamento.area_desmatada_ha > 0 ? 'bad' : 'good'}`}>{laudo.desmatamento.area_desmatada_ha.toFixed(1)}</div><div className="lv2-stat-lbl">ha afetados</div></div>
          </div>
        </div>

        <div className="msec">
          <div className="lv2-section-hd">
            <div className="lv2-section-title">Restrições Territoriais</div>
            <div className={`lv2-chip ${laudo.restricoes.status}`}>{ST[laudo.restricoes.status].label}</div>
          </div>
          <div className="lv2-restrict-row">
            <div className={`lv2-dot ${laudo.restricoes.sobreposicao_ti ? 'bad' : 'good'}`} />
            <span className="lv2-restrict-text">Terra Indígena{laudo.restricoes.sobreposicao_ti ? ` — ${laudo.restricoes.area_ti_ha.toFixed(1)} ha sobrepostos` : ' — sem sobreposição'}</span>
          </div>
          <div className="lv2-restrict-row">
            <div className={`lv2-dot ${laudo.restricoes.sobreposicao_uc ? 'bad' : 'good'}`} />
            <span className="lv2-restrict-text">Unidade de Conservação{laudo.restricoes.sobreposicao_uc ? ` — ${laudo.restricoes.area_uc_ha.toFixed(1)} ha sobrepostos` : ' — sem sobreposição'}</span>
          </div>
        </div>

        {laudo.cadastro?.ind_status && (
          <div className="msec">
            <div className="lv2-section-hd">
              <div className="lv2-section-title">Perfil Cadastral SICAR</div>
              {laudo.cadastro.classificacao_porte && (
                <div className="lv2-chip atencao">{laudo.cadastro.classificacao_porte}</div>
              )}
            </div>
            <div className="lv2-grid-2">
              <div>
                <div className="lv2-stat-val" style={{ fontSize: '0.85rem' }}>
                  {laudo.cadastro.ind_status === 'AT' ? '✓ Ativo' :
                   laudo.cadastro.ind_status === 'SU' ? '⚠ Suspenso' :
                   laudo.cadastro.ind_status === 'CA' ? '✕ Cancelado' : laudo.cadastro.ind_status}
                </div>
                <div className="lv2-stat-lbl">Status</div>
              </div>
              <div>
                <div className="lv2-stat-val" style={{ fontSize: '0.85rem' }}>
                  {laudo.cadastro.mod_fiscal != null ? `${laudo.cadastro.mod_fiscal.toFixed(2)} MF` : '—'}
                </div>
                <div className="lv2-stat-lbl">Módulos Fiscais</div>
              </div>
            </div>
            <div className="lv2-restrict-row" style={{ marginTop: 6 }}>
              <span className="lv2-stat-lbl" style={{ fontSize: '0.72rem', lineHeight: 1.4 }}>
                {laudo.cadastro.des_condic}
              </span>
            </div>
            {laudo.cadastro.dat_criacao && (
              <div className="lv2-stat-lbl" style={{ fontSize: '0.68rem', marginTop: 4, opacity: 0.7 }}>
                Cadastrado: {laudo.cadastro.dat_criacao}
                {laudo.cadastro.dat_atualizacao && ` · Atualizado: ${laudo.cadastro.dat_atualizacao}`}
              </div>
            )}
          </div>
        )}

        {laudo.solo?.disponivel && (
          <div className="msec">
            <div className="lv2-section-hd">
              <div className="lv2-section-title">Solo · SoilGrids/ISRIC</div>
              {laudo.solo.textura && <div className="lv2-chip ok">{laudo.solo.textura}</div>}
            </div>
            <div className="lv2-grid-3">
              <div>
                <div className={`lv2-stat-val ${laudo.solo.ph < 5.5 ? 'bad' : laudo.solo.ph < 6.5 ? 'warn' : 'good'}`}>
                  {laudo.solo.ph?.toFixed(1) ?? '—'}
                </div>
                <div className="lv2-stat-lbl">pH · {laudo.solo.ph_classe}</div>
              </div>
              <div>
                <div className="lv2-stat-val">{laudo.solo.argila_pct?.toFixed(0) ?? '—'}%</div>
                <div className="lv2-stat-lbl">Argila</div>
              </div>
              <div>
                <div className="lv2-stat-val">{laudo.solo.areia_pct?.toFixed(0) ?? '—'}%</div>
                <div className="lv2-stat-lbl">Areia</div>
              </div>
            </div>
            <div className="lv2-grid-3" style={{ marginTop: 8 }}>
              <div>
                <div className="lv2-stat-val">{laudo.solo.carbono_organico_g_kg?.toFixed(1) ?? '—'}</div>
                <div className="lv2-stat-lbl">C org. g/kg</div>
              </div>
              <div>
                <div className="lv2-stat-val">{laudo.solo.estoque_carbono_tC_ha?.toFixed(1) ?? '—'}</div>
                <div className="lv2-stat-lbl">Estoque C tC/ha</div>
              </div>
              <div>
                <div className={`lv2-stat-val ${laudo.solo.risco_erosao === 'Alto' ? 'bad' : laudo.solo.risco_erosao?.includes('Médio') ? 'warn' : 'good'}`}>
                  {laudo.solo.risco_erosao ?? '—'}
                </div>
                <div className="lv2-stat-lbl">Risco erosão</div>
              </div>
            </div>
            {laudo.solo.classe_ibge && (
              <div className="lv2-stat-lbl" style={{ fontSize: '0.7rem', marginTop: 6, opacity: 0.8 }}>
                Classe pedológica IBGE: {laudo.solo.classe_ibge}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right — pendências + resumo técnico */}
      <div className="modal-col">
        <div className="msec msec--grow">
          <div className="lv2-p-count" style={{ marginBottom: 10 }}>
            {allP.length === 0 ? 'Nenhuma pendência'
              : `${allP.length} pendência${allP.length > 1 ? 's' : ''}${laudo.pendencias_criticas > 0 ? ` · ${laudo.pendencias_criticas} crítica${laudo.pendencias_criticas > 1 ? 's' : ''}` : ''}`}
          </div>
          {allP.length === 0 ? (
            <div className="lv2-ok-card"><div className="lv2-dot good" /><span className="lv2-ok-text">Imóvel em conformidade com o Código Florestal</span></div>
          ) : (
            allP.map((p, i) => (
              <div key={i} className={`lv2-p-card ${p.status}`}>
                <div className="lv2-p-row">
                  <div className="lv2-dot" style={{ background: ST[p.status].clr }} />
                  <span className="lv2-p-title">{p.titulo}</span>
                  {p.area_ha != null && <span className="lv2-p-area">{p.area_ha.toFixed(1)} ha</span>}
                </div>
                <div className="lv2-p-detail">{p.detalhe}</div>
                <div className="lv2-p-orient">{p.orientacao}</div>
              </div>
            ))
          )}
        </div>

        <div className={`tech-resumo-card trc--${laudo.status_geral}`}>

          {/* Banner: título + badge de status */}
          <div className={`trc-top trc-top--${laudo.status_geral}`}>
            <div className="trc-top-left">
              <span className="trc-doc-icon">📋</span>
              <div>
                <div className="trc-name">Resumo Técnico de Conformidade</div>
                <div className="trc-sub">
                  Lei 12.651/2012 · Código Florestal · OEMA
                  <span className={`trc-source-badge ${laudo.resumo_gerado_por === 'ia' ? 'ia' : 'tpl'}`}>
                    {laudo.resumo_gerado_por === 'ia' ? '🤖 IA' : '📄 Template'}
                  </span>
                </div>
              </div>
            </div>
            <div className={`trc-status-badge trc-status-badge--${laudo.status_geral}`}>
              <span className="trc-sbadge-dot" />
              {ST[laudo.status_geral].label}
            </div>
          </div>

          {/* Grid de metadados 2×2 */}
          <div className="trc-meta-grid">
            <div className="trc-meta-item">
              <div className="trc-meta-lbl">Área do Imóvel</div>
              <div className="trc-meta-val">{laudo.area_imovel_ha?.toFixed(2)} ha</div>
            </div>
            <div className="trc-meta-item">
              <div className="trc-meta-lbl">Município</div>
              <div className="trc-meta-val">{laudo.municipio ?? '—'} · MT</div>
            </div>
            <div className="trc-meta-item">
              <div className="trc-meta-lbl">Bioma</div>
              <div className="trc-meta-val">{laudo.rl.bioma}</div>
            </div>
            <div className="trc-meta-item">
              <div className="trc-meta-lbl">Pendências</div>
              <div className={`trc-meta-val ${laudo.pendencias_criticas > 0 ? 'bad' : laudo.total_pendencias > 0 ? 'warn' : 'good'}`}>
                {laudo.total_pendencias}
                {laudo.pendencias_criticas > 0 && (
                  <span className="trc-crit-sub"> · {laudo.pendencias_criticas} crítica{laudo.pendencias_criticas > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          </div>

          {/* Corpo do texto — suporte a markdown */}
          <Markdown text={laudo.resumo_tecnico || '—'} className="trc-body" />

          {/* Footer: CAR code + data */}
          <div className="trc-footer">
            <span className="trc-car">{laudo.car_code ?? 'Geometria manual'}</span>
            <span>{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

    </div>
  )
}

/* ── Modal principal ─────────────────────────────────────────────────────── */
export default function LaudoModal({ laudo, onClose }) {
  const [activeTab, setActiveTab] = useState('produtor')

  const allP = [
    ...laudo.app.pendencias, ...laudo.rl.pendencias,
    ...laudo.desmatamento.pendencias, ...laudo.restricoes.pendencias,
  ]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-hd">
          <div>
            <div className="modal-hd-title">Laudo de Conformidade CAR</div>
            {laudo.car_code && <div className="modal-hd-sub">{laudo.car_code}</div>}
          </div>
          <div className="modal-hd-actions">
            <button className="modal-btn-pdf" onClick={() => exportPDF(laudo)}>↓ Exportar PDF</button>
            <button className="modal-btn-close" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          <button
            className={`modal-tab ${activeTab === 'produtor' ? 'active' : ''}`}
            onClick={() => setActiveTab('produtor')}
          >
            <span className="modal-tab-icon">🌱</span>
            Visão do Produtor
          </button>
          <button
            className={`modal-tab ${activeTab === 'analista' ? 'active' : ''}`}
            onClick={() => setActiveTab('analista')}
          >
            <span className="modal-tab-icon">📊</span>
            Análise Técnica
          </button>
          <div className="modal-tab-fill" />
          <div className={`modal-tab-status-pill ${laudo.status_geral}`}>
            {ST[laudo.status_geral].label} · {laudo.total_pendencias} pendência{laudo.total_pendencias !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'produtor'
          ? <ProducerTab laudo={laudo} allP={allP} />
          : <AnalystTab  laudo={laudo} allP={allP} />
        }

      </div>
    </div>
  )
}
