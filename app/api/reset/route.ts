import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAuthenticatedRequest, isDemoMode } from '@/lib/auth'
import { CMD_RESET } from '@/lib/commands'
import { publishCommand } from '@/lib/mqtt'
import { registerEvent, resetState } from '@/lib/parking-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const schema = z.object({ alcance: z.enum(['alertas', 'ocupacion', 'sistema']) })
const labels = { alertas: 'Alertas resueltas', ocupacion: 'Estados de ocupación reiniciados', sistema: 'Reinicio completo del sistema' } as const

export async function POST(request: Request) {
  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ ok: false, error: 'La sesión expiró. Inicia sesión nuevamente.' }, { status: 401 })
  }
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Alcance de reinicio no válido.' }, { status: 400 })

  const demoMode = isDemoMode()
  const { alcance } = parsed.data
  let mqttOk = false
  let alerta: string | undefined

  try {
    await resetState(alcance, demoMode)
  } catch {
    return NextResponse.json({ ok: false, error: 'No se pudo reiniciar el estado en MongoDB Atlas.' }, { status: 503 })
  }

  if (alcance === 'sistema') {
    if (demoMode) alerta = 'Modo demostración: el RESET no se envió al ESP32.'
    else {
      try {
        await publishCommand(CMD_RESET)
        mqttOk = true
      } catch {
        alerta = 'La nube se reinició, pero no se pudo enviar RESET al ESP32.'
      }
    }
  }

  await registerEvent({ evento: 'RESET_SISTEMA', placa: 'MANUAL', detalle: `${labels[alcance]}${mqttOk ? ' · RESET publicado' : ''}${alerta ? ` · ${alerta}` : ''}`, origen: 'WEB_ADMIN' }, demoMode)
  return NextResponse.json({ ok: true, alcance, mqttOk, alerta, demoMode }, { headers: { 'Cache-Control': 'no-store' } })
}
