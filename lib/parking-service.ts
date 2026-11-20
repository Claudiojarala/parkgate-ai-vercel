import 'server-only'

import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { initialPlazas, initialVehicles } from '@/data/vehicles'
import { CMD_ALERTA_CLONACION, CMD_PLACA_NO_REGISTRADA } from '@/lib/commands'
import { getParkingDb } from '@/lib/mongodb'
import type {
  AuditScanState,
  EventOrigin,
  LprState,
  ParkingEvent,
  ParkingEventType,
  Plaza,
  ResetScope,
  SpaceId,
  SpaceValidation,
  Vehicle,
} from '@/types/parking'

const SPACES: SpaceId[] = [1, 2]

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
  origen: EventOrigin
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
  plazas: Plaza[]
  events: ParkingEvent[]
}

declare global {
  var parkGateDemoState: DemoState | undefined
}

function demoState() {
  globalThis.parkGateDemoState ??= {
    vehicles: initialVehicles.map((vehicle) => ({ ...vehicle })),
    plazas: initialPlazas.map((plaza) => ({ ...plaza })),
    events: [],
  }
  return globalThis.parkGateDemoState
}

// ---------------------------------------------------------------- decisiones

export function evaluarAcceso(plate: string | null, vehicle: Vehicle | null, libres: number | null) {
  let estado: LprState
  let evento: ParkingEventType
  let comando = 'SIN_ACCION'
  let alerta: string | undefined
  let esAlerta = false

  if (!plate) {
    estado = 'SIN_LECTURA'
    evento = 'ACCESO_DENEGADO'
    alerta = 'No se identificó una placa legible. Intenta otra foto con mejor iluminación.'
  } else if (!vehicle) {
    estado = 'DENEGADO'
    evento = 'ACCESO_DENEGADO'
    comando = CMD_PLACA_NO_REGISTRADA
    alerta = 'Placa no registrada o revocada en la lista blanca.'
  } else if (vehicle.dentro) {
    estado = 'CLONACION'
    evento = 'ALERTA_CLONACION'
    comando = CMD_ALERTA_CLONACION
    esAlerta = true
    alerta = 'Posible clonación de placa: este vehículo ya figura dentro del estacionamiento. Barrera cerrada.'
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

  return { estado, evento, comando, alerta, esAlerta }
}

export function evaluarPlaza(espacio: SpaceId, plate: string | null, vehicle: Vehicle | null, titular: Vehicle | null) {
  let estado: AuditScanState
  let alerta: string | undefined

  if (!plate) {
    estado = 'SIN_LECTURA'
    alerta = 'No se identificó una placa legible. Intenta otra foto con mejor iluminación.'
  } else if (!vehicle) {
    estado = 'NO_REGISTRADA'
    alerta = `Placa no registrada o revocada: vehículo no autorizado en el Espacio ${espacio}.`
  } else if (titular && titular.placa === vehicle.placa) {
    estado = 'CORRECTA'
  } else {
    estado = 'INDEBIDA'
    alerta = titular
      ? `El Espacio ${espacio} pertenece a ${titular.propietario} (${titular.placa}), no a ${vehicle.propietario}.`
      : `El Espacio ${espacio} no tiene un titular asignado.`
  }

  return { estado, alerta }
}

// ---------------------------------------------------------------- conversiones

function toIsoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date(0).toISOString()
}

// Los documentos antiguos sin espacio_asignado ni dentro se leen como null y false.
function toVehicle(document: VehicleDocument): Vehicle {
  return {
    placa: document.placa,
    propietario: document.propietario,
    activo: document.activo,
    espacio_asignado: document.espacio_asignado ?? null,
    dentro: document.dentro ?? false,
    actualizado_utc: toIsoDate(document.actualizado_utc),
  }
}

function toPlaza(document: PlazaDocument): Plaza {
  return {
    espacio: document.espacio,
    ocupada: document.ocupada,
    placa: document.placa ?? null,
    validacion: document.validacion ?? 'SIN_VALIDAR',
    actualizado_utc: toIsoDate(document.actualizado_utc),
  }
}

function toEvent(document: EventDocument, id: string): ParkingEvent {
  return {
    id,
    evento: document.evento,
    placa: document.placa ?? '',
    detalle: document.detalle ?? '',
    origen: document.origen ?? 'WEB_LPR',
    ...(document.alerta !== undefined ? { alerta: document.alerta } : {}),
    ...(document.resuelta !== undefined ? { resuelta: document.resuelta } : {}),
    fecha_utc: toIsoDate(document.fecha_utc),
  }
}

function blankPlaza(espacio: SpaceId): Plaza {
  return { espacio, ocupada: false, placa: null, validacion: 'SIN_VALIDAR', actualizado_utc: new Date().toISOString() }
}

// ---------------------------------------------------------------- colecciones

