'use client'

import { useState } from 'react'
import { CircleOff, DoorClosed, DoorOpen, Lightbulb, LockKeyhole, MonitorSmartphone, RadioTower, RotateCcw, Send, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LED_IDS, LED_LABELS, sanitizeLcd, type ControlCommand, type LedId } from '@/lib/commands'
import type { BarrierCommand, GateState, ResetScope } from '@/types/parking'

const barriers: { key: 'entrada' | 'salida'; title: string; open: BarrierCommand; close: BarrierCommand }[] = [
  { key: 'entrada', title: 'Barrera de ingreso', open: 'ABRIR_ENTRADA', close: 'CERRAR_ENTRADA' },
  { key: 'salida', title: 'Barrera de salida', open: 'ABRIR_SALIDA', close: 'CERRAR_SALIDA' },
]

const lcdPresets: [string, string][] = [
  ['MANTENIMIENTO', 'VOLVEMOS PRONTO'],
  ['VISITA', 'AUTORIZADA'],
  ['EMERGENCIA', 'DESPEJAR ACCESO'],
]

export function ControlCenter({ entry, exit, online, demoMode, onBarrier, onSend, onReset, busy }: {
  entry: GateState
  exit: GateState
  online: boolean
  demoMode: boolean
  onBarrier: (command: BarrierCommand) => void
  onSend: (command: ControlCommand) => Promise<void>
  onReset: (scope: ResetScope) => void
  busy: boolean
}) {
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const canControl = (online || demoMode) && !busy
  const lcdOk = Boolean(sanitizeLcd(line1) || sanitizeLcd(line2))

  const led = (id: LedId, encendido: boolean) => void onSend({ tipo: 'LED', led: id, encendido })

  return (
    <div className="section-stack">
      <section aria-label="Barreras" className="barrier-grid">
        {barriers.map((barrier) => {
          const state = barrier.key === 'entrada' ? entry : exit
          const opened = state === 'ABIERTA'
          const Icon = opened ? DoorOpen : DoorClosed
          return (
            <article className="barrier-card" key={barrier.key}>
              <div className="barrier-card-heading">
                <span className="barrier-icon"><Icon aria-hidden="true" /></span>
                <div><h3>{barrier.title}</h3><p>Servomotor · ESP32</p></div>
                <span className={`gate-state ${opened ? 'gate-state-open' : 'gate-state-closed'}`}>{state}</span>
              </div>
              <p className="barrier-copy">{online ? 'Nodo en línea · estado actualizado en vivo.' : demoMode ? 'Modo demostración · las acciones no se envían al hardware.' : 'Nodo fuera de línea · comandos deshabilitados por seguridad.'}</p>
              <div className="barrier-actions">
                <Button disabled={!canControl} onClick={() => onBarrier(barrier.open)} type="button"><DoorOpen aria-hidden="true" data-icon="inline-start" />Abrir</Button>
                <Button disabled={!canControl} onClick={() => onBarrier(barrier.close)} type="button" variant="outline"><DoorClosed aria-hidden="true" data-icon="inline-start" />Cerrar</Button>
              </div>
            </article>
          )
        })}
      </section>

      <section aria-labelledby="led-heading" className="barrier-card control-block">
        <div className="barrier-card-heading">
          <span className="barrier-icon"><Lightbulb aria-hidden="true" /></span>
          <div><h3 id="led-heading">Indicadores LED</h3><p>Encender o apagar de forma individual</p></div>
        </div>
        <div className="led-grid">
          {LED_IDS.map((id) => (
            <div className="led-row" key={id}>
              <span className={`led-dot ${id.startsWith('ROJO') ? 'led-red' : 'led-green'}`} aria-hidden="true" />
              <span className="led-name">{LED_LABELS[id]}</span>
              <div className="led-actions">
                <Button aria-label={`Encender ${LED_LABELS[id]}`} disabled={!canControl} onClick={() => led(id, true)} size="sm" type="button">Encender</Button>
                <Button aria-label={`Apagar ${LED_LABELS[id]}`} disabled={!canControl} onClick={() => led(id, false)} size="sm" type="button" variant="outline">Apagar</Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="lcd-heading" className="barrier-card control-block">
        <div className="barrier-card-heading">
          <span className="barrier-icon"><MonitorSmartphone aria-hidden="true" /></span>
          <div><h3 id="lcd-heading">Pantalla LCD 16x2</h3><p>Mensaje de aviso directo, hasta 16 caracteres por línea</p></div>
        </div>
        <div className="lcd-preview" aria-label="Vista previa del LCD">
          <span>{sanitizeLcd(line1).padEnd(16, '\u00a0')}</span>
          <span>{sanitizeLcd(line2).padEnd(16, '\u00a0')}</span>
        </div>
        <div className="lcd-fields">
          <label className="form-field"><span>Línea 1</span><input autoComplete="off" maxLength={16} onChange={(event) => setLine1(event.target.value)} placeholder="MANTENIMIENTO" value={line1} /></label>
          <label className="form-field"><span>Línea 2</span><input autoComplete="off" maxLength={16} onChange={(event) => setLine2(event.target.value)} placeholder="VOLVEMOS PRONTO" value={line2} /></label>
        </div>
        <p className="lcd-hint">La pantalla no muestra tildes: se enviarán en mayúsculas y sin acentos.</p>
        <div className="lcd-actions">
          <Button disabled={!canControl || !lcdOk} onClick={() => void onSend({ tipo: 'LCD', linea1: line1, linea2: line2 })} type="button"><Send aria-hidden="true" data-icon="inline-start" />Enviar al LCD</Button>
          <Button disabled={!canControl} onClick={() => void onSend({ tipo: 'LCD_NORMAL' })} type="button" variant="outline"><RotateCcw aria-hidden="true" data-icon="inline-start" />Restaurar mensaje normal</Button>
        </div>
        <div className="lcd-presets" aria-label="Mensajes frecuentes">
          {lcdPresets.map(([a, b]) => (
            <button className="preset-chip" disabled={!canControl} key={a} onClick={() => void onSend({ tipo: 'LCD', linea1: a, linea2: b })} type="button">{a} / {b}</button>
          ))}
        </div>
      </section>

      <section aria-labelledby="reset-heading" className="barrier-card control-block">
        <div className="barrier-card-heading">
          <span className="barrier-icon"><TriangleAlert aria-hidden="true" /></span>
          <div><h3 id="reset-heading">Reinicios de estado</h3><p>Limpian la nube; el reinicio completo también reinicia el ESP32</p></div>
        </div>
        <div className="reset-actions">
          <Button disabled={busy} onClick={() => onReset('alertas')} type="button" variant="outline"><CircleOff aria-hidden="true" data-icon="inline-start" />Resolver alertas</Button>
          <Button disabled={busy} onClick={() => onReset('ocupacion')} type="button" variant="outline"><RotateCcw aria-hidden="true" data-icon="inline-start" />Liberar ocupación</Button>
          <Button disabled={busy || !(online || demoMode)} onClick={() => onReset('sistema')} type="button" variant="outline"><RotateCcw aria-hidden="true" data-icon="inline-start" />Reiniciar sistema</Button>
        </div>
      </section>

      <p className="barrier-safety"><LockKeyhole aria-hidden="true" /><span><strong>Control protegido.</strong> Las barreras y los reinicios piden confirmación y todo queda auditado; solo el servidor publica en <code>usil/iot/parking/p01/cmd</code>.</span><RadioTower aria-hidden="true" className="safety-radio" /></p>
    </div>
  )
}
