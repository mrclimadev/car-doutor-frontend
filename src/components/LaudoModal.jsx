import { useState, useEffect, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
import { jsPDF } from 'jspdf'

/* ── WhatsApp share ──────────────────────────────────────────────────────── */
// Apenas emojis BMP (U+0000–U+FFFF) — wa.me não suporta code points acima de U+FFFF
const E = {
  check:  '✅',        // ✅
  warn:   '⚠️',  // ⚠️
  crit:   '❗',        // ❗
  scales: '⚖️',  // ⚖️
  pin:    '▶️',  // ▶️
  bullet: '•',        // •
}

function buildWhatsAppText(laudo) {
  const ST_LABEL = {
    ok:      `${E.check} CONFORME`,
    atencao: `${E.warn} ATENÇÃO`,
    critico: `${E.crit} CRÍTICO`,
  }
  const appOk  = (laudo.app?.deficit_ha || 0) <= 0
  const rlOk   = (laudo.rl?.percentual_declarado || 0) >= (laudo.rl?.percentual_minimo || 20)
  const alertas = (laudo.desmatamento?.alertas_prodes || 0) + (laudo.desmatamento?.alertas_deter || 0)
  const restOk = !laudo.restricoes?.sobreposicao_ti && !laudo.restricoes?.sobreposicao_uc

  const resumo = (laudo.resumo_simples || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/#{1,3}\s+/g, '')
    .replace(/^[-*]\s/gm, '• ')
    .trim()

  return [
    `*Green Car — Análise do Imóvel*`,
    '',
    `${E.pin} *${laudo.municipio || 'Mato Grosso'} · MT*`,
    `Área: *${(laudo.area_imovel_ha || 0).toFixed(0)} ha*`,
    laudo.car_code ? `CAR: ${laudo.car_code}` : null,
    '',
    `*Resultado: ${ST_LABEL[laudo.status_geral] || '—'}*`,
    '',
    resumo,
    '',
    '───────────────',
    `${E.bullet} APP: ${appOk ? `${E.check} dentro do limite` : `${E.warn} déficit ${(laudo.app?.deficit_ha || 0).toFixed(1)} ha`}`,
    `${E.bullet} RL: ${rlOk ? `${E.check} ${(laudo.rl?.percentual_declarado || 0).toFixed(0)}%` : `${E.warn} ${(laudo.rl?.percentual_declarado || 0).toFixed(0)}% (mín ${(laudo.rl?.percentual_minimo || 0).toFixed(0)}%)`}`,
    `${E.bullet} Desmatamento: ${alertas === 0 ? `${E.check} sem alertas` : `${E.warn} ${alertas} alertas`}`,
    `${E.scales} Restrições: ${restOk ? `${E.check} sem sobreposição` : `${E.crit} área sobreposta`}`,
    '',
    laudo.total_pendencias > 0
      ? `${E.bullet} ${laudo.total_pendencias} pendência${laudo.total_pendencias > 1 ? 's' : ''} identificada${laudo.total_pendencias > 1 ? 's' : ''}`
      : `${E.check} Nenhuma pendência encontrada`,
    '',
    '_Análise automática — Green Car (ENAP Hackathon 2026)_',
    '_Não substitui laudo técnico assinado por profissional habilitado._',
  ].filter(p => p !== null).join('\n')
}

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
  doc.text('Green Car', mg, 15)
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
    ...(laudo.land_use?.pendencias ?? []),
  ]

  if (laudo.land_use) {
    const lu = laudo.land_use
    secHd('Camadas SICAR — Uso do Solo', lu.status)
    if (lu.rl_polygon_encontrado)
      kv('RL Poligonal (SICAR)', `${lu.rl_polygon_ha.toFixed(1)} ha`)
    if (lu.area_consolidada_ha > 0)
      kv('Área Consolidada', `${lu.area_consolidada_ha.toFixed(1)} ha`)
    if (lu.pra_elegivel_ha > 0)
      kv('Elegível ao PRA (APP consolidada)', `~${lu.pra_elegivel_ha.toFixed(1)} ha`, 'warn')
    if (lu.uso_restrito_ha > 0)
      kv('Uso Restrito (art. 9°)', `${lu.uso_restrito_ha.toFixed(1)} ha`, 'warn')
    if (lu.area_pousio_ha > 0)
      kv('Área de Pousio', `${lu.area_pousio_ha.toFixed(1)} ha`)
    if (lu.servidao_ha > 0)
      kv('Servidão Administrativa', `${lu.servidao_ha.toFixed(1)} ha`, 'warn')
    y += 5
  }

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
    doc.text('Green Car — Analise Automatica do Cadastro Ambiental Rural — ENAP Hackathon 2026', mg, 292)
    doc.text(`Pagina ${i} de ${pages}`, W - mg, 292, { align: 'right' })
  }

  const fname = laudo.car_code ? `laudo_${laudo.car_code.slice(-8)}.pdf` : `laudo_${Date.now()}.pdf`
  doc.save(fname)
}

