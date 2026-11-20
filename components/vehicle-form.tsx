'use client'

import { useState, type FormEvent } from 'react'
import { CarFront, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SpaceId } from '@/types/parking'

export function VehicleForm({ onSubmit, busy }: { onSubmit: (plate: string, owner: string, space: SpaceId | null) => Promise<void>; busy: boolean }) {
  const [plate, setPlate] = useState('')
  const [owner, setOwner] = useState('')
  const [space, setSpace] = useState<'' | '1' | '2'>('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!/^[A-Z0-9]{6}$/.test(normalized)) {
      setError('La placa debe tener seis caracteres alfanuméricos (ej. BBW-266).')
      return
    }
    if (owner.trim().length < 2) {
      setError('Ingresa el nombre del propietario.')
      return
    }
    setError('')
    try {
      await onSubmit(`${normalized.slice(0, 3)}-${normalized.slice(3)}`, owner.trim(), space ? (Number(space) as SpaceId) : null)
      setPlate('')
      setOwner('')
      setSpace('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar el vehículo.')
    }
  }

  return (
    <form className="vehicle-form" onSubmit={submit}>
      <div className="form-heading"><span><CarFront aria-hidden="true" /></span><div><p className="eyebrow">NUEVO REGISTRO</p><h3>Autorizar vehículo</h3></div></div>
      <div className="form-fields">
        <label className="form-field"><span>Placa</span><input autoCapitalize="characters" autoComplete="off" maxLength={10} onChange={(event) => setPlate(event.target.value.toUpperCase())} placeholder="ABC-123" value={plate} /></label>
        <label className="form-field"><span>Propietario</span><input autoComplete="name" maxLength={100} onChange={(event) => setOwner(event.target.value)} placeholder="Nombre completo" value={owner} /></label>
        <label className="form-field"><span>Espacio asignado</span><select onChange={(event) => setSpace(event.target.value as '' | '1' | '2')} value={space}><option value="">Sin plaza física</option><option value="1">Espacio 1</option><option value="2">Espacio 2</option></select></label>
        <Button className="add-vehicle-button" disabled={busy} type="submit"><Plus aria-hidden="true" data-icon="inline-start" />Agregar placa</Button>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </form>
  )
}
