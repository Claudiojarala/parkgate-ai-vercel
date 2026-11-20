import { NextResponse } from 'next/server'
import { isAuthenticatedRequest, isDemoMode } from '@/lib/auth'
import { readPlate, validateImage } from '@/lib/lpr'
import { evaluarPlaza, findVehicle, findVehicleBySpace, registerEvent, setPlazaValidation } from '@/lib/parking-service'
import type { AuditScanResult, SpaceId, Vehicle } from '@/types/parking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: Request) {
  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ ok: false, error: 'La sesión expiró. Inicia sesión nuevamente.' }, { status: 401 })
  }

  const startedAt = performance.now()
  const demoMode = isDemoMode()
  const formData = await request.formData().catch(() => null)
  const espacioRaw = Number(formData?.get('espacio'))
  if (espacioRaw !== 1 && espacioRaw !== 2) {
    return NextResponse.json({ ok: false, error: 'Indica si el vehículo está en el Espacio 1 o en el Espacio 2.' }, { status: 400 })
  }
  const espacio = espacioRaw as SpaceId
  const checked = validateImage(formData?.get('image'))
  if ('error' in checked) return NextResponse.json({ ok: false, error: checked.error }, { status: checked.status })

  let plate: string | null = null
  let readAlert: string | undefined
  try {
    if (demoMode) {
      readAlert = 'Modo demostración: Gemini no está configurado; la lectura no es real.'
    } else {
      try {
        plate = await readPlate(checked.image)
      } catch {
        readAlert = 'Gemini no pudo analizar la foto. Revisa GEMINI_API_KEY o intenta otra toma.'
      }
    }

    let vehicle: Vehicle | null = null
    if (plate) {
      const found = await findVehicle(plate, demoMode)
      vehicle = found?.activo ? found : null
    }
    const titular = await findVehicleBySpace(espacio, demoMode)
    const verdict = evaluarPlaza(espacio, plate, vehicle, titular)
    const alerta = readAlert ?? verdict.alerta
    const esAlerta = verdict.estado === 'INDEBIDA' || verdict.estado === 'NO_REGISTRADA'

    if (verdict.estado === 'CORRECTA' || esAlerta) {
      await setPlazaValidation(espacio, verdict.estado === 'CORRECTA' ? 'CORRECTA' : 'INDEBIDA', plate, demoMode)
    }
    await registerEvent({
      evento: verdict.estado === 'CORRECTA' ? 'ESTACIONAMIENTO_CORRECTO' : esAlerta ? 'ALERTA_OCUPACION_INDEBIDA' : 'ACCESO_DENEGADO',
      placa: plate ?? 'SIN_LECTURA',
      detalle: verdict.estado === 'CORRECTA'
        ? `Estacionamiento correcto en Espacio ${espacio}`
        : [`Auditoría Espacio ${espacio}`, verdict.estado, alerta].filter(Boolean).join(' · '),
      origen: 'WEB_AUDITORIA',
      ...(esAlerta ? { alerta: true, resuelta: false } : {}),
    }, demoMode)

    const result: AuditScanResult = {
      estado: verdict.estado,
      espacio,
      placa: plate ?? 'SIN_LECTURA',
      ...(vehicle ? { propietario: vehicle.propietario, espacioAsignado: vehicle.espacio_asignado } : {}),
      ...(titular ? { titularDelEspacio: titular.propietario } : {}),
      ...(alerta ? { alerta } : {}),
      latenciaMs: Math.max(0, Math.round(performance.now() - startedAt)),
      hora: new Date().toISOString(),
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false, error: 'No se pudo completar la auditoría. Revisa MongoDB Atlas y la conexión de red.' }, { status: 503 })
  }
}
