import { NextResponse } from 'next/server'
import { isAuthenticatedRequest, isDemoMode } from '@/lib/auth'
import { listEvents } from '@/lib/parking-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ ok: false, error: 'La sesión expiró. Inicia sesión nuevamente.' }, { status: 401 })
  }
  try {
    const events = await listEvents(isDemoMode())
    return NextResponse.json({ ok: true, demoMode: isDemoMode(), events }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[api/events] fallo al consultar eventos_parking:', error)
    // TEMPORAL (diagnostico): muestra la causa real en el aviso. Quitar cuando quede resuelto.
    const detalle = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : 'error desconocido'
    return NextResponse.json({ ok: false, error: `No se pudo consultar eventos_parking en MongoDB Atlas. (${detalle})` }, { status: 503 })
  }
}
