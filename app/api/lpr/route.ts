import { NextResponse } from 'next/server'
import { isAuthenticatedRequest, isDemoMode } from '@/lib/auth'
import { readPlate, validateImage } from '@/lib/lpr'
import { publishCommand, readAvailableSpots } from '@/lib/mqtt'
import { evaluarAcceso, findVehicle, registerEvent, setVehicleInside } from '@/lib/parking-service'
import type { LprResult, Vehicle } from '@/types/parking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const roundLatency = (startedAt: number) => Math.max(0, Math.round(performance.now() - startedAt))

export async function POST(request: Request) {
  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ ok: false, error: 'La sesión expiró. Inicia sesión nuevamente.' }, { status: 401 })
  }

  const startedAt = performance.now()
  const demoMode = isDemoMode()
  const formData = await request.formData().catch(() => null)
  const checked = validateImage(formData?.get('image'))
  if ('error' in checked) return NextResponse.json({ ok: false, error: checked.error }, { status: checked.status })

  let plate: string | null = null
  let recognitionAlert: string | undefined
  let vehicle: Vehicle | null = null

  try {
    if (demoMode) {
      recognitionAlert = 'Modo demostración: Gemini no está configurado; no se realizó una lectura real ni se enviaron comandos.'
    } else {
      try {
        plate = await readPlate(checked.image)
      } catch (error) {
        console.error('[lpr] Lectura falló:', error)
        const detail = error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 220) : ''
        recognitionAlert = `El lector de placas no pudo analizar la foto. Intenta otra toma o revisa el servicio de reconocimiento.${detail ? ` Detalle: ${detail}` : ''}`
      }
    }

    // Una placa revocada se trata como no registrada.
    if (plate) {
      const found = await findVehicle(plate, demoMode)
      vehicle = found?.activo ? found : null
    }
    const libres = demoMode ? 5 : await readAvailableSpots(1_500)

    const decision = evaluarAcceso(plate, vehicle, libres)
    let mqttOk = false
    let alerta = recognitionAlert ?? decision.alerta

    if (decision.comando !== 'SIN_ACCION' && !demoMode) {
      try {
        await publishCommand(decision.comando)
        mqttOk = true
      } catch {
        alerta = 'Falló la publicación MQTT. Revisa el broker HiveMQ y vuelve a intentarlo.'
      }
    }

    // Caso A: solo se marca "dentro" si la orden de apertura salió bien (o en demo).
    if (decision.estado === 'AUTORIZADO' && plate && (mqttOk || demoMode)) {
      await setVehicleInside(plate, true, demoMode)
    }

    const result: LprResult = {
      estado: decision.estado,
      placa: plate ?? 'SIN_LECTURA',
      ...(vehicle ? { propietario: vehicle.propietario } : {}),
      comando: decision.comando,
      mqttOk,
      ...(alerta ? { alerta } : {}),
      latenciaMs: 0,
      hora: new Date().toISOString(),
    }

    await registerEvent({
      evento: decision.evento,
      placa: result.placa,
      detalle: [decision.estado, alerta, decision.comando, mqttOk ? 'MQTT publicado' : decision.comando === 'SIN_ACCION' ? 'sin acción' : 'publicación fallida'].filter(Boolean).join(' · '),
      origen: 'WEB_LPR',
      ...(decision.esAlerta ? { alerta: true, resuelta: false } : {}),
    }, demoMode)

    return NextResponse.json({ ...result, latenciaMs: roundLatency(startedAt), hora: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false, error: 'No se pudo completar la validación. Revisa MongoDB Atlas y la conexión de red.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
