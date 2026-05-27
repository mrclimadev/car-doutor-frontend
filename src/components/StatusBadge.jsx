const ICONS = { critico: '🔴', atencao: '🟡', ok: '🟢' }
const LABELS = { critico: 'Crítico', atencao: 'Atenção', ok: 'Conforme' }

export default function StatusBadge({ status }) {
  return (
    <span className={`badge ${status}`}>
      {ICONS[status]} {LABELS[status]}
    </span>
  )
}
