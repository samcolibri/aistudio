export function timedelta(opts: {
  seconds?: number
  minutes?: number
  hours?: number
  days?: number
}): string {
  let totalMs = 0
  totalMs += (opts.seconds ?? 0) * 1000
  totalMs += (opts.minutes ?? 0) * 60 * 1000
  totalMs += (opts.hours ?? 0) * 60 * 60 * 1000
  totalMs += (opts.days ?? 0) * 24 * 60 * 60 * 1000
  // Temporal SDK accepts ms as number for durations in some contexts,
  // but scheduleToCloseTimeout and startToCloseTimeout accept human-readable strings
  const seconds = Math.floor(totalMs / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem > 0 ? `${hours}h${rem}m` : `${hours}h`
}
