'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { Activity, AlertTriangle, ArrowRight, Camera, ClipboardList, Database, DoorOpen, LogOut, RefreshCw, Search, ShieldCheck, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { AccessTicket } from '@/components/access-ticket'
import { AuditLog } from '@/components/audit-log'
import { AlertStrip } from '@/components/alert-strip'
import { ControlCenter } from '@/components/control-center'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Footer } from '@/components/footer'
import { KpiStrip } from '@/components/kpi-strip'
import { LprScanner } from '@/components/lpr-scanner'
import { NavBar } from '@/components/nav-bar'
import { SpaceMonitor } from '@/components/space-monitor'
import { PlateBadge } from '@/components/plate-badge'
import { AuthorizedVehicleList, VehicleCarousel } from '@/components/vehicle-cards'
import { VehicleForm } from '@/components/vehicle-form'
import { Button } from '@/components/ui/button'
import { initialVehicles } from '@/data/vehicles'
import { useTelemetry } from '@/hooks/use-telemetry'
import { normalizePlate } from '@/lib/plate'
import { describeCommand, type ControlCommand } from '@/lib/commands'
import type { AuditFilter, AuditScanResult, AuditTypeFilter, BarrierCommand, DashboardTab, LprResult, ParkingEvent, Plaza, ResetScope, SpaceId, SpaceSensor, Vehicle } from '@/types/parking'

interface ApiResponse<T> {
  ok: boolean
  error?: string
  demoMode?: boolean
  vehicles?: Vehicle[]
  plazas?: Plaza[]
  events?: ParkingEvent[]
  database?: string
  mqttOk?: boolean
  comando?: string
  alerta?: string
  event?: ParkingEvent
}

type PendingConfirmation =
  | { kind: 'barrier'; command: BarrierCommand }
  | { kind: 'revoke'; vehicle: Vehicle }
  | { kind: 'reset'; scope: ResetScope }
  | null

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json()
  if (response.status === 401) {
    window.location.assign('/login')
    throw new Error('La sesión expiró. Inicia sesión nuevamente.')
  }
  if (!response.ok || payload.ok === false) throw new Error(payload.error ?? 'No se pudo cargar la información.')
  return payload as T
}

async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  const payload = await response.json()
  if (response.status === 401) {
    window.location.assign('/login')
    throw new Error('La sesión expiró. Inicia sesión nuevamente.')
  }
  if (!response.ok || payload.ok === false) throw new Error(payload.error ?? 'No se pudo completar la operación.')
  return payload as T
}

function limaDayKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function eventTime(value: string) {
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

const resetCopy: Record<ResetScope, { title: string; description: string }> = {
  alertas: { title: 'Resolver alertas', description: 'Se marcarán como resueltas las alertas de seguridad activas y las plazas con ocupación indebida volverán a "sin validar". El historial se conserva.' },
  ocupacion: { title: 'Liberar ocupación', description: 'Todos los vehículos pasarán a "fuera" y las plazas quedarán libres en la nube. No cambia el contador del ESP32.' },
  sistema: { title: 'Reiniciar sistema', description: 'Resuelve alertas, libera la ocupación y envía RESET al ESP32 para restablecer contador, LCD y barreras al estado base.' },
}

export function ParkingDashboard({ initialDemoMode }: { initialDemoMode: boolean }) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('scanner')
  const [query, setQuery] = useState('')
  const [registryQuery, setRegistryQuery] = useState('')
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('all')
  const [auditTypeFilter, setAuditTypeFilter] = useState<AuditTypeFilter>('all')
  const [latestResult, setLatestResult] = useState<LprResult | null>(null)
  const [scannerError, setScannerError] = useState<string | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [savingVehicle, setSavingVehicle] = useState(false)
  const [auditResult, setAuditResult] = useState<AuditScanResult | null>(null)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditBusy, setAuditBusy] = useState<SpaceId | null>(null)
  const [controlBusy, setControlBusy] = useState(false)
  const lastSynced = useRef<Record<number, string>>({})
  const { telemetry, reconnect } = useTelemetry()

  const health = useSWR<ApiResponse<never>>('/api/health', fetcher, { refreshInterval: 30_000, revalidateOnFocus: true })
  const vehicleData = useSWR<ApiResponse<Vehicle[]>>('/api/vehicles', fetcher, { refreshInterval: 60_000 })
  const eventData = useSWR<ApiResponse<ParkingEvent[]>>('/api/events', fetcher, { refreshInterval: 15_000 })
  const plazaData = useSWR<ApiResponse<Plaza[]>>('/api/spaces', fetcher, { refreshInterval: 10_000 })
  const demoMode = health.data?.demoMode ?? vehicleData.data?.demoMode ?? initialDemoMode
  const vehicles = vehicleData.data?.vehicles ?? (demoMode ? initialVehicles : [])
  const events = eventData.data?.events ?? []
  const plazas = plazaData.data?.plazas ?? []
  const activeAlerts = events.filter((event) => event.alerta && !event.resuelta)

  const normalizedQuery = (normalizePlate(query) ?? query).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const lookupMatches = query.trim()
    ? vehicles.filter((vehicle) => vehicle.placa.replace('-', '').includes(normalizedQuery) || vehicle.propietario.toLocaleLowerCase('es-PE').includes(query.trim().toLocaleLowerCase('es-PE')))
    : []
  const todayCount = events.filter((event) => limaDayKey(new Date(event.fecha_utc)) === limaDayKey(new Date())).length
  const deniedCount = events.filter((event) => event.evento === 'ACCESO_DENEGADO' || event.evento === 'ACCESO_DENEGADO_LLENO').length
  const online = telemetry.online
  const dataLoading = health.isLoading || vehicleData.isLoading || eventData.isLoading
  const gateEntry = telemetry.fresh ? telemetry.barrera_entrada : 'SIN_DATO'
  const gateExit = telemetry.fresh ? telemetry.barrera_salida : 'SIN_DATO'
  const gateTelemetry = { ...telemetry, barrera_entrada: gateEntry, barrera_salida: gateExit }
  const sensors: Record<SpaceId, SpaceSensor> = { 1: telemetry.fresh ? telemetry.espacio1 : 'SIN_DATO', 2: telemetry.fresh ? telemetry.espacio2 : 'SIN_DATO' }

  // Los sensores ultrasónicos llegan por MQTT al navegador; aquí se guardan en la nube cuando cambian.
  useEffect(() => {
    if (demoMode || !telemetry.fresh) return
    for (const space of [1, 2] as SpaceId[]) {
      const sensor = space === 1 ? telemetry.espacio1 : telemetry.espacio2
      if (sensor === 'SIN_DATO') continue
      const key = `${space}:${sensor}`
      if (lastSynced.current[space] === key) continue
      lastSynced.current[space] = key
      sendJson('/api/spaces', 'POST', { espacio: space, ocupada: sensor === 'OCUPADO' })
        .then(() => Promise.all([plazaData.mutate(), eventData.mutate(), vehicleData.mutate()]))
        .catch(() => { lastSynced.current[space] = '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, telemetry.fresh, telemetry.espacio1, telemetry.espacio2])

  async function refreshDashboard() {
    setRefreshing(true)
    reconnect()
    const results = await Promise.allSettled([health.mutate(), vehicleData.mutate(), eventData.mutate(), plazaData.mutate()])
    setRefreshing(false)
    if (results.some((result) => result.status === 'rejected')) toast.error('No se pudieron actualizar todos los datos. Revisa la conexión.')
    else toast.success('Sincronización solicitada.')
  }

  async function scanImage(image: Blob) {
    setScanBusy(true)
    setScannerError(null)
    setLatestResult(null)
    try {
      const formData = new FormData()
      formData.append('image', image, 'placa.jpg')
      const response = await fetch('/api/lpr', { method: 'POST', body: formData, cache: 'no-store' })
      const payload = await response.json()
      if (response.status === 401) {
        window.location.assign('/login')
        throw new Error('La sesión expiró. Inicia sesión nuevamente.')
      }
      if (!response.ok || payload.ok === false) throw new Error(payload.error ?? 'No se pudo analizar la placa.')
      const result = payload as LprResult
      setLatestResult(result)
      await eventData.mutate()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo procesar la foto.'
      setScannerError(message)
      toast.error(message)
    } finally {
      setScanBusy(false)
    }
  }

  async function scanSpace(space: SpaceId, image: Blob) {
    setAuditBusy(space)
    setAuditError(null)
    setAuditResult(null)
    try {
      const formData = new FormData()
      formData.append('image', image, 'plaza.jpg')
      formData.append('espacio', String(space))
      const response = await fetch('/api/audit-scan', { method: 'POST', body: formData, cache: 'no-store' })
      const payload = await response.json()
      if (response.status === 401) {
        window.location.assign('/login')
        throw new Error('La sesión expiró. Inicia sesión nuevamente.')
      }
      if (!response.ok || payload.ok === false) throw new Error(payload.error ?? 'No se pudo auditar la plaza.')
      setAuditResult(payload as AuditScanResult)
      await Promise.all([plazaData.mutate(), eventData.mutate()])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo procesar la foto.'
      setAuditError(message)
      toast.error(message)
    } finally {
      setAuditBusy(null)
    }
  }

  async function simulateSpace(space: SpaceId, occupied: boolean) {
    try {
      await sendJson('/api/spaces', 'POST', { espacio: space, ocupada: occupied })
      await Promise.all([plazaData.mutate(), vehicleData.mutate(), eventData.mutate()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo simular la plaza.')
    }
  }

  async function sendControl(command: ControlCommand) {
    setControlBusy(true)
    try {
      const response = await sendJson<ApiResponse<never>>('/api/control', 'POST', command)
      if (response.mqttOk) toast.success(`Enviado: ${describeCommand(command)}`)
      else toast.warning(response.alerta ?? 'Comando no publicado. Revisa el estado del nodo.')
      await eventData.mutate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar el comando.')
    } finally {
      setControlBusy(false)
    }
  }

  async function patchVehicle(body: Record<string, unknown>, success: string) {
    try {
      await sendJson('/api/vehicles', 'PATCH', body)
      await Promise.all([vehicleData.mutate(), plazaData.mutate(), eventData.mutate()])
      toast.success(success)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el vehículo.')
    }
  }

  async function addVehicle(plate: string, owner: string, space: SpaceId | null) {
    setSavingVehicle(true)
    try {
      await sendJson('/api/vehicles', 'POST', { placa: plate, propietario: owner, espacio_asignado: space })
      await vehicleData.mutate()
      toast.success(`${plate} agregado al padrón.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo agregar la placa.')
      throw error
    } finally {
      setSavingVehicle(false)
    }
  }

  async function runConfirmation() {
    const current = pendingConfirmation
    if (!current) return
    if (current.kind === 'barrier') {
      await sendControl({ tipo: 'BARRERA', comando: current.command })
      setPendingConfirmation(null)
      return
    }

    if (current.kind === 'reset') {
      try {
        const response = await sendJson<ApiResponse<never>>('/api/reset', 'POST', { alcance: current.scope })
        if (response.alerta) toast.warning(response.alerta)
        else toast.success('Estado reiniciado.')
        await Promise.all([vehicleData.mutate(), plazaData.mutate(), eventData.mutate()])
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo reiniciar el estado.')
      } finally {
        setPendingConfirmation(null)
      }
      return
    }

    try {
      await sendJson('/api/vehicles', 'PATCH', { accion: 'REVOCAR', placa: current.vehicle.placa })
      await vehicleData.mutate()
      toast.success(`Acceso revocado para ${current.vehicle.placa}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo revocar el acceso.')
    } finally {
      setPendingConfirmation(null)
    }
  }

  async function logout() {
    await sendJson('/api/auth', 'DELETE').catch(() => undefined)
    window.location.replace('/login')
  }

  const confirmContent = pendingConfirmation?.kind === 'barrier'
    ? {
        title: `${pendingConfirmation.command.startsWith('ABRIR') ? 'Abrir' : 'Cerrar'} barrera`,
        description: demoMode
          ? `Se registrará una simulación de ${pendingConfirmation.command}. No se enviará ningún comando al ESP32.`
          : `Confirma el envío de ${pendingConfirmation.command} al sistema de barreras. La operación quedará registrada en auditoría.`,
        label: pendingConfirmation.command.startsWith('ABRIR') ? 'Confirmar apertura' : 'Confirmar cierre',
        destructive: false,
      }
    : pendingConfirmation?.kind === 'revoke'
      ? {
          title: 'Revocar acceso vehicular',
          description: `La placa ${pendingConfirmation.vehicle.placa} dejará de estar autorizada. El registro se conservará en el padrón.`,
          label: 'Revocar acceso',
          destructive: true,
        }
      : pendingConfirmation?.kind === 'reset'
        ? {
            title: resetCopy[pendingConfirmation.scope].title,
            description: resetCopy[pendingConfirmation.scope].description,
            label: resetCopy[pendingConfirmation.scope].title,
            destructive: pendingConfirmation.scope !== 'alertas',
          }
        : null

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a aria-label="ParkGate AI, inicio" className="brand" href="/">
            <span aria-hidden="true" className="brand-mark"><span /></span>
            <span className="brand-copy"><strong>ParkGate AI <i>·</i> Smart Parking USIL</strong><small>Control de Acceso Vehicular LPR · Gemini 2.5 Flash · ESP32 MQTT</small></span>
          </a>
          <div className="header-actions">
            <div aria-live="polite" className={`telemetry-badge ${online ? 'telemetry-online' : 'telemetry-offline'}`} role="status"><span className="telemetry-pulse" /> <span>NODO ESP32: {online ? 'EN LÍNEA' : 'FUERA DE LÍNEA'}</span></div>
            <Button aria-label="Sincronizar y reconectar MQTT" disabled={refreshing} onClick={() => void refreshDashboard()} size="icon" variant="outline"><RefreshCw aria-hidden="true" className={refreshing ? 'animate-spin' : ''} /></Button>
            <Button aria-label="Cerrar sesión" onClick={() => void logout()} size="icon" variant="ghost"><LogOut aria-hidden="true" /></Button>
          </div>
        </div>
      </header>

      <div className="dashboard-wrap">
        {demoMode && <div className="demo-banner" role="status"><AlertTriangle aria-hidden="true" /><span><strong>Modo demostración.</strong> Los datos son simulados y no se enviarán comandos físicos. Configura GEMINI_API_KEY, MONGODB_URI y OPERATOR_PIN para conectar los servicios reales.</span></div>}
        {(dataLoading || health.error || vehicleData.error || eventData.error) && (
          <>
            <div className={`connection-banner ${dataLoading ? '' : 'connection-banner-warn'}`} role="status" aria-live="polite">
              {dataLoading ? <RefreshCw aria-hidden="true" className="animate-spin" /> : <AlertTriangle aria-hidden="true" />}
              <span>{dataLoading ? 'Conectando con broker MQTT HiveMQ y MongoDB Atlas...' : health.error?.message ?? vehicleData.error?.message ?? eventData.error?.message}</span>
            </div>
            {dataLoading && <div aria-hidden="true" className="connection-skeletons"><span /><span /><span /><span /></div>}
          </>
        )}

        <AlertStrip alerts={activeAlerts} onOpenAudit={() => { setAuditFilter('all'); setAuditTypeFilter('alerts'); setActiveTab('audit') }} onResolve={() => setPendingConfirmation({ kind: 'reset', scope: 'alertas' })} />

        <div className="hero-row">
          <div><p className="eyebrow hero-eyebrow"><span /> CENTRO DE CONTROL <span>/</span> LA MOLINA · PERÚ</p><h1>Acceso vehicular inteligente</h1><p>Validación de matrículas, aforo del recinto y control seguro de barreras desde garita.</p></div>
          <div className="hero-meta">
            <span className={`health-pill ${health.data?.database === 'connected' ? 'health-good' : demoMode ? 'health-demo' : ''}`}><Database aria-hidden="true" />{demoMode ? 'DATOS DE PRUEBA' : health.data?.database === 'connected' ? 'MONGODB ATLAS · CONECTADO' : 'MONGODB ATLAS · SIN CONEXIÓN'}</span>
            <span className="last-refresh"><Activity aria-hidden="true" /> MQTT EN VIVO</span>
          </div>
        </div>

        <KpiStrip telemetry={gateTelemetry} />
        <NavBar activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === 'scanner' && (
          <div className="section-stack">
            <div className="quick-actions">
              <div className="quick-heading"><p className="eyebrow">ATAJOS DE OPERACIÓN</p><span>Acceso inmediato</span></div>
              <div className="quick-list">
                <button onClick={() => setActiveTab('registry')} type="button"><UsersRound aria-hidden="true" /><span>Placas autorizadas</span><b>{vehicles.filter((vehicle) => vehicle.activo).length}</b></button>
                <button onClick={() => { setAuditFilter('today'); setAuditTypeFilter('all'); setActiveTab('audit') }} type="button"><Activity aria-hidden="true" /><span>Accesos de hoy</span><b>{todayCount}</b></button>
                <button className="quick-primary" onClick={() => setPendingConfirmation({ kind: 'barrier', command: 'ABRIR_ENTRADA' })} type="button"><DoorOpen aria-hidden="true" /><span>Abrir barrera entrada</span><ArrowRight aria-hidden="true" /></button>
                <button onClick={() => { setAuditFilter('all'); setAuditTypeFilter('denied'); setActiveTab('audit') }} type="button"><ShieldCheck aria-hidden="true" /><span>Intentos denegados</span><b>{deniedCount}</b></button>
              </div>
            </div>
            <LprScanner busy={scanBusy} error={scannerError} onError={(message) => { setScannerError(message); toast.error(message) }} onQueryChange={setQuery} onScan={scanImage} query={query} />
            {query.trim() && (
              <section aria-live="polite" className="lookup-panel" aria-label="Resultados de búsqueda de vehículos">
                <div className="section-heading"><div><p className="eyebrow">BÚSQUEDA DEL PADRÓN</p><h2>Ficha del vehículo</h2></div><span className="lookup-count">{lookupMatches.length} coincidencias</span></div>
                {lookupMatches.length ? lookupMatches.slice(0, 5).map((vehicle) => {
                  const latestAccess = events.find((event) => event.placa === vehicle.placa)
                  return <article className="lookup-row" key={vehicle.placa}><PlateBadge plate={vehicle.placa} size="md" /><div className="lookup-owner"><strong>{vehicle.propietario}</strong><span>{vehicle.activo ? 'Acceso activo' : 'Acceso revocado'}</span></div><div className="lookup-access"><span>Último acceso</span><strong>{latestAccess ? eventTime(latestAccess.fecha_utc) : 'Sin registros'}</strong></div><span className={`vehicle-status ${vehicle.activo ? 'vehicle-active' : 'vehicle-revoked'}`}>{vehicle.activo ? 'Activo' : 'Revocado'}</span></article>
                }) : <div className="empty-state"><Search aria-hidden="true" /><p>No se encontraron coincidencias en el padrón. Esta búsqueda no ejecuta aperturas.</p></div>}
              </section>
            )}
            {latestResult && <section aria-labelledby="latest-result-heading" className="section-stack"><div className="section-heading"><div><p className="eyebrow">RESULTADO DE VALIDACIÓN</p><h2 id="latest-result-heading">Ticket de acceso</h2></div></div><AccessTicket result={latestResult} /></section>}
            {eventData.isLoading ? <div className="loading-row" role="status">Cargando actividad reciente…</div> : eventData.error ? <div className="empty-state error-state" role="alert">{eventData.error.message}</div> : (
              <section className="section-stack"><div className="section-heading"><div><p className="eyebrow">TRAZABILIDAD</p><h2>Actividad reciente</h2></div><button className="text-action" onClick={() => { setAuditFilter('all'); setAuditTypeFilter('all'); setActiveTab('audit') }} type="button">Ver auditoría <ArrowRight aria-hidden="true" /></button></div>{events.length ? <div className="recent-events">{events.slice(0, 3).map((event) => <div className="recent-event" key={event.id}><span className={`event-dot ${event.evento === 'ACCESO_PLACA_OK' ? 'event-dot-success' : event.evento === 'ACCESO_DENEGADO_LLENO' ? 'event-dot-warning' : 'event-dot-danger'}`} /><strong>{event.placa}</strong><span>{event.detalle}</span><time dateTime={event.fecha_utc}>{eventTime(event.fecha_utc)}</time></div>)}</div> : <div className="empty-state"><p>Sin validaciones registradas. Escanea una placa para iniciar la actividad.</p></div>}</section>
            )}
            <VehicleCarousel onSelect={setQuery} vehicles={vehicles.slice(0, 6)} />
          </div>
        )}

        {activeTab === 'spaces' && (
          <section aria-labelledby="spaces-heading" className="section-stack">
            <div className="section-heading"><div><p className="eyebrow">MONITOREO INTERNO</p><h2 id="spaces-heading">Plazas asignadas</h2></div><span className="registry-count">{plazas.filter((plaza) => plaza.validacion === 'INDEBIDA').length} con alerta</span></div>
            <SpaceMonitor busy={auditBusy} demoMode={demoMode} error={auditError} onError={(message) => { setAuditError(message); toast.error(message) }} onScan={scanSpace} onSimulate={(space, occupied) => void simulateSpace(space, occupied)} plazas={plazas} result={auditResult} sensors={sensors} vehicles={vehicles} />
          </section>
        )}

        {activeTab === 'registry' && (
          <section aria-labelledby="registry-heading" className="section-stack">
            <div className="section-heading"><div><p className="eyebrow">CONTROL DE LISTA BLANCA</p><h2 id="registry-heading">Padrón autorizado</h2></div><span className="registry-count"><ClipboardList aria-hidden="true" />{vehicles.length} registros</span></div>
            <VehicleForm busy={savingVehicle} onSubmit={addVehicle} />
            <label className="registry-search"><Search aria-hidden="true" /><span className="sr-only">Buscar en el padrón</span><input onChange={(event) => setRegistryQuery(event.target.value)} placeholder="Buscar placa o propietario..." value={registryQuery} /></label>
            {vehicleData.isLoading ? <div className="loading-row" role="status">Cargando padrón autorizado…</div> : vehicleData.error ? <div className="empty-state error-state" role="alert">{vehicleData.error.message} <Button onClick={() => void vehicleData.mutate()} variant="outline">Reintentar</Button></div> : <AuthorizedVehicleList onAssign={(vehicle, space) => void patchVehicle({ accion: 'ASIGNAR_ESPACIO', placa: vehicle.placa, espacio_asignado: space }, space ? `${vehicle.placa} asignado al Espacio ${space}.` : `${vehicle.placa} sin plaza física.`)} onExit={(vehicle) => void patchVehicle({ accion: 'MARCAR_SALIDA', placa: vehicle.placa }, `Salida marcada para ${vehicle.placa}.`)} onRevoke={(vehicle) => setPendingConfirmation({ kind: 'revoke', vehicle })} vehicles={vehicles.filter((vehicle) => `${vehicle.placa} ${vehicle.propietario}`.toLocaleLowerCase('es-PE').includes(registryQuery.toLocaleLowerCase('es-PE')))} />}
          </section>
        )}

        {activeTab === 'control' && (
          <section aria-labelledby="control-heading" className="section-stack">
            <div className="section-heading"><div><p className="eyebrow">MQTT · CONTROL MANUAL</p><h2 id="control-heading">Centro de control</h2></div><span className={`health-pill ${online ? 'health-good' : 'health-demo'}`}><span className="telemetry-pulse" />{online ? 'NODO EN LÍNEA' : demoMode ? 'SIMULACIÓN' : 'COMANDOS BLOQUEADOS'}</span></div>
            <ControlCenter busy={controlBusy} demoMode={demoMode} entry={gateEntry} exit={gateExit} onBarrier={(command: BarrierCommand) => setPendingConfirmation({ kind: 'barrier', command })} onReset={(scope) => setPendingConfirmation({ kind: 'reset', scope })} onSend={sendControl} online={online} />
          </section>
        )}

        {activeTab === 'audit' && (
          <AuditLog error={eventData.error?.message} events={events} filter={auditFilter} loading={eventData.isLoading} onFilterChange={setAuditFilter} onRefresh={() => void eventData.mutate()} onTypeFilterChange={setAuditTypeFilter} typeFilter={auditTypeFilter} />
        )}

        <div className="data-footnote"><span><span className="footnote-dot footnote-blue" /> HiveMQ · usil/iot/parking/p01</span><span><span className={`footnote-dot ${demoMode ? 'footnote-amber' : 'footnote-green'}`} />{demoMode ? 'Datos simulados' : 'MongoDB Atlas · smart_parking_db'}</span><span className="footnote-target">META LPR &lt; 2.5 S</span></div>
        <Footer />
      </div>

      <ConfirmDialog
        confirmLabel={confirmContent?.label ?? 'Confirmar'}
        destructive={confirmContent?.destructive}
        description={confirmContent?.description ?? ''}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={runConfirmation}
        open={Boolean(pendingConfirmation)}
        title={confirmContent?.title ?? 'Confirmar acción'}
      />
    </main>
  )
}
