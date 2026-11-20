import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'parkgate_session'
export const SESSION_DURATION_SECONDS = 60 * 60 * 8

export function isDemoMode() {
  return !process.env.GEMINI_API_KEY || !process.env.MONGODB_URI || !process.env.OPERATOR_PIN
}

function signingKey() {
  if (isDemoMode()) return 'park-gate-ai-demo-only-signing-key'
  return [process.env.OPERATOR_PIN, process.env.MONGODB_URI, process.env.GEMINI_API_KEY].join(':')
}

function signature(expiresAt: string) {
  return createHmac('sha256', signingKey()).update(`parkgate:${expiresAt}`).digest('base64url')
}

export function createSessionToken() {
  const expiresAt = String(Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS)
  return `${expiresAt}.${signature(expiresAt)}`
}

export function verifySessionToken(token?: string | null) {
  if (!token) return false
  const [expiresAt, suppliedSignature, extra] = token.split('.')
  if (!expiresAt || !suppliedSignature || extra || !/^\d+$/.test(expiresAt)) return false
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false

  const expected = Buffer.from(signature(expiresAt))
  const supplied = Buffer.from(suppliedSignature)
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

export function isAuthenticatedRequest(request: Request) {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))

  return verifySessionToken(cookie?.slice(SESSION_COOKIE.length + 1))
}

export function isOperatorPinValid(candidate: string) {
  const expected = process.env.OPERATOR_PIN || '1234'
  const left = Buffer.from(expected)
  const right = Buffer.from(candidate)
  return left.length === right.length && timingSafeEqual(left, right)
}
