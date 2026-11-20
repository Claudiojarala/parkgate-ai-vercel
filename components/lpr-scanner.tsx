'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Camera, ImageUp, LoaderCircle, Search, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { compressPhoto } from '@/lib/image'


export function LprScanner({ query, onQueryChange, busy, onScan, onError, error }: {
  query: string
  onQueryChange: (value: string) => void
  busy: boolean
  onScan: (image: Blob) => Promise<void>
  onError: (message: string) => void
  error: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [compressing, setCompressing] = useState(false)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setCompressing(true)
    try {
      const jpeg = await compressPhoto(file)
      await onScan(jpeg)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo procesar la imagen.'
      onError(message)
    } finally {
      setCompressing(false)
      event.target.value = ''
    }
  }

  const isBusy = busy || compressing
  return (
    <section aria-labelledby="scanner-heading" className="scanner-panel">
      <div className="scanner-heading-row">
        <span className="scanner-icon"><ScanLine aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">RECONOCIMIENTO ÓPTICO DE PLACAS</p>
          <h2 id="scanner-heading">Escáner LPR</h2>
        </div>
        <span className="model-label">GEMINI 2.5 FLASH</span>
      </div>
      <p className="scanner-intro">Fotografía la matrícula para validar el padrón y registrar el intento. La barrera solo se abre con autorización y cupo disponible.</p>
      <label className="search-field" htmlFor="vehicle-search">
        <Search aria-hidden="true" />
        <input aria-label="Buscar vehículo por número de placa o propietario" autoCapitalize="characters" autoComplete="off" id="vehicle-search" maxLength={40} onChange={(event) => onQueryChange(event.target.value)} placeholder="Buscar vehículo por número de placa (ej. BBW-266)..." value={query} />
      </label>
      <Button className="scan-button" disabled={isBusy} onClick={() => inputRef.current?.click()} type="button">
        {isBusy ? <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <Camera aria-hidden="true" data-icon="inline-start" />}
        {isBusy ? (compressing ? 'Preparando foto…' : 'Analizando placa…') : 'Escanear placa'}
      </Button>
      <input accept="image/*" capture="environment" className="sr-only" onChange={handleFile} ref={inputRef} type="file" />
      <p aria-live="polite" className="scanner-status" role="status">
        {isBusy ? <><LoaderCircle aria-hidden="true" className="animate-spin" /> Procesando matrícula con Gemini 2.5 Flash y validando padrón...</> : <><ImageUp aria-hidden="true" /> Foto optimizada a 1280 px · JPEG 0.8 · no se almacena</>}
      </p>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </section>
  )
}
