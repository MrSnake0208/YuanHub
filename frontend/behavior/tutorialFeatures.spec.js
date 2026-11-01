import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it.each([undefined, '', 'false', 'TRUE', '1', ' true ', 'true'])('only the exact string true enables tutorials (%s)', async value => {
  vi.stubEnv('VITE_TUTORIALS_ENABLED', value)
  for (const dev of [true, false]) {
    vi.stubEnv('DEV', dev)
    vi.resetModules()
    const { FEATURE_KEYS, isFeatureEnabled, TUTORIALS_ENABLED } = await import('../src/config/features.js')
    expect(isFeatureEnabled(FEATURE_KEYS.TUTORIALS)).toBe(value === 'true')
    expect(TUTORIALS_ENABLED).toBe(value === 'true')
  }
})
