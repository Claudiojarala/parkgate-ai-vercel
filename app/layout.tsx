import { Analytics } from '@vercel/analytics/next'
import { Barlow_Condensed, Geist } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] })
const barlow = Barlow_Condensed({ variable: '--font-barlow-condensed', subsets: ['latin'], weight: ['600', '700'] })

export const metadata: Metadata = {
  title: 'ParkGate AI · Smart Parking USIL',
  description: 'Centro de control de acceso vehicular USIL con lectura de placas, telemetría MQTT y auditoría de barreras.',
  applicationName: 'ParkGate AI',
  keywords: ['USIL', 'estacionamiento inteligente', 'LPR', 'ESP32', 'MQTT'],
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0B1120',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="dark">
      <body className={`${geist.variable} ${barlow.variable}`}>
        {children}
        <Toaster position="top-right" richColors theme="dark" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
