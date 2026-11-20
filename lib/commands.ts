import { z } from 'zod'

export const LED_IDS = ['ROJO_ENTRADA', 'ROJO_SALIDA', 'VERDE_E1', 'VERDE_E2'] as const
export type LedId = (typeof LED_IDS)[number]

export const LED_LABELS: Record<LedId, string> = {
  ROJO_ENTRADA: 'LED rojo de entrada',
  ROJO_SALIDA: 'LED rojo de salida',
  VERDE_E1: 'LED verde · Espacio 1',
  VERDE_E2: 'LED verde · Espacio 2',
}

export const controlSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('BARRERA'), comando: z.enum(['ABRIR_ENTRADA', 'CERRAR_ENTRADA', 'ABRIR_SALIDA', 'CERRAR_SALIDA']) }),
  z.object({ tipo: z.literal('LED'), led: z.enum(LED_IDS), encendido: z.boolean() }),
  z.object({ tipo: z.literal('LCD'), linea1: z.string().max(40), linea2: z.string().max(40).optional() }),
  z.object({ tipo: z.literal('LCD_NORMAL') }),
])

export type ControlCommand = z.infer<typeof controlSchema>

/** El LCD 16x2 no muestra tildes ni caracteres especiales: se normaliza a ASCII en mayúsculas. */
export function sanitizeLcd(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .,:!?\-/]/g, '')
    .trim()
    .slice(0, 16)
}

/** Payload de texto que entiende el firmware en usil/iot/parking/p01/cmd */
export function toMqttPayload(command: ControlCommand) {
  switch (command.tipo) {
    case 'BARRERA':
      return command.comando
    case 'LED':
      return `LED:${command.led}:${command.encendido ? 'ON' : 'OFF'}`
    case 'LCD':
      return `LCD:${sanitizeLcd(command.linea1)}|${sanitizeLcd(command.linea2 ?? '')}`
    case 'LCD_NORMAL':
      return 'LCD:NORMAL'
  }
}

export function describeCommand(command: ControlCommand) {
  switch (command.tipo) {
    case 'BARRERA':
      return command.comando
    case 'LED':
      return `${LED_LABELS[command.led]} ${command.encendido ? 'encendido' : 'apagado'}`
    case 'LCD':
      return `LCD: "${sanitizeLcd(command.linea1)}" / "${sanitizeLcd(command.linea2 ?? '')}"`
    case 'LCD_NORMAL':
      return 'LCD: mensaje normal restaurado'
  }
}

// Comandos automáticos (los publica el servidor tras validar una placa)
export const CMD_ALERTA_CLONACION = 'ALERTA_CLONACION'
export const CMD_PLACA_NO_REGISTRADA = 'PLACA_NO_REGISTRADA'
export const CMD_RESET = 'RESET'
