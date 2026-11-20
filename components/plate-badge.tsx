import { cn } from '@/lib/utils'

export function PlateBadge({ plate, size = 'md' }: { plate: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span aria-label={`Placa ${plate}`} className={cn('plate-badge', `plate-badge-${size}`)}>
      <span className="plate-country">PERÚ</span>
      <strong>{plate}</strong>
    </span>
  )
}
