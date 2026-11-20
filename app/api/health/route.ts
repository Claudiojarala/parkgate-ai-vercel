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
    await (await getParkingDb()).command({ ping: 1 })
    return NextResponse.json({ ok: true, demoMode: false, database: 'connected' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false, demoMode: false, database: 'unavailable', error: 'MongoDB Atlas no disponible. Revisa MONGODB_URI y Network Access.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
