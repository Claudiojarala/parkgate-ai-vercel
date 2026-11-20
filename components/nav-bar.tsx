'use client'

import { Activity, Camera, ClipboardList, ParkingSquare, RadioTower } from 'lucide-react'
import type { DashboardTab } from '@/types/parking'

const tabs: { id: DashboardTab; label: string; icon: typeof Camera }[] = [
  { id: 'scanner', label: 'Escáner LPR', icon: Camera },
  { id: 'spaces', label: 'Plazas', icon: ParkingSquare },
  { id: 'registry', label: 'Padrón', icon: ClipboardList },
  { id: 'control', label: 'Control', icon: RadioTower },
  { id: 'audit', label: 'Auditoría', icon: Activity },
]

export function NavBar({ activeTab, onChange }: { activeTab: DashboardTab; onChange: (tab: DashboardTab) => void }) {
  return (
    <nav aria-label="Navegación principal" className="nav-shell">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button aria-current={activeTab === id ? 'page' : undefined} className={`nav-tab ${activeTab === id ? 'nav-tab-active' : ''}`} key={id} onClick={() => onChange(id)} type="button">
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
