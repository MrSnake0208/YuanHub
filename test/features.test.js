import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  FEATURE_FLAGS,
  FEATURE_KEYS,
  isFeatureEnabled
} from '../src/config/features.js'

const featureConfig = readFileSync(new URL('../src/config/features.js', import.meta.url), 'utf8')
const operatorPage = readFileSync(new URL('../src/pages/operator/index.vue', import.meta.url), 'utf8')
const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')

test('growth tracking is enabled only in Vite dev mode', function () {
  const key = FEATURE_KEYS.OPERATOR_GROWTH_TRACKING
  const viteDev = import.meta.env?.DEV === true

  assert.equal(key, 'operatorGrowthTracking')
  assert.match(featureConfig, /import\.meta\.env\?\.DEV === true/)
  assert.equal(FEATURE_FLAGS[key], viteDev)
  assert.equal(isFeatureEnabled(key), viteDev)
  assert.equal(isFeatureEnabled('missingFeature'), false)
})

test('operator tracking is guarded at both tabs, panel, and state transition', function () {
  assert.equal((operatorPage.match(/v-if="growthTrackingEnabled"/g) || []).length, 2)
  assert.match(operatorPage, /v-if="growthTrackingEnabled && visitedTabs\.has\('tracking'\)"/)
  assert.match(operatorPage, /function setTab\(t\) \{\s*if \(t === "tracking" && !growthTrackingEnabled\) return;/)
  assert.match(operatorPage, /return import\("\.\.\/\.\.\/components\/operator\/OperatorGrowthTracker\.vue"\)/)
})

test('router supports metadata-based feature fallback', function () {
  assert.match(router, /to\.meta && to\.meta\.feature/)
  assert.match(router, /isFeatureEnabled\(feature\)/)
  assert.match(router, /to\.meta\.featureFallback \|\| '\/cart'/)
})
