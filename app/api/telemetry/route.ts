import { NextResponse } from 'next/server'
import { isAuthenticatedRequest, isDemoMode } from '@/lib/auth'
import { readTelemetry } from '@/lib/mqtt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 5

export async function GET(request: Request) {
  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ ok: false, error: 'La sesión expiró. Inicia sesión nuevamente.' }, { status: 401 })
  }
  if (isDemoMode()) {
    return NextResponse.json({ ok: true, demoMode: true, telemetry: null }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const telemetry = await readTelemetry(1_500)
  return NextResponse.json({ ok: true, telemetry }, { headers: { 'Cache-Control': 'no-store' } })
}
