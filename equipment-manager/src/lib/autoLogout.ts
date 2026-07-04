export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function shouldTriggerLogout(nowMinutes: number, targetMinutes: number, alreadyHandledToday: boolean): boolean {
  return !alreadyHandledToday && nowMinutes >= targetMinutes
}
