'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AuditFilter, AuditTypeFilter, ParkingEvent } from '@/types/parking'

const eventLabels: Record<ParkingEvent['evento'], string> = {
  ACCESO_PLACA_OK: 'Acceso autorizado',
  ACCESO_DENEGADO: 'Acceso denegado',
  ACCESO_DENEGADO_LLENO: 'Estacionamiento lleno',
  ALERTA_CLONACION: 'Posible clonación',
  SALIDA_VEHICULO: 'Salida de vehículo',
  PLAZA_OCUPADA: 'Plaza ocupada',
  PLAZA_LIBRE: 'Plaza libre',
  ESTACIONAMIENTO_CORRECTO: 'Estacionamiento correcto',
  ALERTA_OCUPACION_INDEBIDA: 'Ocupación indebida',
  APERTURA_MANUAL_ENTRADA: 'Control manual · ingreso',
  APERTURA_MANUAL_SALIDA: 'Control manual · salida',
  CONTROL_MANUAL: 'Control manual · LED/LCD',
  RESET_SISTEMA: 'Reinicio de estado',
}

function limaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function dayNumber(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

export function AuditLog({ events, filter, onFilterChange, typeFilter, onTypeFilterChange, onRefresh, loading, error }: {
  events: ParkingEvent[]
  filter: AuditFilter
  onFilterChange: (filter: AuditFilter) => void
  typeFilter: AuditTypeFilter
  onTypeFilterChange: (filter: AuditTypeFilter) => void
  onRefresh: () => void
  loading: boolean
  error?: string
}) {
  const today = dayNumber(limaDateKey(new Date()))
  const visible = events.filter((event) => {
    const date = dayNumber(limaDateKey(new Date(event.fecha_utc)))
    if (filter === 'today' && date !== today) return false
    if (filter === 'week' && (date > today || date < today - 6)) return false
    if (typeFilter === 'denied' && event.evento !== 'ACCESO_DENEGADO' && event.evento !== 'ACCESO_DENEGADO_LLENO') return false
    if (typeFilter === 'alerts' && !event.alerta) return false
    if (typeFilter !== 'all' && typeFilter !== 'denied' && typeFilter !== 'alerts' && event.evento !== typeFilter) return false
    return true
  })

  return (
    <section className="section-stack" aria-labelledby="audit-title">
      <div className="section-heading audit-heading">
        <div><p className="eyebrow">TRAZABILIDAD · ÚLTIMOS 50 EVENTOS</p><h2 id="audit-title">Auditoría &amp; logs</h2></div>
        <Button onClick={onRefresh} size="sm" variant="outline"><RefreshCw aria-hidden="true" data-icon="inline-start" />Actualizar</Button>
      </div>
      <div className="audit-toolbar">
        <div aria-label="Rango de auditoría" className="audit-filters">
          {([['all', 'Todos'], ['today', 'Hoy'], ['week', '7 días']] as const).map(([value, label]) => (
            <button aria-pressed={filter === value} className={filter === value ? 'audit-filter-active' : ''} key={value} onClick={() => onFilterChange(value)} type="button">{label}</button>
          ))}
        </div>
        <label className="audit-type-filter"><span>Tipo de evento</span><select aria-label="Filtrar por tipo de evento" onChange={(event) => onTypeFilterChange(event.target.value as AuditTypeFilter)} value={typeFilter}>
          <option value="all">Todos los tipos</option>
          <option value="denied">Intentos denegados</option>
          <option value="alerts">Alertas de seguridad</option>
          {(Object.entries(eventLabels) as [ParkingEvent['evento'], string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      {error ? <div className="empty-state error-state" role="alert"><p>{error}</p></div> : loading ? <div aria-label="Cargando auditoría" className="audit-loading"><span /><span /><span /></div> : visible.length ? (
        <div className="audit-table-wrap"><table className="audit-table">
          <thead><tr><th>Hora · Lima</th><th>Evento</th><th>Placa</th><th>Detalle</th></tr></thead>
          <tbody>{visible.map((event) => (
            <tr key={event.id}>
              <td><time dateTime={event.fecha_utc}>{new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(event.fecha_utc))}</time></td>
              <td><span className={`event-badge event-${event.evento}`}>{eventLabels[event.evento]}</span></td>
              <td className="audit-plate">{event.placa}</td>
              <td className="audit-detail">{event.detalle}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : (
        <div className="empty-state"><p>{events.length ? 'No hay eventos para este filtro.' : 'Todavía no hay eventos. Los accesos y comandos manuales aparecerán aquí.'}</p></div>
      )}
    </section>
  )
}
