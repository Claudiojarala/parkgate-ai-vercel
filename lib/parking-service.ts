import 'server-only'

import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { initialPlazas, initialVehicles } from '@/data/vehicles'
import { getParkingDb } from '@/lib/mongodb'
import type {
  LprState, ParkingEvent, ParkingEventType, Plaza, ResetScope, SpaceId, SpaceValidation, Vehicle,
} from '@/types/parking'

interface VehicleDocument {
  placa: string
  propietario: string
  activo: boolean
  espacio_asignado?: SpaceId | null
  dentro?: boolean
  actualizado_utc: Date
}

interface EventDocument {
  evento: ParkingEventType
  placa: string
  detalle: string
  origen: ParkingEvent['origen']
  alerta?: boolean
  resuelta?: boolean
  fecha_utc: Date
}

interface PlazaDocument {
  espacio: SpaceId
  ocupada: boolean
  placa: string | null
  validacion: SpaceValidation
  actualizado_utc: Date
}

interface DemoState {
  vehicles: Vehicle[]
  events: ParkingEvent[]
  plazas: Plaza[]
}

declare global {
  var parkGateDemoState: DemoState | undefined
}

function demoState() {
  globalThis.parkGateDemoState ??= {
    vehicles: initialVehicles.map((vehicle) => ({ ...vehicle })),
    events: [],
    plazas: initialPlazas.map((plaza) => ({ ...plaza })),
  }
  return globalThis.parkGateDemoState
}

// ---------------------------------------------------------------------------
// Reglas de negocio
// ---------------------------------------------------------------------------

/** Ingreso: A autorizado y fuera · B ya figura dentro (posible clonación) · C no registrada. */
export function evaluarAcceso(plate: string | null, vehicle: Vehicle | null, libres: number | null) {
  let estado: LprState
  let evento: ParkingEventType
  let comando = 'SIN_ACCION'
  let alerta = ''
  let esAlerta = false

  if (!plate) {
    estado = 'SIN_LECTURA'
    evento = 'ACCESO_DENEGADO'
    alerta = 'No se identificó una placa legible. Intenta otra foto con mejor iluminación.'
  } else if (!vehicle) {
    estado = 'DENEGADO'
    evento = 'ACCESO_DENEGADO'
    comando = 'PLACA_NO_REGISTRADA'
    esAlerta = true
    alerta = 'Placa no registrada o revocada en la lista blanca. La barrera permanece cerrada.'
  } else if (vehicle.dentro) {
    estado = 'CLONACION'
    evento = 'ALERTA_CLONACION'
    comando = 'ALERTA_CLONACION'
    esAlerta = true
    alerta = 'Esta placa ya figura dentro del recinto. Posible clonación o suplantación de placa: avisa a seguridad.'
  } else if (libres === null) {
    estado = 'DENEGADO'
    evento = 'ACCESO_DENEGADO'
    alerta = 'No llegó telemetría de aforo en 1.5 s. No se envió el comando; verifica el ESP32.'
  } else if (libres <= 0) {
    estado = 'LLENO'
    evento = 'ACCESO_DENEGADO_LLENO'
    alerta = 'Estacionamiento lleno: no se envió comando de apertura.'
  } else {
    estado = 'AUTORIZADO'
    evento = 'ACCESO_PLACA_OK'
    comando = 'ABRIR_ENTRADA'
  }

  return { estado, evento, comando, esAlerta, alerta: alerta || undefined }
}

/** Auditoría de plaza: la placa leída debe coincidir con el titular asignado a ese espacio. */
export function evaluarPlaza(espacio: SpaceId, plate: string | null, vehicle: Vehicle | null, titular: Vehicle | null) {
  if (!plate) {
    return { estado: 'SIN_LECTURA' as const, alerta: 'No se identificó una placa legible. Acércate al vehículo e inténtalo de nuevo.' }
  }
  if (!vehicle) {
    return { estado: 'NO_REGISTRADA' as const, alerta: `Una placa no registrada ocupa el Espacio ${espacio}.` }
  }
  if (vehicle.espacio_asignado === espacio) return { estado: 'CORRECTA' as const, alerta: undefined }

  const dueno = titular ? `${titular.propietario} (${titular.placa})` : 'otro titular'
  const propio = vehicle.espacio_asignado ? `su plaza es el Espacio ${vehicle.espacio_asignado}` : 'no tiene un espacio físico asignado'
  return {
    estado: 'INDEBIDA' as const,
    alerta: `${vehicle.propietario} ocupa el Espacio ${espacio}, reservado para ${dueno}; ${propio}.`,
  }
}

// ---------------------------------------------------------------------------
// Conversión de documentos
// ---------------------------------------------------------------------------

function toVehicle(document: VehicleDocument): Vehicle {
  return {
    placa: document.placa,
    propietario: document.propietario,
    activo: document.activo,
    espacio_asignado: document.espacio_asignado ?? null,
    dentro: document.dentro ?? false,
    actualizado_utc: document.actualizado_utc.toISOString(),
  }
}

