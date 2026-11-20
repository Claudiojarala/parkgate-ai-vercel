import type { Plaza, Vehicle } from '@/types/parking'

// Espacio 1 y 2 son las plazas físicas de la maqueta. Los demás vehículos no tienen plaza con sensor.
// BCT-417, DVP-631 y FQJ-294 representan los 3 vehículos que ya están dentro en el estado base (3 ocupados + 2 libres).
export const initialVehicles: Vehicle[] = [
  { placa: 'BBW-266', propietario: 'Mariana Salazar', activo: true, espacio_asignado: 1, dentro: false, actualizado_utc: '2026-01-12T14:20:00.000Z' },
  { placa: 'ALR-908', propietario: 'Diego Paredes', activo: true, espacio_asignado: 2, dentro: false, actualizado_utc: '2026-01-12T13:05:00.000Z' },
  { placa: 'BCT-417', propietario: 'Lucía Fernández', activo: true, espacio_asignado: null, dentro: true, actualizado_utc: '2026-01-11T17:42:00.000Z' },
  { placa: 'DVP-631', propietario: 'Andrés Gálvez', activo: true, espacio_asignado: null, dentro: true, actualizado_utc: '2026-01-10T16:18:00.000Z' },
  { placa: 'FQJ-294', propietario: 'Sofía Cárdenas', activo: true, espacio_asignado: null, dentro: true, actualizado_utc: '2026-01-09T11:30:00.000Z' },
  { placa: 'HMG-852', propietario: 'Nicolás Rivera', activo: true, espacio_asignado: null, dentro: false, actualizado_utc: '2026-01-08T09:15:00.000Z' },
]

export const initialPlazas: Plaza[] = [
  { espacio: 1, ocupada: false, placa: null, validacion: 'SIN_VALIDAR', actualizado_utc: '2026-01-12T14:20:00.000Z' },
  { espacio: 2, ocupada: false, placa: null, validacion: 'SIN_VALIDAR', actualizado_utc: '2026-01-12T14:20:00.000Z' },
]
