import { NextResponse } from 'next/server'
import { isAuthenticatedRequest, isDemoMode } from '@/lib/auth'
import { controlSchema, describeCommand, toMqttPayload } from '@/lib/commands'
import { publishCommand } from '@/lib/mqtt'
import { registerEvent } from '@/lib/parking-service'
import type { ParkingEventType } from '@/types/parking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function POST(request: Request) {
  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ ok: false, error: 'La sesión expiró. Inicia sesión nuevamente.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Solicitud inválida.' }, { status: 400 })
  }
  const parsed = controlSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Comando no válido.' }, { status: 400 })

  const command = parsed.data
  if (command.tipo === 'LCD' && !command.linea1.trim() && !(command.linea2 ?? '').trim()) {
    return NextResponse.json({ ok: false, error: 'Escribe al menos una línea de texto para el LCD.' }, { status: 400 })
  }

  const demoMode = isDemoMode()
  const payload = toMqttPayload(command)
  let mqttOk = false
  let alerta: string | undefined

  if (demoMode) {
    alerta = 'Modo demostración: comando simulado; no se envió al ESP32.'
  } else {
    // El panel ya deshabilita los botones si el nodo está fuera de línea; aquí se publica directo.
    try {
      await publishCommand(payload)
      mqttOk = true
    } catch {
      alerta = 'No se pudo publicar en el broker MQTT; el comando no fue enviado.'
    }
  }

  let evento: ParkingEventType = 'CONTROL_MANUAL'
  if (command.tipo === 'BARRERA') evento = command.comando.endsWith('ENTRADA') ? 'APERTURA_MANUAL_ENTRADA' : 'APERTURA_MANUAL_SALIDA'

  const event = await registerEvent({
    evento,
    placa: 'MANUAL',
    detalle: `${describeCommand(command)}${mqttOk ? ' · publicado' : ' · no publicado'}${alerta ? ` · ${alerta}` : ''}`,
    origen: 'WEB_ADMIN',
  }, demoMode)

  return NextResponse.json({ ok: true, comando: payload, mqttOk, alerta, event, demoMode }, { headers: { 'Cache-Control': 'no-store' } })
}