/* ── Land use composition helpers ───────────────────────────────────────── */
function LandUseBar({ laudo }) {
  const total = laudo.area_imovel_ha || 1
  const lu = laudo.land_use || {}
  const app = laudo.app?.area_declarada_ha || 0

  // RL: use polygon if found, else declared
  const rl = lu.rl_polygon_encontrado ? lu.rl_polygon_ha : laudo.rl?.area_declarada_ha || 0
  const consolidated = lu.area_consolidada_ha || 0
  const restrito = lu.uso_restrito_ha || 0
  const pousio = lu.area_pousio_ha || 0
  const serv = lu.servidao_ha || 0

  // Overlap-aware segments (simplified: sum capped at total)
  const used = Math.min(rl + app + restrito + pousio + serv, total)
  const productive = Math.max(0, total - used)

  const segs = [
    { key: 'rl',   pct: (rl / total) * 100,          color: '#1b5e20', label: 'RL' },
    { key: 'app',  pct: (app / total) * 100,          color: '#1565c0', label: 'APP' },
    { key: 'ur',   pct: (restrito / total) * 100,     color: '#f5a623', label: 'Uso Restrito' },
    { key: 'po',   pct: (pousio / total) * 100,       color: '#d4c200', label: 'Pousio' },
    { key: 'sv',   pct: (serv / total) * 100,         color: '#7b1fa2', label: 'Servidão' },
    { key: 'pr',   pct: (productive / total) * 100,   color: '#2d4a1e', label: 'Produtiva' },
  ].filter(s => s.pct > 0.5)

  return (
    <div className="lu-bar-wrap">
      <div className="lu-bar">
        {segs.map(s => (
          <div key={s.key} className="lu-bar-seg" style={{ width: `${Math.min(s.pct, 100)}%`, background: s.color }}
               title={`${s.label}: ${s.pct.toFixed(1)}%`} />
        ))}
      </div>
      <div className="lu-bar-legend">
        {segs.map(s => (
          <div key={s.key} className="lu-legend-item">
            <div className="lu-legend-dot" style={{ background: s.color }} />
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LuMetric({ icon, label, value, sub, status }) {
  return (
    <div className={`lu-metric lu-metric--${status}`}>
      <div className="lu-metric-icon">{icon}</div>
      <div className="lu-metric-body">
        <div className="lu-metric-label">{label}</div>
        <div className={`lu-metric-value ${status}`}>{value}</div>
        {sub && <div className="lu-metric-sub">{sub}</div>}
      </div>
    </div>
  )
}

/* ── Simulador "E se eu regularizar?" ───────────────────────────────────── */
const CARBONO_FACTOR = { 'Amazônia Legal': 10, 'Cerrado (Amazônia Legal)': 5, 'Cerrado': 3, 'Caatinga': 3, 'Pantanal': 4, 'Pampa': 3 }
const PRECO_CARBONO_R = 45  // R$/tCO2e mercado voluntário estimado

function SimuladorCard({ laudo }) {
  const bioma     = laudo.rl?.bioma || 'Cerrado'
  const totalHa   = laudo.area_imovel_ha || 0
  const atualPct  = laudo.rl?.percentual_declarado || 0
  const minPct    = laudo.rl?.percentual_minimo || 20
  const deficitHa = Math.max(0, laudo.rl?.area_minima_ha - laudo.rl?.area_declarada_ha)
  const appDefHa  = laudo.app?.deficit_ha || 0
  const temDeficit = deficitHa > 0.5 || appDefHa > 0.5

  const maxPct  = Math.min(100, Math.max(minPct + 20, atualPct + 30))
  const [alvo, setAlvo] = useState(() => Math.min(maxPct, Math.max(minPct, atualPct + (deficitHa > 0 ? (deficitHa / totalHa) * 100 : 5))))

  const areaAdicional = Math.max(0, (alvo - atualPct) / 100 * totalHa)
  const fator         = CARBONO_FACTOR[bioma] || 4
  const co2Ano        = areaAdicional * fator
  const receitaAno    = co2Ano * PRECO_CARBONO_R
  const praElegivel   = temDeficit && (laudo.cadastro?.mod_fiscal == null || laudo.cadastro.mod_fiscal <= 15)
  const creditoLibera = alvo >= minPct && (laudo.app?.deficit_ha || 0) < 0.5

  return (
    <div className="simul-card">
      <div className="prod-section-lbl" style={{ marginBottom: 10 }}>
        Simulador — E se eu regularizar?
      </div>

      <div className="simul-slider-row">
        <span className="simul-slider-lbl">Meta de Reserva Legal</span>
        <span className="simul-slider-val">{alvo.toFixed(0)}%</span>
      </div>
      <input
        type="range" className="simul-range"
        min={Math.max(0, atualPct)} max={maxPct} step={1}
        value={alvo} onChange={e => setAlvo(Number(e.target.value))}
      />
      <div className="simul-range-labels">
        <span>Atual: {atualPct.toFixed(0)}%</span>
        <span className={atualPct >= minPct ? 'good' : 'warn'}>Mín: {minPct.toFixed(0)}%</span>
        <span>Meta: {alvo.toFixed(0)}%</span>
      </div>

      <div className="simul-grid">
        <div className="simul-item">
          <div className="simul-item-icon">🌿</div>
          <div className="simul-item-val good">{areaAdicional.toFixed(1)} ha</div>
          <div className="simul-item-lbl">área a recuperar</div>
        </div>
        <div className="simul-item">
          <div className="simul-item-icon">☁️</div>
          <div className="simul-item-val good">{co2Ano.toFixed(0)} tCO₂e</div>
          <div className="simul-item-lbl">carbono/ano ({bioma.split(' ')[0]})</div>
        </div>
        <div className="simul-item">
          <div className="simul-item-icon">💰</div>
          <div className="simul-item-val good">
            {receitaAno >= 1000
              ? `R$ ${(receitaAno / 1000).toFixed(1)}k`
              : `R$ ${receitaAno.toFixed(0)}`}
          </div>
          <div className="simul-item-lbl">receita estimada/ano</div>
        </div>
      </div>

      <div className="simul-badges">
        <div className={`simul-badge ${alvo >= minPct ? 'simul-badge--ok' : 'simul-badge--no'}`}>
          {alvo >= minPct ? '✓' : '✗'} Pronaf / Crédito Rural
        </div>
        <div className={`simul-badge ${praElegivel ? 'simul-badge--ok' : 'simul-badge--no'}`}>
          {praElegivel ? '✓' : '—'} Elegível ao PRA
        </div>
        <div className={`simul-badge ${creditoLibera ? 'simul-badge--ok' : 'simul-badge--no'}`}>
          {creditoLibera ? '✓' : '✗'} CAR regularizado
        </div>
      </div>
      <div className="simul-disclaimer">
        * Estimativa baseada em dados de mercado voluntário de carbono (VCM). Não constitui oferta de crédito.
      </div>
    </div>
  )
}

/* ── Comparação com vizinhança ───────────────────────────────────────────── */
function VizinhancaCard({ laudo }) {
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(false)
  const municipio = laudo.municipio

  useEffect(() => {
    if (!municipio) return
    setLoading(true)
    fetch(`${API_BASE}/stats/municipio/${encodeURIComponent(municipio)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setStats(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [municipio])

  if (!municipio) return null

  const mfProp = laudo.cadastro?.mod_fiscal
  const mfMun  = stats?.media_modulos_fiscais
  const confProp = laudo.status_geral === 'ok' ? 100 : laudo.status_geral === 'atencao' ? 50 : 0

  return (
    <div className="vizin-card">
      <div className="prod-section-lbl" style={{ marginBottom: 10 }}>
        Contexto regional — {municipio}
      </div>

      {loading && <div className="vizin-loading">Carregando dados do município...</div>}

      {stats && (
        <>
          <div className="vizin-grid">
            <div className="vizin-item">
              <div className="vizin-bar-wrap">
                <div className="vizin-bar-track">
                  <div className="vizin-bar-fill vizin-bar--mun" style={{ width: `${stats.pct_conforme}%` }} />
                </div>
                <div className="vizin-bar-track">
                  <div
                    className={`vizin-bar-fill ${confProp === 100 ? 'vizin-bar--ok' : confProp === 50 ? 'vizin-bar--warn' : 'vizin-bar--crit'}`}
                    style={{ width: `${confProp}%` }}
                  />
                </div>
              </div>
              <div className="vizin-row-labels">
                <span className="vizin-lbl-mun">{stats.pct_conforme}% em conformidade no município</span>
                <span className={`vizin-lbl-prop ${laudo.status_geral}`}>
                  Este imóvel: {laudo.status_geral === 'ok' ? 'conforme' : laudo.status_geral === 'atencao' ? 'atenção' : 'irregular'}
                </span>
              </div>
            </div>
          </div>

          <div className="vizin-stats">
            <div className="vizin-stat">
              <div className="vizin-stat-val">{stats.total_imoveis.toLocaleString('pt-BR')}</div>
              <div className="vizin-stat-lbl">imóveis em {municipio}</div>
            </div>
            {mfMun != null && (
              <div className="vizin-stat">
                <div className="vizin-stat-val">{mfMun.toFixed(1)} MF</div>
                <div className="vizin-stat-lbl">média do município</div>
              </div>
            )}
            {mfProp != null && (
              <div className="vizin-stat">
                <div className={`vizin-stat-val ${mfProp <= mfMun ? 'warn' : 'good'}`}>
                  {mfProp.toFixed(1)} MF
                </div>
                <div className="vizin-stat-lbl">sua propriedade</div>
              </div>
            )}
            <div className="vizin-stat">
              <div className={`vizin-stat-val ${stats.pct_ativo >= 80 ? 'good' : 'warn'}`}>
                {stats.pct_ativo}%
              </div>
              <div className="vizin-stat-lbl">CARs ativos</div>
            </div>
          </div>

          {stats.porte_distribuicao && (
            <div className="vizin-porte">
              {Object.entries({ minifundio: 'Minifúndio', pequena: 'Pequena', media: 'Média', grande: 'Grande' })
                .filter(([k]) => stats.porte_distribuicao[k] > 0)
                .map(([k, label]) => {
                  const pct = Math.round(stats.porte_distribuicao[k] / stats.total_imoveis * 100)
                  return (
                    <div key={k} className="vizin-porte-item">
                      <div className="vizin-porte-bar" style={{ width: `${pct}%` }} />
                      <span className="vizin-porte-lbl">{label} {pct}%</span>
                    </div>
                  )
                })}
            </div>
          )}
        </>
      )}
    </div>
  )
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

          {/* Simulador de regularização */}
          <SimuladorCard laudo={laudo} />

          {/* Comparação com vizinhança */}
          <VizinhancaCard laudo={laudo} />

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
  const [drawerOpen, setDrawerOpen] = useState(false)
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
        {/* Camadas SICAR adicionais */}
        {laudo.land_use && (
          <div className="msec">
            <div className="lv2-section-hd">
              <div className="lv2-section-title">Camadas SICAR — Uso do Solo</div>
              <div className={`lv2-chip ${laudo.land_use.status}`}>{ST[laudo.land_use.status].label}</div>
            </div>

            {/* Land use composition bar */}
            <LandUseBar laudo={laudo} />

            {/* Metrics grid */}
            <div className="lu-grid">
              <LuMetric
                icon="🌳" label="RL Poligonal"
                value={laudo.land_use.rl_polygon_encontrado
                  ? `${laudo.land_use.rl_polygon_ha.toFixed(1)} ha`
                  : 'Não cadastrado'}
                sub={laudo.land_use.rl_polygon_encontrado
                  ? `vs ${laudo.rl.area_declarada_ha.toFixed(1)} ha declarado`
                  : 'Polígono RL não encontrado no SICAR'}
                status={laudo.land_use.rl_polygon_encontrado ? 'ok' : 'atencao'}
              />
              <LuMetric
                icon="🏗️" label="Área Consolidada"
                value={laudo.land_use.area_consolidada_ha > 0
                  ? `${laudo.land_use.area_consolidada_ha.toFixed(1)} ha`
                  : '—'}
                sub={laudo.land_use.pra_elegivel_ha > 0
                  ? `~${laudo.land_use.pra_elegivel_ha.toFixed(1)} ha elegível ao PRA`
                  : 'Uso agropecuário anterior a jul/2008'}
                status={laudo.land_use.pra_elegivel_ha > 0 ? 'atencao' : 'ok'}
              />
              <LuMetric
                icon="🌊" label="Uso Restrito"
                value={laudo.land_use.uso_restrito_ha > 0
                  ? `${laudo.land_use.uso_restrito_ha.toFixed(1)} ha`
                  : '—'}
                sub={laudo.land_use.uso_restrito_tipos.length > 0
                  ? laudo.land_use.uso_restrito_tipos.slice(0, 2).join(', ')
                  : 'art. 9° Código Florestal'}
                status={laudo.land_use.uso_restrito_ha > 0 ? 'atencao' : 'ok'}
              />
              <LuMetric
                icon="🌾" label="Pousio"
                value={laudo.land_use.area_pousio_ha > 0
                  ? `${laudo.land_use.area_pousio_ha.toFixed(1)} ha`
                  : '—'}
                sub="Descanso entre cultivos"
                status="ok"
              />
              <LuMetric
                icon="⚡" label="Servidão Admin."
                value={laudo.land_use.servidao_ha > 0
                  ? `${laudo.land_use.servidao_ha.toFixed(1)} ha`
                  : '—'}
                sub={laudo.land_use.servidao_tipos.length > 0
                  ? laudo.land_use.servidao_tipos.slice(0, 2).join(', ')
                  : 'Infraestrutura'}
                status={laudo.land_use.servidao_ha > 0 ? 'atencao' : 'ok'}
              />
            </div>
          </div>
        )}
      </div>

      {/* Right — resumo técnico full-height + pendências drawer */}
      <div className="modal-col modal-col--right" style={{ position: 'relative' }}>

        {/* ── Pendências trigger button ─────────────────────────────────── */}
        <button
          className={`pend-trigger pend-trigger--${laudo.status_geral}${drawerOpen ? ' pend-trigger--active' : ''}`}
          onClick={() => setDrawerOpen(o => !o)}
          title="Ver pendências"
        >
          <span className="pend-trigger-icon">
            {laudo.pendencias_criticas > 0 ? '🚨' : allP.length > 0 ? '⚠️' : '✅'}
          </span>
          <span className="pend-trigger-label">
            {allP.length === 0
              ? 'Sem pendências'
              : `${allP.length} pendência${allP.length > 1 ? 's' : ''}`}
          </span>
          {laudo.pendencias_criticas > 0 && (
            <span className="pend-trigger-crit">{laudo.pendencias_criticas} crítica{laudo.pendencias_criticas > 1 ? 's' : ''}</span>
          )}
          <span className="pend-trigger-arrow">{drawerOpen ? '▶' : '◀'}</span>
        </button>

        {/* ── Resumo técnico — full height ─────────────────────────────── */}
        <div className={`tech-resumo-card trc--${laudo.status_geral} trc--full`}>

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
              <div
                className={`trc-meta-val trc-pend-link ${laudo.pendencias_criticas > 0 ? 'bad' : allP.length > 0 ? 'warn' : 'good'}`}
                onClick={() => setDrawerOpen(true)}
                style={{ cursor: 'pointer' }}
                title="Abrir pendências"
              >
                {laudo.total_pendencias}
                {laudo.pendencias_criticas > 0 && (
                  <span className="trc-crit-sub"> · {laudo.pendencias_criticas} crítica{laudo.pendencias_criticas > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          </div>

          <Markdown text={laudo.resumo_tecnico || '—'} className="trc-body trc-body--full" />

          <div className="trc-footer">
            <span className="trc-car">{laudo.car_code ?? 'Geometria manual'}</span>
            <span>{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
          </div>
        </div>

        {/* ── Pendências drawer (slide from right) ─────────────────────── */}
        <div className={`pend-drawer${drawerOpen ? ' pend-drawer--open' : ''}`}>
          <div className="pend-drawer-hd">
            <div className="pend-drawer-hd-left">
              <span className="pend-drawer-title">Pendências</span>
              <span className={`pend-drawer-badge ${laudo.pendencias_criticas > 0 ? 'critico' : allP.length > 0 ? 'atencao' : 'ok'}`}>
                {allP.length}
              </span>
            </div>
            <button className="pend-drawer-close" onClick={() => setDrawerOpen(false)}>×</button>
          </div>
          <div className="pend-drawer-body">
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
                    {p.area_ha != null && <span className="lv2-p-area">{p.area_ha.toFixed(1)} ha</span>}
                  </div>
                  <div className="lv2-p-detail">{p.detalhe}</div>
                  <div className="lv2-p-orient">{p.orientacao}</div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  )
}

/* ── Aba Metodologias ────────────────────────────────────────────────────── */
const METODO_SECTIONS = [
  {
    id: 'app',
    icon: '🌊',
    title: 'APP — Área de Preservação Permanente',
    leis: ['Art. 4°, Lei 12.651/2012', 'Art. 61-A §§1–4, Lei 12.651/2012'],
    items: [
      {
        label: 'Faixas marginais de cursos d\'água (Art. 4°, I)',
        texto: 'A largura mínima da APP é definida pela largura do curso d\'água: até 10m → 30m de faixa; 10–50m → 50m; 50–200m → 100m; 200–600m → 200m; acima de 600m → 500m.',
      },
      {
        label: 'Áreas consolidadas — pequenas propriedades (Art. 61-A)',
        texto: 'Para imóveis com uso agropecuário anterior a jul/2008, a faixa de recomposição é reduzida por porte: ≤1 MF → 5m; 1–2 MF → 8m; 2–4 MF → 15m; >4 MF → 20–200m conforme largura.',
      },
      {
        label: 'Método de cálculo',
        texto: 'Buffer geométrico aplicado sobre a hidrografia declarada no SICAR (sicar_hidrografia), reprojetado para EPSG:31981 (métrico), intersecionado com o polígono do imóvel e reconvertido para WGS84.',
      },
      {
        label: 'Simplificação MVP',
        texto: 'Quando a largura do curso d\'água não está declarada no SICAR, aplica-se o buffer mínimo do Art. 4° (30m) ou o buffer Art. 61-A correspondente ao porte. Um déficit < 2 ha nessa condição é classificado como ATENÇÃO, não CRÍTICO.',
      },
    ],
  },
  {
    id: 'rl',
    icon: '🌳',
    title: 'RL — Reserva Legal',
    leis: ['Art. 12, Lei 12.651/2012', 'Art. 67, Lei 12.651/2012'],
    items: [
      {
        label: 'Percentuais mínimos por bioma (Art. 12)',
        texto: 'Amazônia Legal: 80%. Cerrado dentro da Amazônia Legal (ex: norte de MT): 35%. Cerrado fora da Amazônia Legal, Caatinga, Pantanal, Pampa: 20%.',
      },
      {
        label: 'Regime especial — pequena propriedade (Art. 67)',
        texto: 'Imóveis com até 4 módulos fiscais cujo CAR foi inscrito até 05/05/2014 podem ter como RL a vegetação nativa existente na data da inscrição, independentemente do percentual mínimo do bioma.',
      },
      {
        label: 'Determinação do bioma',
        texto: 'O bioma é determinado pelo centróide do imóvel. Para Mato Grosso: latitudes acima de −13° são classificadas como Amazônia Legal (80%); abaixo, como Cerrado dentro da Amazônia Legal (35%). Fronteira exata via polígono IBGE pode ser adicionada em versão futura.',
      },
      {
        label: 'Fonte de vegetação',
        texto: 'Camada sicar_vegetacao_nativa do SICAR. Quando disponível, filtrada pelo cod_imovel do próprio imóvel para evitar contabilizar vegetação de propriedades vizinhas.',
      },
    ],
  },
  {
    id: 'desmat',
    icon: '🛰️',
    title: 'Alertas de Desmatamento',
    leis: ['Lei 12.651/2012', 'PPCDAM/PPCERRADO'],
    items: [
      {
        label: 'PRODES — Projeto de Monitoramento do Desmatamento',
        texto: 'Polígonos de desmatamento anual do INPE/MapBiomas (Amazônia, Cerrado, demais biomas). Detecta cortes rasos consolidados. Resolução ~30m. Atualização anual.',
      },
      {
        label: 'DETER — Sistema de Detecção em Tempo Real',
        texto: 'Alertas do INPE para detecção rápida de desmatamento e degradação. Menor área mínima mapeável (~1–3 ha). Atualização quase diária. Inclui cicatrizes de fogo e degradação.',
      },
      {
        label: 'Método',
        texto: 'Interseção espacial entre o polígono do imóvel (WGS84) e as camadas PRODES/DETER. Área afetada calculada em EPSG:31981.',
      },
    ],
  },
  {
    id: 'restric',
    icon: '⚖️',
    title: 'Restrições Territoriais',
    leis: ['Estatuto do Índio (Lei 6.001/1973)', 'SNUC (Lei 9.985/2000)'],
    items: [
      {
        label: 'Terras Indígenas — FUNAI',
        texto: 'Polígonos oficiais das TIs demarcadas, homologadas ou em processo de demarcação, disponibilizados pela FUNAI. Sobreposição com TI inviabiliza a atividade agropecuária e pode gerar embargo.',
      },
      {
        label: 'Unidades de Conservação — CNUC',
        texto: 'Cadastro Nacional de Unidades de Conservação (MMA). Inclui proteção integral (ex: Parques Nacionais) e uso sustentável (ex: APA, FLONA). O grau de restrição varia por categoria.',
      },
      {
        label: 'Método',
        texto: 'Interseção do polígono do imóvel com as camadas de TI (ti_sirgeas) e UC (uc_cnuc). Área sobreposta calculada em EPSG:31981.',
      },
    ],
  },
  {
    id: 'solo',
    icon: '🧪',
    title: 'Análise de Solo',
    leis: ['Fonte: SoilGrids / ISRIC World Soil Information'],
    items: [
      {
        label: 'SoilGrids 2.0',
        texto: 'Base global de propriedades do solo com resolução de 250m, produzida pelo ISRIC. Modelos de aprendizado de máquina treinados em ~240.000 perfis de solo.',
      },
      {
        label: 'Variáveis consultadas',
        texto: 'pH em água (0–15cm); argila, silte e areia (%); carbono orgânico total (g/kg); estimativa de estoque de carbono (tC/ha). Textura classificada pelo triângulo USDA.',
      },
      {
        label: 'Limitações',
        texto: 'Estimativa regional (250m). Não substitui análise laboratorial. Indicado para triagem e orientação geral.',
      },
    ],
  },
  {
    id: 'sicar',
    icon: '🗂️',
    title: 'Camadas SICAR — Uso do Solo',
    leis: ['Lei 12.651/2012 (Código Florestal)', 'Decreto 7.830/2012 (SICAR)'],
    items: [
      { label: 'sicar_vegetacao_nativa', texto: 'Vegetação nativa declarada no CAR. Base para cálculo de RL e conformidade do Art. 12.' },
      { label: 'sicar_reserva_legal', texto: 'Polígono de RL averbado ou proposto. Permite comparar geometria declarada com vegetação nativa.' },
      { label: 'sicar_area_consolidada', texto: 'Áreas com uso agropecuário consolidado antes de 22/07/2008. Critério para Art. 61-A (APP) e Art. 66 (RL).' },
      { label: 'sicar_uso_restrito', texto: 'Uso restrito declarado (Art. 9°): várzeas, planícies inundáveis. Uso permitido com restrições específicas.' },
      { label: 'sicar_area_pousio', texto: 'Áreas em descanso temporário entre cultivos. Indicam histórico de uso agropecuário.' },
      { label: 'sicar_servidao_administrativa', texto: 'Servidões de infraestrutura (linhas de transmissão, dutos, rodovias). Podem sobrepor APP/RL com regras específicas.' },
    ],
  },
  {
    id: 'geral',
    icon: '📐',
    title: 'Considerações Metodológicas Gerais',
    leis: [],
    items: [
      {
        label: 'Sistema de referência',
        texto: 'Geometrias em WGS84 (EPSG:4326). Cálculos de área e buffer em EPSG:31981 (SIRGAS 2000 / UTM Zona 21S), adequado para Mato Grosso.',
      },
      {
        label: 'Fonte dos dados',
        texto: 'Dados do SICAR (Serviço Florestal Brasileiro) em formato GeoParquet. Versão conforme disponível no repositório do hackathon ENAP 2026.',
      },
      {
        label: 'Limitações do MVP',
        texto: 'Protótipo demonstrativo. Análise baseada em dados declaratórios do CAR e bases públicas nacionais. Não substitui vistoria de campo, laudos técnicos assinados por profissional habilitado nem decisão administrativa da SEMA-MT.',
      },
      {
        label: 'Resumos com IA',
        texto: 'Quando ativado, os resumos são gerados pelo modelo Claude (Anthropic) com base nos dados calculados. Revise sempre os valores numéricos antes de uso oficial.',
      },
    ],
  },
]

function MethodologyTab({ laudo }) {
  const [open, setOpen] = useState({})
  const toggle = (id) => setOpen(o => ({ ...o, [id]: !o[id] }))

  const appInfo = laudo.app?.pendencias?.find(p => p.codigo === 'APP_ART61A_APLICADO')
  const art67   = laudo.rl?.pendencias?.find(p => p.codigo?.startsWith('RL_ART67'))

  return (
    <div className="metodo-wrap">
      {(appInfo || art67) && (
        <div className="metodo-context-banner">
          <div className="metodo-context-title">Artigos especiais aplicados nesta análise</div>
          <div className="metodo-context-pills">
            {appInfo && (
              <div className="metodo-pill metodo-pill--ok">
                <span>🌊</span>
                <span>Art. 61-A aplicado — APP com buffer reduzido ({laudo.cadastro?.mod_fiscal?.toFixed(1)} MF)</span>
              </div>
            )}
            {art67 && (
              <div className="metodo-pill metodo-pill--ok">
                <span>🌳</span>
                <span>Art. 67 aplicado — RL pelo regime de pequena propriedade</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="metodo-list">
        {METODO_SECTIONS.map(sec => (
          <div key={sec.id} className={`metodo-sec ${open[sec.id] ? 'open' : ''}`}>
            <button className="metodo-sec-hd" onClick={() => toggle(sec.id)}>
              <span className="metodo-sec-icon">{sec.icon}</span>
              <div className="metodo-sec-hd-body">
                <div className="metodo-sec-title">{sec.title}</div>
                {sec.leis.length > 0 && (
                  <div className="metodo-sec-leis">
                    {sec.leis.map((l, i) => <span key={i} className="metodo-lei-chip">{l}</span>)}
                  </div>
                )}
              </div>
              <span className="metodo-chevron">{open[sec.id] ? '▾' : '▸'}</span>
            </button>

            {open[sec.id] && (
              <div className="metodo-sec-body">
                {sec.items.map((item, i) => (
                  <div key={i} className="metodo-item">
                    <div className="metodo-item-label">{item.label}</div>
                    <div className="metodo-item-texto">{item.texto}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Modal principal ─────────────────────────────────────────────────────── */
export default function LaudoModal({ laudo, onClose }) {
  const [activeTab, setActiveTab] = useState('produtor')
  const [emailState, setEmailState] = useState({ open: false, address: '', sending: false, sent: false, error: null })
  const emailInputRef = useRef(null)

  useEffect(() => {
    if (emailState.open) setTimeout(() => emailInputRef.current?.focus(), 80)
  }, [emailState.open])

  async function sendReport() {
    const addr = emailState.address.trim()
    if (!addr || emailState.sending) return
    setEmailState(s => ({ ...s, sending: true, error: null }))
    try {
      const res = await fetch(`${API_BASE}/send-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr, laudo }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Erro ao enviar')
      setEmailState(s => ({ ...s, sending: false, sent: true }))
      setTimeout(() => setEmailState({ open: false, address: '', sending: false, sent: false, error: null }), 5000)
    } catch (e) {
      setEmailState(s => ({ ...s, sending: false, error: e.message }))
    }
  }

  const allP = [
    ...laudo.app.pendencias, ...laudo.rl.pendencias,
    ...laudo.desmatamento.pendencias, ...laudo.restricoes.pendencias,
    ...(laudo.land_use?.pendencias ?? []),
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
          <div className="modal-hd-actions" style={{ position: 'relative' }}>
            {/* WhatsApp */}
            <a
              className="modal-btn-wpp"
              href={`https://wa.me/?text=${encodeURIComponent(buildWhatsAppText(laudo))}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Compartilhar resumo no WhatsApp"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{verticalAlign:'middle',marginRight:5}}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
              </svg>
              WhatsApp
            </a>

            {/* Email */}
            <button
              className={`modal-btn-email ${emailState.sent ? 'sent' : ''}`}
              onClick={() => setEmailState(s => ({ ...s, open: !s.open, error: null }))}
              title="Enviar laudo por email"
            >
              {emailState.sent ? '✓ Enviado!' : '✉ Email'}
            </button>

            {/* Email form dropdown */}
            {emailState.open && (
              <div className="modal-email-form" onClick={e => e.stopPropagation()}>
                {emailState.sent ? (
                  <div className="modal-email-success">
                    <span className="modal-email-success-icon">✓</span>
                    <div>
                      <div className="modal-email-success-title">Email enviado!</div>
                      <div className="modal-email-success-sub">Verifique também a pasta de spam</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="modal-email-form-title">Enviar laudo técnico</div>
                    <div className="modal-email-form-sub">Para analista OEMA ou técnico responsável</div>
                    <div className="modal-email-input-row">
                      <input
                        ref={emailInputRef}
                        type="email"
                        className="modal-email-input"
                        placeholder="email@sema.mt.gov.br"
                        value={emailState.address}
                        onChange={e => setEmailState(s => ({ ...s, address: e.target.value, error: null }))}
                        onKeyDown={e => e.key === 'Enter' && sendReport()}
                      />
                      <button
                        className="modal-email-send"
                        onClick={sendReport}
                        disabled={emailState.sending || !emailState.address.trim()}
                      >
                        {emailState.sending ? '...' : 'Enviar'}
                      </button>
                    </div>
                    {emailState.error && (
                      <div className="modal-email-error">{emailState.error}</div>
                    )}
                  </>
                )}
              </div>
            )}

            <button className="modal-btn-pdf" onClick={() => exportPDF(laudo)}>↓ PDF</button>
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
          <button
            className={`modal-tab ${activeTab === 'metodologia' ? 'active' : ''}`}
            onClick={() => setActiveTab('metodologia')}
          >
            <span className="modal-tab-icon">📜</span>
            Metodologias
          </button>
          <div className="modal-tab-fill" />
          <div className={`modal-tab-status-pill ${laudo.status_geral}`}>
            {ST[laudo.status_geral].label} · {laudo.total_pendencias} pendência{laudo.total_pendencias !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'produtor'
          ? <ProducerTab laudo={laudo} allP={allP} />
          : activeTab === 'analista'
          ? <AnalystTab  laudo={laudo} allP={allP} />
          : <MethodologyTab laudo={laudo} />
        }

      </div>
    </div>
  )
}
