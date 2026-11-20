export type ParkingEventType =
  | 'ACCESO_PLACA_OK'
  | 'ACCESO_DENEGADO'
  | 'ACCESO_DENEGADO_LLENO'
  | 'ALERTA_CLONACION'
  | 'SALIDA_VEHICULO'
  | 'PLAZA_OCUPADA'
  | 'PLAZA_LIBRE'
  | 'ESTACIONAMIENTO_CORRECTO'
  | 'ALERTA_OCUPACION_INDEBIDA'
  | 'APERTURA_MANUAL_ENTRADA'
  | 'APERTURA_MANUAL_SALIDA'
  | 'CONTROL_MANUAL'
  | 'RESET_SISTEMA'

export type EventOrigin = 'WEB_LPR' | 'WEB_AUDITORIA' | 'WEB_ADMIN' | 'ESP32'
export type SpaceId = 1 | 2
export type SpaceValidation = 'SIN_VALIDAR' | 'CORRECTA' | 'INDEBIDA'
export type SpaceSensor = 'LIBRE' | 'OCUPADO' | 'SIN_DATO'
export type LprState = 'AUTORIZADO' | 'DENEGADO' | 'LLENO' | 'SIN_LECTURA' | 'CLONACION'
export type AuditScanState = 'CORRECTA' | 'INDEBIDA' | 'NO_REGISTRADA' | 'SIN_LECTURA'
export type BarrierCommand = 'ABRIR_ENTRADA' | 'CERRAR_ENTRADA' | 'ABRIR_SALIDA' | 'CERRAR_SALIDA'
export type GateState = 'ABIERTA' | 'CERRADA' | 'SIN_DATO'
export type Availability = 'online' | 'offline' | 'unknown'
export type DashboardTab = 'scanner' | 'spaces' | 'registry' | 'control' | 'audit'
export type AuditFilter = 'all' | 'today' | 'week'
export type AuditTypeFilter = 'all' | 'denied' | 'alerts' | ParkingEventType
export type ResetScope = 'alertas' | 'ocupacion' | 'sistema'

export interface Vehicle {
  placa: string
  propietario: string
  activo: boolean
  espacio_asignado: SpaceId | null
  dentro: boolean
  actualizado_utc: string
}

export interface Plaza {
  espacio: SpaceId
  ocupada: boolean
  placa: string | null
  validacion: SpaceValidation
  actualizado_utc: string
}

export interface ParkingEvent {
  id: string
  evento: ParkingEventType
  placa: string
  detalle: string
  origen: EventOrigin
  alerta?: boolean
  resuelta?: boolean
  fecha_utc: string
}

export interface TelemetryState {
  libres: number
  ocupados: number
  cap: number
  barrera_entrada: GateState
  barrera_salida: GateState
  espacio1: SpaceSensor
  espacio2: SpaceSensor
  disponibilidad: Availability
  connected: boolean
  lastMessageAt: number | null
}

export interface LprResult {
  estado: LprState
  placa: string
  propietario?: string
  comando: string
  mqttOk: boolean
  alerta?: string
  latenciaMs: number
  hora: string
}

export interface AuditScanResult {
  estado: AuditScanState
  espacio: SpaceId
  placa: string
  propietario?: string
  espacioAsignado?: SpaceId | null
  titularDelEspacio?: string
  alerta?: string
  latenciaMs: number
  hora: string
}
