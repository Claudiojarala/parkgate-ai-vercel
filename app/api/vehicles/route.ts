import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAuthenticatedRequest, isDemoMode } from '@/lib/auth'
import { normalizePlate } from '@/lib/plate'
import { addVehicle, assignSpace, listVehicles, registerEvent, revokeVehicle, setVehicleInside } from '@/lib/parking-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const spaceSchema = z.union([z.literal(1), z.literal(2)]).nullable()
const createSchema = z.object({ placa: z.string().trim().min(1).max(16), propietario: z.string().trim().min(2).max(100), espacio_asignado: spaceSchema.optional() })
const patchSchema = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('REVOCAR'), placa: z.string().trim().min(1).max(16) }),
  z.object({ accion: z.literal('MARCAR_SALIDA'), placa: z.string().trim().min(1).max(16) }),
  z.object({ accion: z.literal('ASIGNAR_ESPACIO'), placa: z.string().trim().min(1).max(16), espacio_asignado: spaceSchema }),
])
const SPACE_TAKEN = 'Ese espacio ya está asignado a otro vehículo activo. Cada espacio pertenece a un solo titular.'

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'La sesión expiró. Inicia sesión nuevamente.' }, { status: 401 })
}

export async function GET(request: Request) {
  if (!isAuthenticatedRequest(request)) return unauthorized()
  const demoMode = isDemoMode()
  try {
    const vehicles = await listVehicles(demoMode)
    return NextResponse.json({ ok: true, demoMode, vehicles }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false, error: 'MongoDB Atlas no está disponible. Revisa MONGODB_URI y Network Access.' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  if (!isAuthenticatedRequest(request)) return unauthorized()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Solicitud inválida.' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  const placa = parsed.success ? normalizePlate(parsed.data.placa) : null
  if (!parsed.success || !placa) {
    return NextResponse.json({ ok: false, error: 'Ingresa una placa de seis caracteres alfanuméricos y el nombre del propietario.' }, { status: 400 })
  }

  try {
    const vehicle = await addVehicle(placa, parsed.data.propietario, parsed.data.espacio_asignado ?? null, isDemoMode())
    return NextResponse.json({ ok: true, vehicle, demoMode: isDemoMode() }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof Error && error.message === 'PLATE_EXISTS') {
      return NextResponse.json({ ok: false, error: 'Esa placa ya existe en el padrón. Revisa su estado antes de volver a registrarla.' }, { status: 409 })
    }
    if (error instanceof Error && error.message === 'SPACE_TAKEN') {
      return NextResponse.json({ ok: false, error: SPACE_TAKEN }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: 'No se pudo guardar la placa en MongoDB Atlas.' }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  if (!isAuthenticatedRequest(request)) return unauthorized()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Solicitud inválida.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  const placa = parsed.success ? normalizePlate(parsed.data.placa) : null
  if (!parsed.success || !placa) return NextResponse.json({ ok: false, error: 'Solicitud o placa no válida.' }, { status: 400 })

  const demoMode = isDemoMode()
  try {
    const data = parsed.data
    const vehicle = data.accion === 'REVOCAR'
      ? await revokeVehicle(placa, demoMode)
      : data.accion === 'MARCAR_SALIDA'
        ? await setVehicleInside(placa, false, demoMode)
        : await assignSpace(placa, data.espacio_asignado, demoMode)
    if (!vehicle) return NextResponse.json({ ok: false, error: 'No se encontró esa placa.' }, { status: 404 })
    if (data.accion === 'MARCAR_SALIDA') {
      await registerEvent({ evento: 'SALIDA_VEHICULO', placa, detalle: 'Salida marcada manualmente por el administrador', origen: 'WEB_ADMIN' }, demoMode)
    }
    return NextResponse.json({ ok: true, vehicle }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof Error && error.message === 'SPACE_TAKEN') return NextResponse.json({ ok: false, error: SPACE_TAKEN }, { status: 409 })
    return NextResponse.json({ ok: false, error: 'No se pudo actualizar el vehículo en MongoDB Atlas.' }, { status: 503 })
  }
}
