import 'server-only'

import { randomUUID } from 'node:crypto'
import mqtt, { type MqttClient } from 'mqtt'

// Broker privado (EMQX Cloud, HiveMQ Cloud...) por MQTT sobre TLS. Si MQTT_HOST no existe, usa el broker público.
const PUBLIC_BROKER = 'wss://broker.hivemq.com:8884/mqtt'
const brokerUrl = () => (process.env.MQTT_HOST ? `mqtts://${process.env.MQTT_HOST}:${process.env.MQTT_PORT ?? '8883'}` : PUBLIC_BROKER)
const brokerAuth = () => (process.env.MQTT_USER ? { username: process.env.MQTT_USER, password: process.env.MQTT_PASS ?? '' } : {})
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
  return mqtt.connect(brokerUrl(), {
    ...brokerAuth(),
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

declare global {
  var parkGatePublisher: MqttClient | undefined
}

function getPublisher() {
  const current = globalThis.parkGatePublisher
  if (current && !current.disconnected) return current
  const client = mqtt.connect(brokerUrl(), {
    ...brokerAuth(),
    clientId: `parkgate-pub-${randomUUID().slice(0, 12)}`, // único por instancia: dos instancias con el mismo id se expulsan
    clean: true,
    connectTimeout: 4_000,
    keepalive: 20,
    reconnectPeriod: 2_000,
  })
  client.on('error', () => undefined)
  globalThis.parkGatePublisher = client
  return client
}

function resetPublisher() {
  globalThis.parkGatePublisher?.end(true)
  globalThis.parkGatePublisher = undefined
}

function publishOnce(command: string, timeoutMs: number) {
  const client = getPublisher()
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const done = (error?: Error | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => done(new Error('Tiempo de espera agotado al publicar en el broker MQTT.')), timeoutMs)
    const send = () => {
      if (settled) return // si ya expiró, no publicar un comando atrasado
      client.publish(COMMAND_TOPIC, command, { qos: 1, retain: false }, (error) => done(error ?? null))
    }
    if (client.connected) send()
    else client.once('connect', send)
  })
}

/** Reutiliza la conexión entre llamadas; si falla, la recrea y reintenta una vez. */
export async function publishCommand(command: string) {
  try {
    await publishOnce(command, 3_000)
  } catch {
    resetPublisher()
    await publishOnce(command, 4_000)
  }
}
