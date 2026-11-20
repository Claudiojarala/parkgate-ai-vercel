import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ParkingDashboard } from '@/components/parking-dashboard'
import { isDemoMode, SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

export default async function Page() {
  const cookieStore = await cookies()
  if (!verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)) redirect('/login')
  return <ParkingDashboard initialDemoMode={isDemoMode()} />
}
