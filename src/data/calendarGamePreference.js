import { CALENDAR_GAMES } from './activityCalendar.js'

export const CALENDAR_GAME_STORAGE_KEY = 'yuanhub.activity-calendar.game.v1'
export function readCalendarGamePreference() {
  try {
    const value = localStorage.getItem(CALENDAR_GAME_STORAGE_KEY)
    return CALENDAR_GAMES.includes(value) ? value : ''
  } catch { return '' }
}
export function saveCalendarGamePreference(value) {
  if (value !== '' && !CALENDAR_GAMES.includes(value)) return false
  try { localStorage.setItem(CALENDAR_GAME_STORAGE_KEY, value) } catch { return false }
  return true
}
export function calendarGameFilter(query, preference) {
  const game = Array.isArray(query.game) ? query.game[0] : query.game
  return CALENDAR_GAMES.includes(game) ? game : CALENDAR_GAMES.includes(preference) ? preference : ''
}
