import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PWA_DISMISS_MS,
  detectAndroid,
  detectIos,
  detectMobileLike,
  detectSafari
} from '../src/utils/pwaInstall.js'

test('detects Android mobile browsers', function () {
  const nav = { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 }
  assert.equal(detectAndroid(nav), true)
  assert.equal(detectIos(nav), false)
  assert.equal(detectMobileLike(nav), true)
})

test('detects iPhone Safari separately from Chromium iOS', function () {
  const safari = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 }
  const chrome = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 }
  assert.equal(detectIos(safari), true)
  assert.equal(detectSafari(safari), true)
  assert.equal(detectIos(chrome), true)
  assert.equal(detectSafari(chrome), false)
})

test('recognizes iPad desktop-style user agent through touch capability', function () {
  const nav = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 }
  assert.equal(detectIos(nav), true)
  assert.equal(detectMobileLike(nav), true)
})

test('keeps dismissal cooldown at seven days', function () {
  assert.equal(PWA_DISMISS_MS, 7 * 24 * 60 * 60 * 1000)
})