function toEvent(document: EventDocument, id: string): ParkingEvent {
  return { ...document, id, fecha_utc: document.fecha_utc.toISOString() }
}

function toPlaza(document: PlazaDocument): Plaza {
  return { ...document, actualizado_utc: document.actualizado_utc.toISOString() }
}

async function vehicleCollection(): Promise<Collection<VehicleDocument>> {
  return (await getParkingDb()).collection<VehicleDocument>('placas_autorizadas')
}

async function eventCollection(): Promise<Collection<EventDocument>> {
  return (await getParkingDb()).collection<EventDocument>('eventos_parking')
}

async function plazaCollection(): Promise<Collection<PlazaDocument>> {
  return (await getParkingDb()).collection<PlazaDocument>('plazas_estado')
}

// ---------------------------------------------------------------------------
// Vehículos
// ---------------------------------------------------------------------------

export async function listVehicles(demo: boolean) {
  if (demo) return demoState().vehicles.map((vehicle) => ({ ...vehicle })).sort((a, b) => a.placa.localeCompare(b.placa))
  const rows = await (await vehicleCollection()).find({}, { projection: { _id: 0 } }).sort({ placa: 1 }).limit(500).toArray()
  return rows.map(toVehicle)
}

export async function findVehicle(plate: string, demo: boolean) {
  if (demo) return demoState().vehicles.find((vehicle) => vehicle.placa === plate) ?? null
  const row = await (await vehicleCollection()).findOne({ placa: plate }, { projection: { _id: 0 } })
  return row ? toVehicle(row) : null
}

export async function findAuthorizedVehicle(plate: string, demo: boolean) {
  const vehicle = await findVehicle(plate, demo)
  return vehicle?.activo ? vehicle : null
}

export async function findVehicleBySpace(espacio: SpaceId, demo: boolean) {
  if (demo) return demoState().vehicles.find((vehicle) => vehicle.activo && vehicle.espacio_asignado === espacio) ?? null
  const row = await (await vehicleCollection()).findOne({ activo: true, espacio_asignado: espacio }, { projection: { _id: 0 } })
  return row ? toVehicle(row) : null
}

async function assertSpaceFree(espacio: SpaceId | null, ownPlate: string | null, demo: boolean) {
  if (!espacio) return
  const holder = await findVehicleBySpace(espacio, demo)
  if (holder && holder.placa !== ownPlate) throw new Error('SPACE_TAKEN')
}

export async function addVehicle(plate: string, propietario: string, espacio: SpaceId | null, demo: boolean) {
  const existing = await findVehicle(plate, demo)
  if (existing) throw new Error('PLATE_EXISTS')
  await assertSpaceFree(espacio, null, demo)
  const actualizado_utc = new Date().toISOString()
  const vehicle: Vehicle = { placa: plate, propietario, activo: true, espacio_asignado: espacio, dentro: false, actualizado_utc }

  if (demo) {
    demoState().vehicles.push(vehicle)
    return vehicle
  }
  await (await vehicleCollection()).insertOne({ ...vehicle, actualizado_utc: new Date(actualizado_utc) })
  return vehicle
}

