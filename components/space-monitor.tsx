'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Camera, CircleCheck, CircleHelp, LoaderCircle, ShieldAlert, TriangleAlert, UserRound } from 'lucide-react'
import { PlateBadge } from '@/components/plate-badge'
import { Button } from '@/components/ui/button'
import { compressPhoto } from '@/lib/image'
import type { AuditScanResult, Plaza, SpaceId, SpaceSensor, SpaceValidation, Vehicle } from '@/types/parking'

const validationCopy: Record<SpaceValidation, string> = {
  SIN_VALIDAR: 'Sin validar',
  CORRECTA: 'Plaza correcta',
  INDEBIDA: 'Ocupación indebida',
}

const resultCopy = {
  CORRECTA: { tone: 'success', title: 'Estacionamiento correcto', Icon: CircleCheck },
  INDEBIDA: { tone: 'danger', title: 'Invasión de espacio reservado', Icon: ShieldAlert },
  NO_REGISTRADA: { tone: 'danger', title: 'Placa no registrada en plaza', Icon: ShieldAlert },
  SIN_LECTURA: { tone: 'warning', title: 'Sin lectura de placa', Icon: CircleHelp },
} as const

export function SpaceMonitor({ plazas, vehicles, sensors, demoMode, busy, result, error, onScan, onError, onSimulate }: {
  plazas: Plaza[]
  vehicles: Vehicle[]
  sensors: Record<SpaceId, SpaceSensor>
  demoMode: boolean
  busy: SpaceId | null
  result: AuditScanResult | null
  error: string | null
  onScan: (space: SpaceId, image: Blob) => Promise<void>
  onError: (message: string) => void
  onSimulate: (space: SpaceId, occupied: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const targetRef = useRef<SpaceId>(1)
  const [preparing, setPreparing] = useState(false)

  function pick(space: SpaceId) {
    targetRef.current = space
    inputRef.current?.click()
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const space = targetRef.current
    if (!file) return
    setPreparing(true)
    try {
      await onScan(space, await compressPhoto(file))
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'No se pudo procesar la imagen.')
    } finally {
      setPreparing(false)
      event.target.value = ''
    }
  }

  return (
    <div className="section-stack">
      <div className="space-grid">
        {([1, 2] as SpaceId[]).map((space) => {
          const plaza = plazas.find((item) => item.espacio === space)
          const sensor = sensors[space]
          const occupied = sensor === 'SIN_DATO' ? Boolean(plaza?.ocupada) : sensor === 'OCUPADO'
          const titular = vehicles.find((vehicle) => vehicle.activo && vehicle.espacio_asignado === space)
          const validation = plaza?.validacion ?? 'SIN_VALIDAR'
          const isBusy = busy === space || (preparing && targetRef.current === space)
          return (
            <article className={`space-card ${validation === 'INDEBIDA' ? 'space-card-alert' : ''}`} key={space}>
              <div className="space-card-top">
                <div>
                  <p className="eyebrow">PLAZA {space}</p>
                  <h3>Espacio {space}</h3>
                </div>
                <span className={`space-led ${occupied ? 'space-led-off' : 'space-led-on'}`} role="img" aria-label={occupied ? 'LED verde apagado: ocupada' : 'LED verde encendido: libre'} />
              </div>
              <div className="space-state-row">
                <span className={`state-pill ${occupied ? 'state-warning' : 'state-success'}`}>{occupied ? 'Ocupada' : 'Libre'}</span>
                <span className={`state-pill ${validation === 'CORRECTA' ? 'state-success' : validation === 'INDEBIDA' ? 'state-danger' : 'state-neutral'}`}>{validationCopy[validation]}</span>
              </div>
              <div className="space-owner">
                <UserRound aria-hidden="true" />
                <div>
                  <span>Titular asignado</span>
                  {titular ? <><strong>{titular.propietario}</strong><PlateBadge plate={titular.placa} size="sm" /></> : <strong>Sin titular asignado</strong>}
                </div>
              </div>
              {plaza?.placa && <p className="space-detected">Placa detectada: <b>{plaza.placa}</b></p>}
              <p className="space-source">{sensor === 'SIN_DATO' ? 'Estado guardado en la nube' : 'Sensor ultrasónico en vivo'}</p>
              <div className="space-actions">
                <Button disabled={isBusy} onClick={() => pick(space)} type="button">
                  {isBusy ? <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <Camera aria-hidden="true" data-icon="inline-start" />}
                  {isBusy ? 'Validando…' : 'Validar con cámara'}
                </Button>
                {demoMode && <Button onClick={() => onSimulate(space, !occupied)} type="button" variant="outline">{occupied ? 'Simular salida' : 'Simular llegada'}</Button>}
              </div>
            </article>
          )
        })}
      </div>
      <input accept="image/*" capture="environment" className="sr-only" onChange={handleFile} ref={inputRef} type="file" />
      <p aria-live="polite" className="scanner-status" role="status">
        {busy || preparing ? <><LoaderCircle aria-hidden="true" className="animate-spin" /> Procesando matrícula con Gemini 2.5 Flash y validando la plaza asignada...</> : 'Escanea el vehículo estacionado para confirmar que ocupa su plaza.'}
      </p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {result && <AuditTicket result={result} />}
    </div>
  )
}

function AuditTicket({ result }: { result: AuditScanResult }) {
  const { tone, title, Icon } = resultCopy[result.estado]
  return (
    <article aria-live="polite" className={`access-ticket ticket-${tone}`}>
      <div className="ticket-topline">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {result.placa !== 'SIN_LECTURA' && <PlateBadge plate={result.placa} size="lg" />}
          <span className={`state-pill state-${tone}`}><Icon aria-hidden="true" /> {title.toUpperCase()}</span>
        </div>
        <span className="ticket-time">Espacio {result.espacio} · {(result.latenciaMs / 1000).toFixed(2)} s</span>
      </div>
      {result.propietario && <p className="ticket-owner">{result.propietario}</p>}
      {result.alerta && <p className={`ticket-alert ${tone === 'danger' ? 'ticket-alert-danger' : 'ticket-alert-neutral'}`}><TriangleAlert aria-hidden="true" /> {result.alerta}</p>}
      {result.estado === 'CORRECTA' && <p className="ticket-alert ticket-alert-neutral"><CircleCheck aria-hidden="true" /> La placa coincide con el titular del Espacio {result.espacio}. Estacionamiento confirmado.</p>}
    </article>
  )
}
