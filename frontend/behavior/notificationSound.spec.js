import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { notificationSound, setNotificationSoundEnabled, canPlayNotificationSound, playNotificationSound, subscribeNotificationSound } from '../src/utils/notificationSound.js'
let stop, audio, oscillator, gain
beforeEach(() => {
  oscillator = { frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() }
  gain = { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }
  audio = { state: 'running', currentTime: 10, destination: {}, resume: vi.fn(async () => {}), close: vi.fn(async () => {}), createOscillator: () => oscillator, createGain: () => gain }
  vi.stubGlobal('AudioContext', vi.fn(function () { return audio }))
  notificationSound.enabled = true
  stop = subscribeNotificationSound()
})
afterEach(() => stop())
it('没有音频解锁时不发声，开关解锁后播放低音量短音；关闭后静默', () => {
  playNotificationSound(); expect(oscillator.start).not.toHaveBeenCalled()
  setNotificationSoundEnabled(true)
  expect(canPlayNotificationSound()).toBe(true)
  playNotificationSound()
  expect(oscillator.start).toHaveBeenCalledWith(10)
  expect(oscillator.stop).toHaveBeenCalledWith(10.24)
  expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.025, 10.015)
  setNotificationSoundEnabled(false)
  expect(localStorage.getItem('yuanhub:feedback-reply-sound:v1')).toBe('0')
  playNotificationSound(); expect(oscillator.start).toHaveBeenCalledOnce()
})
it('浏览器拒绝恢复或保持暂停时静默，不延迟重播', async () => {
  audio.state = 'suspended'; audio.resume.mockRejectedValue(new Error('blocked'))
  setNotificationSoundEnabled(true)
  await Promise.resolve()
  playNotificationSound()
  expect(oscillator.start).not.toHaveBeenCalled()
  audio.state = 'running'
  await Promise.resolve()
  expect(oscillator.start).not.toHaveBeenCalled()
})
