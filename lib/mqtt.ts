import 'server-only'

import { randomUUID } from 'node:crypto'
import mqtt, { type MqttClient } from 'mqtt'

export const MQTT_BROKER = 'wss://broker.hivemq.com:8884/mqtt'
export const STATE_TOPIC = 'usil/iot/parking/p01/estado'
export const AVAILABILITY_TOPIC = 'usil/iot/parking/p01/disponibilidad'
export const COMMAND_TOPIC = 'usil/iot/parking/p01/cmd'

export interface ParkingTelemetryPayload {
  libres: number
  ocupados: number
  cap: number
  barrera_entrada: 'ABIERTA' | 'CERRADA'
  barrera_salida: 'ABIERTA' | 'CERRADA'
  espacio1?: 'LIBRE' | 'OCUPADO'
  espacio2?: 'LIBRE' | 'OCUPADO'
}

export interface ServerTelemetrySnapshot {
  state: ParkingTelemetryPayload | null
  availability: 'online' | 'offline' | null
}

function createClient(timeoutMs: number) {
  return mqtt.connect(MQTT_BROKER, {
    clientId: `parkgate-web-${randomUUID().slice(0, 12)}`,
    clean: true,
    connectTimeout: Math.min(timeoutMs, 2_500),
    keepalive: 20,
    reconnectPeriod: 0,
  })
}

export function readTelemetry(timeoutMs = 1_500): Promise<ServerTelemetrySnapshot> {
  return new Promise((resolve) => {
    const client = createClient(timeoutMs)
    const snapshot: ServerTelemetrySnapshot = { state: null, availability: null }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      client.end(true)
      resolve(snapshot)
    }
    const timer = setTimeout(finish, timeoutMs)

    client.on('connect', () => {
      client.subscribe([STATE_TOPIC, AVAILABILITY_TOPIC], { qos: 0 }, (error) => {
        if (error) finish()
      })
    })
    client.on('message', (topic, message) => {
      const value = message.toString().trim()
      if (topic === AVAILABILITY_TOPIC) {
        if (value === 'online' || value === 'offline') snapshot.availability = value
      }
      if (topic === STATE_TOPIC) {
        try {
          const parsed = JSON.parse(value) as Partial<ParkingTelemetryPayload>
          const libres = Number(parsed.libres)
          const ocupados = Number(parsed.ocupados)
          const cap = Number(parsed.cap)
          if (
            Number.isFinite(libres) && Number.isFinite(ocupados) && Number.isFinite(cap) &&
            (parsed.barrera_entrada === 'ABIERTA' || parsed.barrera_entrada === 'CERRADA') &&
            (parsed.barrera_salida === 'ABIERTA' || parsed.barrera_salida === 'CERRADA')
          ) {
            snapshot.state = {
              libres: Math.max(0, Math.floor(libres)),
              ocupados: Math.max(0, Math.floor(ocupados)),
              cap: Math.max(0, Math.floor(cap)),
              barrera_entrada: parsed.barrera_entrada,
              barrera_salida: parsed.barrera_salida,
              ...(parsed.espacio1 === 'LIBRE' || parsed.espacio1 === 'OCUPADO' ? { espacio1: parsed.espacio1 } : {}),
              ...(parsed.espacio2 === 'LIBRE' || parsed.espacio2 === 'OCUPADO' ? { espacio2: parsed.espacio2 } : {}),
            }
          }
        } catch {
          snapshot.state = null
        }
      }
      if (snapshot.state && snapshot.availability) finish()
    })
    client.on('error', finish)
    client.on('close', () => {
      if (!settled) finish()
    })
  })
}

export async function readAvailableSpots(timeoutMs = 1_500) {
  const snapshot = await readTelemetry(timeoutMs)
  return snapshot.state?.libres ?? null
}

export async function publishCommand(command: string) {
  const client = createClient(4_000)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Tiempo de espera agotado al conectar con HiveMQ.')), 4_000)
    const finish = (error?: Error | null) => {
      clearTimeout(timeout)
      client.end(true)
      if (error) reject(error)
      else resolve()
    }

    client.once('connect', () => {
      client.publish(COMMAND_TOPIC, command, { qos: 1, retain: false }, finish)
    })
    client.once('error', (error) => finish(error))
    client.once('close', () => finish(new Error('Conexión MQTT cerrada antes de publicar.')))
  })
}
