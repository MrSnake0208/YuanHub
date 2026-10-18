import { reactive } from 'vue'

const KEY = 'yuanhub:feedback-reply-sound:v1'
function readPreference() {
  try { return localStorage.getItem(KEY) !== '0' } catch (_) { return true }
}
export const notificationSound = reactive({ enabled: readPreference() })
let context = null

function unlock() {
  if (!notificationSound.enabled) return
  try {
    const Audio = window.AudioContext || window.webkitAudioContext
    if (!Audio) return
    context ||= new Audio()
    void context.resume().catch(() => {})
  } catch (_) { /* Autoplay policy or unsupported audio: remain silent. */ }
}

export function setNotificationSoundEnabled(enabled) {
  notificationSound.enabled = Boolean(enabled)
  try { localStorage.setItem(KEY, enabled ? '1' : '0') } catch (_) { /* Keep the in-memory preference. */ }
  if (enabled) unlock()
}

export function canPlayNotificationSound() {
  return notificationSound.enabled && context?.state === 'running'
}

export function playNotificationSound() {
  if (!canPlayNotificationSound()) return
  try {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const now = context.currentTime
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(660, now)
    oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.12)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.025, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    oscillator.start(now)
    oscillator.stop(now + 0.24)
  } catch (_) { /* Never replay a blocked tone later. */ }
}

export function subscribeNotificationSound() {
  const onGesture = event => { if (event.isTrusted) unlock() }
  const onStorage = event => { if (event.key === KEY) notificationSound.enabled = readPreference() }
  document.addEventListener('pointerdown', onGesture, true)
  document.addEventListener('keydown', onGesture, true)
  window.addEventListener('storage', onStorage)
  return () => {
    document.removeEventListener('pointerdown', onGesture, true)
    document.removeEventListener('keydown', onGesture, true)
    window.removeEventListener('storage', onStorage)
    if (context) { void context.close().catch(() => {}); context = null }
  }
}
