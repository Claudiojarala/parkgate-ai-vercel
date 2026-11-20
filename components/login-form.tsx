'use client'

import { useState, type FormEvent } from 'react'
import { ArrowRight, LoaderCircle, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function LoginForm({ demoMode }: { demoMode: boolean }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error ?? 'No se pudo iniciar sesión.')
      window.location.replace('/')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo iniciar sesión. Intenta nuevamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="operator-pin">PIN de operador</label>
      <div className="pin-field"><LockKeyhole aria-hidden="true" /><input autoComplete="current-password" autoFocus id="operator-pin" inputMode="numeric" maxLength={32} onChange={(event) => setPin(event.target.value)} placeholder="Ingresa tu PIN" required type="password" value={pin} /></div>
      {demoMode && <p className="demo-pin-hint">PIN de demostración: <code>1234</code></p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <Button className="login-submit" disabled={busy || !pin} type="submit">{busy ? <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <ArrowRight aria-hidden="true" data-icon="inline-start" />}Ingresar al sistema</Button>
    </form>
  )
}
