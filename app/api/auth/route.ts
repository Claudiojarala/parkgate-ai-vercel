import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSessionToken, isAuthenticatedRequest, isDemoMode, isOperatorPinValid, SESSION_COOKIE, SESSION_DURATION_SECONDS } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const loginSchema = z.object({ pin: z.string().min(1).max(32) })

export async function GET(request: Request) {
  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Sesión no válida.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({ ok: true, demoMode: isDemoMode() }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Solicitud inválida.' }, { status: 400 })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success || !isOperatorPinValid(parsed.data.pin)) {
    return NextResponse.json({ ok: false, error: 'PIN incorrecto. Verifica la clave e inténtalo nuevamente.' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true, demoMode: isDemoMode() })
  response.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  })
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function DELETE(request: Request) {
  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Sesión no válida.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
