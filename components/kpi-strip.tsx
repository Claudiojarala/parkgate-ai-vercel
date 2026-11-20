import { DoorClosed, DoorOpen, ParkingSquare, UsersRound } from 'lucide-react'
import type { TelemetryState } from '@/types/parking'

export function KpiStrip({ telemetry }: { telemetry: ReturnType<typeof pickTelemetry> }) {
  const occupancy = telemetry.cap > 0 ? Math.min(100, Math.round((telemetry.ocupados / telemetry.cap) * 100)) : 0
  const EntryIcon = telemetry.barrera_entrada === 'ABIERTA' ? DoorOpen : DoorClosed
  const ExitIcon = telemetry.barrera_salida === 'ABIERTA' ? DoorOpen : DoorClosed
  const spots = Array.from({ length: Math.min(telemetry.cap, 20) }, (_, index) => index)

  return (
    <section aria-label="Indicadores del estacionamiento" className="kpi-strip">
      <article className="kpi-card kpi-capacity">
        <div className="kpi-heading"><ParkingSquare aria-hidden="true" /><span>Plazas disponibles</span></div>
        <div className="kpi-number">{telemetry.libres}<span> / {telemetry.cap}</span></div>
        <div aria-label={`${telemetry.libres} plazas disponibles de ${telemetry.cap}`} className="parking-segments" role="img">
          {spots.map((spot) => <span className={spot < telemetry.ocupados ? 'segment-occupied' : 'segment-free'} key={spot} />)}
        </div>
      </article>
      <article className="kpi-card">
        <div className="kpi-heading"><UsersRound aria-hidden="true" /><span>Ocupación actual</span></div>
        <div className="kpi-number">{telemetry.ocupados}<span> vehículos · {occupancy}%</span></div>
        <p className="kpi-footnote">{telemetry.fresh ? 'Dato recibido por MQTT' : 'Esperando telemetría del nodo'}</p>
      </article>
      <article className="kpi-card">
        <div className="kpi-heading"><EntryIcon aria-hidden="true" /><span>Barrera de ingreso</span></div>
        <div className={`kpi-number gate-${telemetry.barrera_entrada === 'ABIERTA' ? 'open' : 'closed'}`}>{telemetry.barrera_entrada}</div>
        <p className="kpi-footnote">Estado reportado por el ESP32</p>
      </article>
      <article className="kpi-card">
        <div className="kpi-heading"><ExitIcon aria-hidden="true" /><span>Barrera de salida</span></div>
        <div className={`kpi-number gate-${telemetry.barrera_salida === 'ABIERTA' ? 'open' : 'closed'}`}>{telemetry.barrera_salida}</div>
        <p className="kpi-footnote">Estado reportado por el ESP32</p>
      </article>
    </section>
  )
}

function pickTelemetry(telemetry: TelemetryState & { online: boolean; fresh: boolean }) {
  return telemetry
}