async function patchVehicle(plate: string, changes: Partial<Pick<Vehicle, 'activo' | 'espacio_asignado' | 'dentro'>>, demo: boolean) {
  const actualizado_utc = new Date().toISOString()
  if (demo) {
    const vehicle = demoState().vehicles.find((item) => item.placa === plate)
    if (!vehicle) return null
    Object.assign(vehicle, changes, { actualizado_utc })
    return { ...vehicle }
  }
  const result = await (await vehicleCollection()).findOneAndUpdate(
    { placa: plate },
    { $set: { ...changes, actualizado_utc: new Date(actualizado_utc) } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  return result ? toVehicle(result) : null
}

export const revokeVehicle = (plate: string, demo: boolean) => patchVehicle(plate, { activo: false }, demo)
export const setVehicleInside = (plate: string, dentro: boolean, demo: boolean) => patchVehicle(plate, { dentro }, demo)

export async function assignSpace(plate: string, espacio: SpaceId | null, demo: boolean) {
  await assertSpaceFree(espacio, plate, demo)
  return patchVehicle(plate, { espacio_asignado: espacio }, demo)
}

// ---------------------------------------------------------------------------
// Plazas físicas (Espacio 1 y 2)
// ---------------------------------------------------------------------------

const SPACES: SpaceId[] = [1, 2]

export async function listPlazas(demo: boolean): Promise<Plaza[]> {
  if (demo) return demoState().plazas.map((plaza) => ({ ...plaza }))
  const rows = await (await plazaCollection()).find({}, { projection: { _id: 0 } }).toArray()
  const bySpace = new Map(rows.map((row) => [row.espacio, toPlaza(row)]))
  return SPACES.map((espacio) => bySpace.get(espacio) ?? { espacio, ocupada: false, placa: null, validacion: 'SIN_VALIDAR', actualizado_utc: new Date(0).toISOString() })
}

async function savePlaza(plaza: Plaza, demo: boolean) {
  if (demo) {
    const state = demoState()
    state.plazas = state.plazas.map((item) => (item.espacio === plaza.espacio ? { ...plaza } : item))
    return
  }
  const { espacio, ...rest } = plaza
  await (await plazaCollection()).updateOne(
    { espacio },
    { $set: { ...rest, actualizado_utc: new Date(plaza.actualizado_utc) } },
    { upsert: true },
  )
}

/**
 * Guarda en la nube lo que reporta el sensor ultrasónico de la plaza.
 * Al liberarse, también libera el estado "dentro" del vehículo vinculado a esa plaza.
 */
export async function syncPlaza(espacio: SpaceId, ocupada: boolean, demo: boolean) {
  const current = (await listPlazas(demo)).find((plaza) => plaza.espacio === espacio)
  if (!current || current.ocupada === ocupada) return { changed: false as const, plaza: current ?? null, released: null as string | null }

  const now = new Date().toISOString()
  let released: string | null = null
  const next: Plaza = { espacio, ocupada, placa: null, validacion: 'SIN_VALIDAR', actualizado_utc: now }

  if (!ocupada) {
    const titular = current.placa ? await findVehicle(current.placa, demo) : await findVehicleBySpace(espacio, demo)
    if (titular?.dentro) {
      await setVehicleInside(titular.placa, false, demo)
      released = titular.placa
    }
  }

  await savePlaza(next, demo)
  await registerEvent({
    evento: ocupada ? 'PLAZA_OCUPADA' : 'PLAZA_LIBRE',
    placa: current.placa ?? '',
    detalle: ocupada ? `Sensor del Espacio ${espacio}: vehículo estacionado` : `Sensor del Espacio ${espacio}: plaza libre${released ? ` · ${released} sale del recinto` : ''}`,
    origen: 'ESP32',
  }, demo)
  if (released) {
    await registerEvent({ evento: 'SALIDA_VEHICULO', placa: released, detalle: `Salida registrada al liberar el Espacio ${espacio}`, origen: 'ESP32' }, demo)
  }
  return { changed: true as const, plaza: next, released }
}

export async function setPlazaValidation(espacio: SpaceId, validacion: SpaceValidation, placa: string | null, demo: boolean) {
  const current = (await listPlazas(demo)).find((plaza) => plaza.espacio === espacio)
  await savePlaza({
    espacio,
    ocupada: current?.ocupada ?? false,
    placa,
    validacion,
    actualizado_utc: new Date().toISOString(),
  }, demo)
}

// ---------------------------------------------------------------------------
// Eventos y reinicios
// ---------------------------------------------------------------------------

export async function registerEvent(input: Omit<ParkingEvent, 'id' | 'fecha_utc'>, demo: boolean) {
  const id = randomUUID()
  const fecha_utc = new Date().toISOString()
  const event: ParkingEvent = { ...input, id, fecha_utc }
  if (demo) {
    demoState().events.unshift(event)
    demoState().events = demoState().events.slice(0, 100)
    return event
  }
  const document: EventDocument = { ...input, fecha_utc: new Date(fecha_utc) }
  await (await eventCollection()).insertOne(document)
  return event
}

export async function listEvents(demo: boolean) {
  if (demo) return demoState().events.slice(0, 50).map((event) => ({ ...event }))
  const rows = await (await eventCollection())
    .find({}, { projection: { _id: 1, evento: 1, placa: 1, detalle: 1, origen: 1, alerta: 1, resuelta: 1, fecha_utc: 1 } })
    .sort({ fecha_utc: -1 })
    .limit(50)
    .toArray()
  return rows.map((row) => toEvent(row, row._id?.toString() ?? randomUUID()))
}

/** Reinicios del administrador. "alertas" marca como resueltas; "ocupacion" limpia el estado dentro/plazas en la nube. */
export async function resetState(scope: ResetScope, demo: boolean) {
  const now = new Date().toISOString()
  if (scope === 'alertas' || scope === 'sistema') {
    if (demo) demoState().events.forEach((event) => { if (event.alerta) event.resuelta = true })
    else await (await eventCollection()).updateMany({ alerta: true, resuelta: { $ne: true } }, { $set: { resuelta: true } })
    for (const plaza of await listPlazas(demo)) {
      if (plaza.validacion === 'INDEBIDA') await savePlaza({ ...plaza, validacion: 'SIN_VALIDAR', placa: null, actualizado_utc: now }, demo)
    }
  }
  if (scope === 'ocupacion' || scope === 'sistema') {
    if (demo) demoState().vehicles.forEach((vehicle) => { vehicle.dentro = false })
    else await (await vehicleCollection()).updateMany({}, { $set: { dentro: false } })
    for (const espacio of SPACES) await savePlaza({ espacio, ocupada: false, placa: null, validacion: 'SIN_VALIDAR', actualizado_utc: now }, demo)
  }
}
