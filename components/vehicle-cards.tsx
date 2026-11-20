'use client'

import { ArrowRight, CircleCheck, CircleX, UserRound } from 'lucide-react'
import { PlateBadge } from '@/components/plate-badge'
import type { SpaceId, Vehicle } from '@/types/parking'

export function VehicleCarousel({ vehicles, onSelect }: { vehicles: Vehicle[]; onSelect: (plate: string) => void }) {
  return (
    <section aria-labelledby="vehicle-carousel-title" className="vehicle-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PADRÓN DE ACCESO</p>
          <h2 id="vehicle-carousel-title">Vehículos autorizados</h2>
        </div>
        <span className="section-count">{vehicles.filter((vehicle) => vehicle.activo).length} activos</span>
      </div>
      {vehicles.length ? (
        <div aria-label="Vehículos del padrón" className="vehicle-rail" role="list">
          {vehicles.slice(0, 6).map((vehicle) => (
            <div className="vehicle-rail-item" key={vehicle.placa} role="listitem">
            <button className="vehicle-card" onClick={() => onSelect(vehicle.placa)} type="button">
              <div className="vehicle-card-top">
                <PlateBadge plate={vehicle.placa} size="sm" />
                <span className={`vehicle-status ${vehicle.activo ? 'vehicle-active' : 'vehicle-revoked'}`}>
                  {vehicle.activo ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />}
                  {vehicle.activo ? 'Activo' : 'Revocado'}
                </span>
              </div>
              <div className="vehicle-owner"><UserRound aria-hidden="true" /><span>{vehicle.propietario}</span></div>
              <span className="vehicle-space">{vehicle.espacio_asignado ? `Espacio ${vehicle.espacio_asignado}` : 'Sin plaza física'} · {vehicle.dentro ? 'dentro' : 'fuera'}</span>
              <span className="vehicle-card-action">Ver ficha <ArrowRight aria-hidden="true" /></span>
            </button>
          </div>
          ))}
        </div>
      ) : (
        <div className="empty-state"><p>Aún no hay vehículos en el padrón. Agrega la primera placa desde Padrón autorizado.</p></div>
      )}
    </section>
  )
}

export function AuthorizedVehicleList({ vehicles, onRevoke, onExit, onAssign }: {
  vehicles: Vehicle[]
  onRevoke: (vehicle: Vehicle) => void
  onExit: (vehicle: Vehicle) => void
  onAssign: (vehicle: Vehicle, space: SpaceId | null) => void
}) {
  return (
    <div className="registry-table-wrap">
      <table className="registry-table">
        <thead><tr><th>Placa</th><th>Propietario</th><th>Espacio</th><th>Recinto</th><th>Estado</th><th>Actualizado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          {vehicles.map((vehicle) => (
            <tr key={vehicle.placa}>
              <td><PlateBadge plate={vehicle.placa} size="sm" /></td>
              <td className="vehicle-owner-cell">{vehicle.propietario}</td>
              <td>
                {vehicle.activo ? (
                  <select aria-label={`Espacio asignado a ${vehicle.placa}`} className="row-select" onChange={(event) => onAssign(vehicle, event.target.value ? (Number(event.target.value) as SpaceId) : null)} value={vehicle.espacio_asignado ?? ''}>
                    <option value="">Sin plaza</option><option value="1">Espacio 1</option><option value="2">Espacio 2</option>
                  </select>
                ) : '—'}
              </td>
              <td>
                <span className={`vehicle-status ${vehicle.dentro ? 'vehicle-inside' : 'vehicle-outside'}`}>{vehicle.dentro ? 'Dentro' : 'Fuera'}</span>
                {vehicle.dentro && <button aria-label={`Marcar salida de ${vehicle.placa}`} className="text-action" onClick={() => onExit(vehicle)} type="button">Marcar salida</button>}
              </td>
              <td><span className={`vehicle-status ${vehicle.activo ? 'vehicle-active' : 'vehicle-revoked'}`}>{vehicle.activo ? 'Activo' : 'Revocado'}</span></td>
              <td>{new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date(vehicle.actualizado_utc))}</td>
              <td>{vehicle.activo && <button aria-label={`Revocar acceso a ${vehicle.placa}`} className="text-action text-danger" onClick={() => onRevoke(vehicle)} type="button">Revocar</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!vehicles.length && <div className="empty-state"><p>El padrón está vacío. Usa el formulario para registrar una placa autorizada.</p></div>}
    </div>
  )
}
