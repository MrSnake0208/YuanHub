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

test('work system is explicitly disabled until it is ready to reopen', function () {
  const key = FEATURE_KEYS.WORK_SYSTEM

  assert.equal(key, 'workSystem')
  assert.equal(FEATURE_FLAGS[key], false)
  assert.equal(isFeatureEnabled(key), false)
})

test('discarded status stays disabled until the paired software supports it', function () {
  assert.equal(FEATURE_KEYS.OPERATOR_DISCARDED, 'operatorDiscarded')
  assert.equal(FEATURE_FLAGS[FEATURE_KEYS.OPERATOR_DISCARDED], false)
  assert.equal(isFeatureEnabled(FEATURE_KEYS.OPERATOR_DISCARDED), false)
})

test('recruitment preview is public; its personal workspace enforces independent access', async function () {
  assert.equal(FEATURE_KEYS.RECRUITMENT_ARCHIVE, 'recruitmentArchive')
  assert.equal(FEATURE_FLAGS[FEATURE_KEYS.RECRUITMENT_ARCHIVE], true)
  assert.equal(isFeatureEnabled(FEATURE_KEYS.RECRUITMENT_ARCHIVE), true)
  const { routes } = await import('../src/router/routes.js')
  const route = routes.find(item => item.path === '/recruitment')
  assert.equal(route.meta.feature, FEATURE_KEYS.RECRUITMENT_ARCHIVE)
  assert.equal(route.meta.requiresAuth, undefined)
  assert.equal(route.meta.requiresRecruitmentAccess, undefined)
  assert.equal(route.meta.requiresBeta, undefined)
  assert.equal(typeof route.component, 'function')
})

test('operator tracking stays visible as a preview while the real panel remains feature-guarded', function () {
  assert.equal((operatorPage.match(/@click="openGrowthPlanningPreview"/g) || []).length, 2)
  assert.match(operatorPage, /message: "功能准备中，开放时间以站内公告为准。"/)
  assert.match(operatorPage, /v-if="growthTrackingEnabled && visitedTabs\.has\('tracking'\)"/)
  assert.match(operatorPage, /function setTab\(t\) \{\s*if \(t === "tracking" && !growthTrackingEnabled\) return;/)
  assert.match(operatorPage, /return import\("\.\.\/\.\.\/components\/operator\/OperatorGrowthTracker\.vue"\)/)
})

test('router supports metadata-based feature fallback', function () {
  assert.match(router, /to\.meta && to\.meta\.feature/)
  assert.match(router, /isFeatureEnabled\(feature\)/)
  assert.match(router, /to\.meta\.featureFallback \|\| '\/cart'/)
})
