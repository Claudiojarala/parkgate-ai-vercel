export function normalizePlate(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (compact.length !== 6) return null
  return `${compact.slice(0, 3)}-${compact.slice(3)}`
}

export function isValidPlate(value: string) {
  return /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(value)
}
