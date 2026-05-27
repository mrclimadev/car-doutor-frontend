import StatusBadge from './StatusBadge'

export default function PendenciaCard({ p }) {
  return (
    <div className={`pendencia-card ${p.status}`}>
      <div className="pendencia-titulo">
        <StatusBadge status={p.status} />
        {p.titulo}
        {p.area_ha != null && (
          <span className="pendencia-area">{p.area_ha.toFixed(1)} ha</span>
        )}
      </div>
      <div className="pendencia-orientacao">{p.orientacao}</div>
    </div>
  )
}
