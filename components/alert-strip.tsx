'use client'

import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ParkingEvent, ParkingEventType } from '@/types/parking'

const titles: Partial<Record<ParkingEventType, string>> = {
  ALERTA_CLONACION: 'Posible clonación de placa',
  ALERTA_OCUPACION_INDEBIDA: 'Ocupación indebida de plaza',
  ACCESO_DENEGADO: 'Placa no registrada',
}

export function AlertStrip({ alerts, onResolve, onOpenAudit }: { alerts: ParkingEvent[]; onResolve: () => void; onOpenAudit: () => void }) {
  if (!alerts.length) return null
  return (
    <section aria-label="Alertas de seguridad activas" className="alert-strip" role="alert">
      <div className="alert-strip-head">
        <ShieldAlert aria-hidden="true" />
        <strong>{alerts.length === 1 ? '1 alerta de seguridad activa' : `${alerts.length} alertas de seguridad activas`}</strong>
        <div className="alert-strip-actions">
          <button className="text-action" onClick={onOpenAudit} type="button">Ver en auditoría</button>
          <Button onClick={onResolve} size="sm" type="button" variant="outline">Resolver alertas</Button>
        </div>
      </div>
      <ul>
        {alerts.slice(0, 3).map((alert) => (
          <li key={alert.id}><b>{titles[alert.evento] ?? 'Alerta'}</b> <span>{alert.placa}</span> <small>{alert.detalle}</small></li>
        ))}
      </ul>
    </section>
  )
}