async function vehicleCollection(): Promise<Collection<VehicleDocument>> {
  return (await getParkingDb()).collection<VehicleDocument>('placas_autorizadas')
}

async function eventCollection(): Promise<Collection<EventDocument>> {
  return (await getParkingDb()).collection<EventDocument>('eventos_parking')
}

async function plazaCollection(): Promise<Collection<PlazaDocument>> {
  return (await getParkingDb()).collection<PlazaDocument>('plazas_estado')
}

// ---------------------------------------------------------------- vehículos

export async function listVehicles(demo: boolean) {
  if (demo) return demoState().vehicles.map((vehicle) => ({ ...vehicle })).sort((a, b) => a.placa.localeCompare(b.placa))
  const rows = await (await vehicleCollection()).find({}, { projection: { _id: 0 } }).sort({ placa: 1 }).limit(500).toArray()
  return rows.map(toVehicle)
}

export async function findVehicle(plate: string, demo: boolean) {
  if (demo) {
    const found = demoState().vehicles.find((vehicle) => vehicle.placa === plate)
    return found ? { ...found } : null
  }
  const row = await (await vehicleCollection()).findOne({ placa: plate }, { projection: { _id: 0 } })
  return row ? toVehicle(row) : null
}

export async function findAuthorizedVehicle(plate: string, demo: boolean) {
  const vehicle = await findVehicle(plate, demo)
  return vehicle?.activo ? vehicle : null
}

/** Titular activo de un espacio (cada espacio pertenece a un solo vehículo activo). */
export async function findVehicleBySpace(espacio: SpaceId, demo: boolean) {
  if (demo) {
    const found = demoState().vehicles.find((vehicle) => vehicle.activo && vehicle.espacio_asignado === espacio)
    return found ? { ...found } : null
  }
  const row = await (await vehicleCollection()).findOne({ espacio_asignado: espacio, activo: true }, { projection: { _id: 0 } })
  return row ? toVehicle(row) : null
}

async function assertSpaceFree(espacio: SpaceId | null, exceptPlate: string, demo: boolean) {
  if (espacio === null) return
  const holder = await findVehicleBySpace(espacio, demo)
  if (holder && holder.placa !== exceptPlate) throw new Error('SPACE_TAKEN')
}

export async function addVehicle(plate: string, propietario: string, espacio: SpaceId | null, demo: boolean) {
  const existing = await findVehicle(plate, demo)
  if (existing) throw new Error('PLATE_EXISTS')
  await assertSpaceFree(espacio, plate, demo)

  const actualizado_utc = new Date().toISOString()
  const vehicle: Vehicle = { placa: plate, propietario, activo: true, espacio_asignado: espacio, dentro: false, actualizado_utc }

  if (demo) {
    demoState().vehicles.push(vehicle)
    return { ...vehicle }
  }

  await (await vehicleCollection()).insertOne({ ...vehicle, actualizado_utc: new Date(actualizado_utc) })
  return vehicle
}

