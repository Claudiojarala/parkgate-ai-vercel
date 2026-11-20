'use client'

import { useEffect, useMemo, useState } from 'react'
import mqtt, { type MqttClient } from 'mqtt'
import type { Availability, GateState, SpaceSensor, TelemetryState } from '@/types/parking'

const BROKER = 'wss://broker.hivemq.com:8884/mqtt'
const STATE_TOPIC = 'usil/iot/parking/p01/estado'
const AVAILABILITY_TOPIC = 'usil/iot/parking/p01/disponibilidad'
const initialTelemetry: TelemetryState = {
  libres: 5,
  ocupados: 0,
  cap: 5,
  barrera_entrada: 'CERRADA',
  barrera_salida: 'CERRADA',
  espacio1: 'SIN_DATO',
  espacio2: 'SIN_DATO',
  disponibilidad: 'unknown',
  connected: false,
  lastMessageAt: null,
}

function gateState(value: unknown): GateState {
  return value === 'ABIERTA' || value === 'CERRADA' ? value : 'SIN_DATO'
}

function sensorState(value: unknown): SpaceSensor {
  return value === 'LIBRE' || value === 'OCUPADO' ? value : 'SIN_DATO'
}

export function useTelemetry() {
  const [state, setState] = useState(initialTelemetry)
  const [now, setNow] = useState(Date.now())
  const [reconnectKey, setReconnectKey] = useState(0)

  useEffect(() => {
    let client: MqttClient | null = null
    let stopped = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryDelay = 1_000

    const scheduleReconnect = () => {
      if (stopped || retryTimer) return
      retryTimer = setTimeout(() => {
        retryTimer = null
        retryDelay = Math.min(retryDelay * 2, 30_000)
        connect()
      }, retryDelay)
    }

    const connect = () => {
      if (stopped) return
      client = mqtt.connect(BROKER, {
        clientId: `parkgate-ui-${Math.random().toString(36).slice(2, 10)}`,
        clean: true,
        connectTimeout: 8_000,
        keepalive: 20,
        reconnectPeriod: 0,
      })
      client.on('connect', () => {
        retryDelay = 1_000
        setState((current) => ({ ...current, connected: true }))
        client?.subscribe([STATE_TOPIC, AVAILABILITY_TOPIC], { qos: 0 })
      })
      client.on('message', (topic, payload) => {
        const text = payload.toString().trim()
        const receivedAt = Date.now()
        if (topic === AVAILABILITY_TOPIC) {
          const availability: Availability = text === 'online' || text === 'offline' ? text : 'unknown'
          setState((current) => ({ ...current, disponibilidad: availability, lastMessageAt: receivedAt }))
          return
        }
        if (topic !== STATE_TOPIC) return
        try {
          const value = JSON.parse(text) as Record<string, unknown>
          const libres = Number(value.libres)
          const ocupados = Number(value.ocupados)
          const cap = Number(value.cap)
          if (![libres, ocupados, cap].every(Number.isFinite)) return
          setState((current) => ({
            ...current,
            libres: Math.max(0, Math.floor(libres)),
            ocupados: Math.max(0, Math.floor(ocupados)),
            cap: Math.max(0, Math.floor(cap)),
            barrera_entrada: gateState(value.barrera_entrada),
            barrera_salida: gateState(value.barrera_salida),
            espacio1: sensorState(value.espacio1),
            espacio2: sensorState(value.espacio2),
            lastMessageAt: receivedAt,
          }))
        } catch {
          return
        }
      })
      client.on('error', () => client?.end(true))
      client.on('close', () => {
        setState((current) => ({ ...current, connected: false }))
        scheduleReconnect()
      })
    }

    connect()
    const freshnessTimer = setInterval(() => setNow(Date.now()), 1_000)
    return () => {
      stopped = true
      clearInterval(freshnessTimer)
      if (retryTimer) clearTimeout(retryTimer)
      client?.end(true)
    }
  }, [reconnectKey])

  const telemetry = useMemo(() => {
    const fresh = state.lastMessageAt !== null && now - state.lastMessageAt < 30_000
    const availability = fresh ? state.disponibilidad : 'offline'
    return {
      ...state,
      disponibilidad: availability,
      online: availability === 'online',
      fresh,
    }
  }, [now, state])

  return { telemetry, reconnect: () => setReconnectKey((current) => current + 1) }
}
