import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/login-form'
import { isDemoMode, SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

export default async function LoginPage() {
  const cookieStore = await cookies()
  if (verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)) redirect('/')
  const demoMode = isDemoMode()

  return (
    <main className="login-shell">
      <section aria-labelledby="login-title" className="login-card">
        <div aria-hidden="true" className="brand-mark login-mark"><span /></div>
        <p className="eyebrow login-eyebrow">USIL · LA MOLINA</p>
        <h1 id="login-title">ParkGate AI</h1>
        <p className="login-copy">Control de acceso vehicular<br />Smart Parking · Centro de control</p>
        {demoMode && <div className="demo-banner login-demo" role="status">Modo demostración · acceso simulado</div>}
        <LoginForm demoMode={demoMode} />
        <p className="login-security">Sesión privada con cookie segura · 8 horas</p>
      </section>
    </main>
  )
}
