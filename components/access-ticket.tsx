'use client'

import { AlertTriangle, Check, CircleHelp, Clock3, ShieldAlert, ShieldX, Zap } from 'lucide-react'
import { PlateBadge } from '@/components/plate-badge'
import type { LprResult } from '@/types/parking'

const statusCopy = {
  AUTORIZADO: 'AUTORIZADO',
  DENEGADO: 'DENEGADO',
  LLENO: 'ESTACIONAMIENTO LLENO',
  SIN_LECTURA: 'SIN LECTURA',
  CLONACION: 'POSIBLE CLONACIÓN DE PLACA',
} as const

export function AccessTicket({ result }: { result: LprResult }) {
  const authorized = result.estado === 'AUTORIZADO'
  const full = result.estado === 'LLENO'
  const tone = authorized ? 'success' : full ? 'warning' : 'danger'
  const Icon = authorized ? Check : full ? AlertTriangle : result.estado === 'CLONACION' ? ShieldAlert : result.estado === 'SIN_LECTURA' ? CircleHelp : ShieldX
  const seconds = result.latenciaMs / 1000
  const fast = result.latenciaMs < 2_500

  return (
    <article aria-live="polite" className={`access-ticket ticket-${tone}`}>
      <div className="ticket-topline">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <PlateBadge plate={result.placa} size="lg" />
          <span className={`state-pill state-${tone}`}>
            <Icon aria-hidden="true" /> {statusCopy[result.estado]}
          </span>
        </div>
        <time className="ticket-time" dateTime={result.hora}>
          <Clock3 aria-hidden="true" />
          {new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(result.hora))}
        </time>
      </div>
      {result.propietario && <p className="ticket-owner">{result.propietario}</p>}
      <div className="ticket-details">
        <div>
          <span className="detail-label">Comando MQTT</span>
          <span className="detail-value"><Zap aria-hidden="true" className={result.mqttOk ? 'text-sky-400' : 'text-slate-500'} /> {result.comando}</span>
        </div>
        <div>
          <span className="detail-label">Resultado</span>
          <span className={`detail-value ${result.mqttOk ? 'text-sky-300' : 'text-slate-400'}`}>
            {result.mqttOk ? 'Publicado' : result.comando === 'SIN_ACCION' ? 'Sin acción' : 'No publicado'}
          </span>
        </div>
        <div>
          <span className="detail-label">Latencia total</span>
          <span className={`detail-value ${fast ? 'text-emerald-300' : 'text-amber-300'}`}>
            <span aria-hidden="true" className={`latency-dot ${fast ? 'latency-fast' : 'latency-slow'}`} />
            {seconds.toFixed(2)} s {!fast && <span className="text-xs">· Meta: &lt; 2.5 s</span>}
          </span>
        </div>
      </div>
      {result.alerta && (
        <p className={`ticket-alert ${tone === 'warning' ? 'ticket-alert-warning' : tone === 'danger' ? 'ticket-alert-danger' : 'ticket-alert-neutral'}`}>
          <AlertTriangle aria-hidden="true" /> {result.alerta}
        </p>
      )}
    </article>
  )
}
