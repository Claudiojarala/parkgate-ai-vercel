import 'server-only'

import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { initialVehicles } from '@/data/vehicles'
import { getParkingDb } from '@/lib/mongodb'
import type { LprState, ParkingEvent, ParkingEventType, Vehicle } from '@/types/parking'

interface VehicleDocument {
  placa: string
  propietario: string
  activo: boolean
  actualizado_utc: Date
}

interface EventDocument {
  evento: ParkingEventType
  placa: string
  detalle: string
  origen: 'WEB_LPR'
  fecha_utc: Date
}

interface DemoState {
  vehicles: Vehicle[]
  events: ParkingEvent[]
}

declare global {
  var parkGateDemoState: DemoState | undefined
}

function demoState() {
  globalThis.parkGateDemoState ??= {
    vehicles: initialVehicles.map((vehicle) => ({ ...vehicle })),
    events: [],
  }
  return globalThis.parkGateDemoState
}

export function evaluarAcceso(plate: string | null, vehicle: Vehicle | null, libres: number | null) {
  let estado: LprState
  let evento: ParkingEventType
  let comando = 'SIN_ACCION'
  let alerta: string

  if (!plate) {
    estado = 'SIN_LECTURA'
    evento = 'ACCESO_DENEGADO'
    alerta = 'No se identificó una placa legible. Intenta otra foto con mejor iluminación.'
  } else if (!vehicle) {
    estado = 'DENEGADO'
    evento = 'ACCESO_DENEGADO'
    alerta = 'Placa no registrada o revocada en la lista blanca.'
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
    alerta = ''
  }

  return { estado, evento, comando, alerta: alerta || undefined }
}

function toVehicle(document: VehicleDocument): Vehicle {
  return {
    placa: document.placa,
    propietario: document.propietario,
    activo: document.activo,
    actualizado_utc: document.actualizado_utc.toISOString(),
  }
}

function toIsoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date(0).toISOString()
}

function toEvent(document: EventDocument, id: string): ParkingEvent {
  return {
    ...document,
    id,
    placa: document.placa ?? '',
    detalle: document.detalle ?? '',
    fecha_utc: toIsoDate(document.fecha_utc),
  }
}

async function vehicleCollection(): Promise<Collection<VehicleDocument>> {
  return (await getParkingDb()).collection<VehicleDocument>('placas_autorizadas')
}

async function eventCollection(): Promise<Collection<EventDocument>> {
  return (await getParkingDb()).collection<EventDocument>('eventos_parking')
}

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
  if (demo) {
    const vehicle = await findVehicle(plate, true)
    return vehicle?.activo ? vehicle : null
  }
  const row = await (await vehicleCollection()).findOne({ placa: plate, activo: true }, { projection: { _id: 0 } })
  return row ? toVehicle(row) : null
}

export async function addVehicle(plate: string, propietario: string, demo: boolean) {
  const existing = await findVehicle(plate, demo)
  if (existing) throw new Error('PLATE_EXISTS')
  const actualizado_utc = new Date().toISOString()
  const vehicle: Vehicle = { placa: plate, propietario, activo: true, actualizado_utc }

  if (demo) {
    demoState().vehicles.push(vehicle)
    return vehicle
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
    .find({}, { projection: { _id: 1, evento: 1, placa: 1, detalle: 1, origen: 1, fecha_utc: 1 } })
    .sort({ fecha_utc: -1 })
    .limit(50)
    .toArray()
  return rows.map((row) => toEvent(row, row._id?.toString() ?? randomUUID()))
}
