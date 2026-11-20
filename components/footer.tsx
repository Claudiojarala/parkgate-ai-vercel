import { ArrowUpRight, BookOpen, Database, Radio } from 'lucide-react'

const links = [
  { label: 'Telemetría HiveMQ', href: 'https://www.hivemq.com/demos/websocket-client/', icon: Radio },
  { label: 'Estado MongoDB Atlas', href: 'https://status.mongodb.com', icon: Database },
]

export function Footer() {
  const manualUrl = process.env.NEXT_PUBLIC_MANUAL_URL || '#manual-operacion'
  return (
    <footer className="footer-shell" id="manual-operacion">
      <div className="footer-row">
        <p>ParkGate AI <span>·</span> Smart Parking USIL</p>
        <nav aria-label="Enlaces de operación">
          {links.map(({ label, href, icon: Icon }) => (
            <a href={href} key={label} rel="noreferrer" target="_blank"><Icon aria-hidden="true" />{label}<ArrowUpRight aria-hidden="true" /></a>
          ))}
          <a href={manualUrl} rel={manualUrl.startsWith('http') ? 'noreferrer' : undefined} target={manualUrl.startsWith('http') ? '_blank' : undefined}><BookOpen aria-hidden="true" />Manual de operación IoT{manualUrl.startsWith('http') && <ArrowUpRight aria-hidden="true" />}</a>
        </nav>
      </div>
      <p className="footer-note">Los comandos se envían únicamente desde el servidor. Una publicación MQTT no sustituye la confirmación del sensor de barrera.</p>
    </footer>
  )
}
