import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAuthenticatedRequest, isDemoMode } from '@/lib/auth'
import { listPlazas, syncPlaza } from '@/lib/parking-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const syncSchema = z.object({ espacio: z.union([z.literal(1), z.literal(2)]), ocupada: z.boolean() })
const unauthorized = () => NextResponse.json({ ok: false, error: 'La sesión expiró. Inicia sesión nuevamente.' }, { status: 401 })

export async function GET(request: Request) {
  if (!isAuthenticatedRequest(request)) return unauthorized()
  try {
    return NextResponse.json({ ok: true, demoMode: isDemoMode(), plazas: await listPlazas(isDemoMode()) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false, error: 'No se pudo consultar plazas_estado en MongoDB Atlas.' }, { status: 503 })
  }
}

/** El panel web escucha los sensores por MQTT y guarda aquí los cambios de ocupación. */
export async function POST(request: Request) {
  if (!isAuthenticatedRequest(request)) return unauthorized()
  const parsed = syncSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Datos de plaza no válidos.' }, { status: 400 })
  try {
    const result = await syncPlaza(parsed.data.espacio, parsed.data.ocupada, isDemoMode())
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false, error: 'No se pudo guardar la ocupación de la plaza.' }, { status: 503 })
  }
}
