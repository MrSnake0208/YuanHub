export const BUSINESS_TIMEZONE = 'Asia/Shanghai'
export const BUSINESS_DAY_START_HOUR = 5

const DAY_MS = 86400000
const formatterCache = new Map()

function asDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function zonedParts(timezone, value) {
  const date = asDate(value)
  if (!date) return null
  let formatter = formatterCache.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit'
    })
    formatterCache.set(timezone, formatter)
  }
  const parts = formatter.formatToParts(date)
  const get = type => Number(parts.find(part => part.type === type)?.value)
  const result = { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') }
  return Object.values(result).every(Number.isFinite) ? result : null
}

function validDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

function formatDateOnly(date) {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-')
}

/** Return the calendar date in an IANA timezone after applying its day boundary. */
export function dateInZone(timezone, value = new Date(), dayStartHour = 0) {
  const parts = zonedParts(timezone, value)
  if (!parts) return ''
  const day = Date.UTC(parts.year, parts.month - 1, parts.day)
  return formatDateOnly(new Date(day - (parts.hour < dayStartHour ? DAY_MS : 0)))
}

/** Return the site's business date: Shanghai/Beijing time, with a 05:00 boundary. */
export function businessDate(value = new Date()) {
  return dateInZone(BUSINESS_TIMEZONE, value, BUSINESS_DAY_START_HOUR)
}

export function addCalendarDays(value, amount) {
  const date = validDateOnly(value)
  if (!date || !Number.isFinite(Number(amount))) return ''
  return formatDateOnly(new Date(date.getTime() + Math.trunc(Number(amount)) * DAY_MS))
}

function businessBoundaryIso(value) {
  const date = validDateOnly(value)
  if (!date) return null
  // Asia/Shanghai has a fixed UTC+08:00 offset, so this conversion is
  // deterministic even when the browser is running in another timezone.
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), BUSINESS_DAY_START_HOUR) - 8 * 60 * 60 * 1000).toISOString()
}

export function businessDayStartIso(value) {
  return businessBoundaryIso(value)
}

export function nextBusinessDayStartIso(value) {
  return businessBoundaryIso(addCalendarDays(value, 1))
}
