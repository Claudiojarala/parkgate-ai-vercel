import { NextResponse } from 'next/server'
import { isAuthenticatedRequest, isDemoMode } from '@/lib/auth'
import { getParkingDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ ok: false, error: 'La sesión expiró. Inicia sesión nuevamente.' }, { status: 401 })
  }
  if (isDemoMode()) {
    return NextResponse.json({ ok: true, demoMode: true, database: 'simulated' }, { headers: { 'Cache-Control': 'no-store' } })
  }
  try {
    const db = await getParkingDb()
    await db.command({ ping: 1 })
    // ping no comprueba permisos: leer de verdad una coleccion de cada tipo
    await db.collection('placas_autorizadas').findOne({}, { projection: { _id: 1 } })
    await db.collection('eventos_parking').findOne({}, { projection: { _id: 1 } })
    return NextResponse.json({ ok: true, demoMode: false, database: 'connected' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[api/health] MongoDB no disponible:', error)
    return NextResponse.json({ ok: false, demoMode: false, database: 'unavailable', error: 'MongoDB Atlas no disponible. Revisa MONGODB_URI y Network Access.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