export async function revokeVehicle(plate: string, demo: boolean) {
  const actualizado_utc = new Date().toISOString()
  if (demo) {
    const vehicle = demoState().vehicles.find((item) => item.placa === plate)
    if (!vehicle) return null
    vehicle.activo = false
    vehicle.actualizado_utc = actualizado_utc
    return { ...vehicle }
  }

  const result = await (await vehicleCollection()).findOneAndUpdate(
    { placa: plate },
    { $set: { activo: false, actualizado_utc: new Date(actualizado_utc) } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  return result ? toVehicle(result) : null
}

export async function setVehicleInside(plate: string, dentro: boolean, demo: boolean) {
  const actualizado_utc = new Date().toISOString()
  if (demo) {
    const vehicle = demoState().vehicles.find((item) => item.placa === plate)
    if (!vehicle) return null
    vehicle.dentro = dentro
    vehicle.actualizado_utc = actualizado_utc
    return { ...vehicle }
  }

  const result = await (await vehicleCollection()).findOneAndUpdate(
    { placa: plate },
    { $set: { dentro, actualizado_utc: new Date(actualizado_utc) } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  return result ? toVehicle(result) : null
}

export async function assignSpace(plate: string, espacio: SpaceId | null, demo: boolean) {
  const existing = await findVehicle(plate, demo)
  if (!existing) return null
  await assertSpaceFree(espacio, plate, demo)

  const actualizado_utc = new Date().toISOString()
  if (demo) {
    const vehicle = demoState().vehicles.find((item) => item.placa === plate)
    if (!vehicle) return null
    vehicle.espacio_asignado = espacio
    vehicle.actualizado_utc = actualizado_utc
    return { ...vehicle }
  }

  const result = await (await vehicleCollection()).findOneAndUpdate(
    { placa: plate },
    { $set: { espacio_asignado: espacio, actualizado_utc: new Date(actualizado_utc) } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  return result ? toVehicle(result) : null
}

// ---------------------------------------------------------------- eventos

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

// ---------------------------------------------------------------- plazas

export async function listPlazas(demo: boolean): Promise<Plaza[]> {
  if (demo) return demoState().plazas.map((plaza) => ({ ...plaza })).sort((a, b) => a.espacio - b.espacio)
  const rows = await (await plazaCollection()).find({}, { projection: { _id: 0 } }).toArray()
  return SPACES.map((espacio) => {
    const row = rows.find((item) => item.espacio === espacio)
    return row ? toPlaza(row) : blankPlaza(espacio)
  })
}

async function writePlaza(plaza: Plaza, demo: boolean): Promise<Plaza> {
  if (demo) {
    const state = demoState()
    const index = state.plazas.findIndex((item) => item.espacio === plaza.espacio)
    if (index >= 0) state.plazas[index] = { ...plaza }
    else state.plazas.push({ ...plaza })
    return { ...plaza }
  }
  await (await plazaCollection()).updateOne(
    { espacio: plaza.espacio },
    { $set: { ocupada: plaza.ocupada, placa: plaza.placa, validacion: plaza.validacion, actualizado_utc: new Date(plaza.actualizado_utc) } },
    { upsert: true },
  )
  return plaza
}

/**
 * Guarda el cambio de ocupación que reporta el sensor de una plaza.
 * Al liberarse, el estado "dentro" del titular del espacio también se libera.
 */
export async function syncPlaza(espacio: SpaceId, ocupada: boolean, demo: boolean) {
  const current = (await listPlazas(demo)).find((item) => item.espacio === espacio) ?? blankPlaza(espacio)
  if (current.ocupada === ocupada) return { plaza: current, cambio: false }

  const titular = await findVehicleBySpace(espacio, demo)
  const plaza = await writePlaza(
    { espacio, ocupada, placa: null, validacion: 'SIN_VALIDAR', actualizado_utc: new Date().toISOString() },
    demo,
  )

  await registerEvent({
    evento: ocupada ? 'PLAZA_OCUPADA' : 'PLAZA_LIBRE',
    placa: titular?.placa ?? `ESPACIO-${espacio}`,
    detalle: ocupada ? `Espacio ${espacio} ocupado (sensor)` : `Espacio ${espacio} liberado (sensor)`,
    origen: 'ESP32',
  }, demo)

  if (!ocupada && titular?.dentro) {
    await setVehicleInside(titular.placa, false, demo)
    await registerEvent({
      evento: 'SALIDA_VEHICULO',
      placa: titular.placa,
      detalle: `Salida detectada al liberarse el Espacio ${espacio}`,
      origen: 'ESP32',
    }, demo)
  }

  return { plaza, cambio: true }
}

export async function setPlazaValidation(espacio: SpaceId, validacion: Exclude<SpaceValidation, 'SIN_VALIDAR'>, placa: string | null, demo: boolean) {
  const current = (await listPlazas(demo)).find((item) => item.espacio === espacio) ?? blankPlaza(espacio)
  return writePlaza({ ...current, validacion, placa, actualizado_utc: new Date().toISOString() }, demo)
}

// ---------------------------------------------------------------- reinicios

export async function resetState(scope: ResetScope, demo: boolean) {
  const resolveAlerts = scope === 'alertas' || scope === 'sistema'
  const freeOccupancy = scope === 'ocupacion' || scope === 'sistema'
  const now = new Date()

  if (demo) {
    const state = demoState()
    if (resolveAlerts) {
      state.events = state.events.map((event) => (event.alerta && !event.resuelta ? { ...event, resuelta: true } : event))
    }
    if (scope === 'alertas') {
      state.plazas = state.plazas.map((plaza) => (plaza.validacion === 'INDEBIDA' ? { ...plaza, placa: null, validacion: 'SIN_VALIDAR', actualizado_utc: now.toISOString() } : plaza))
    }
    if (freeOccupancy) {
      state.vehicles = state.vehicles.map((vehicle) => ({ ...vehicle, dentro: false, actualizado_utc: now.toISOString() }))
      state.plazas = SPACES.map((espacio) => blankPlaza(espacio))
    }
    return
  }

  if (resolveAlerts) {
    await (await eventCollection()).updateMany({ alerta: true, resuelta: { $ne: true } }, { $set: { resuelta: true } })
  }
  if (scope === 'alertas') {
    await (await plazaCollection()).updateMany(
      { validacion: 'INDEBIDA' },
      { $set: { placa: null, validacion: 'SIN_VALIDAR', actualizado_utc: now } },
    )
  }
  if (freeOccupancy) {
    await (await vehicleCollection()).updateMany({ dentro: true }, { $set: { dentro: false, actualizado_utc: now } })
    await (await plazaCollection()).updateMany({}, { $set: { ocupada: false, placa: null, validacion: 'SIN_VALIDAR', actualizado_utc: now } })
  }
}
