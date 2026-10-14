import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  FEATURE_FLAGS,
  FEATURE_KEYS,
  isFeatureEnabled
} from '../src/config/features.js'

const featureConfig = readFileSync(new URL('../src/config/features.js', import.meta.url), 'utf8')
const operatorPage = readFileSync(new URL('../src/pages/operator/index.vue', import.meta.url), 'utf8')
const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')

test('growth tracking is enabled in development and production', function () {
  const key = FEATURE_KEYS.OPERATOR_GROWTH_TRACKING

  assert.equal(key, 'operatorGrowthTracking')
  assert.match(featureConfig, /import\.meta\.env\?\.DEV === true/)
  assert.equal(FEATURE_FLAGS[key], true)
  assert.equal(isFeatureEnabled(key), true)
  assert.equal(isFeatureEnabled('missingFeature'), false)
})

test('work system is explicitly disabled until it is ready to reopen', function () {
  const key = FEATURE_KEYS.WORK_SYSTEM

  assert.equal(key, 'workSystem')
  assert.equal(FEATURE_FLAGS[key], false)
  assert.equal(isFeatureEnabled(key), false)
})

test('tutorials are disabled without an explicit Vite true value', function () {
  assert.equal(FEATURE_KEYS.TUTORIALS, 'tutorials')
  assert.equal(FEATURE_FLAGS[FEATURE_KEYS.TUTORIALS], false)
  assert.equal(isFeatureEnabled(FEATURE_KEYS.TUTORIALS), false)
})

test('discarded status stays disabled until the paired software supports it', function () {
  assert.equal(FEATURE_KEYS.OPERATOR_DISCARDED, 'operatorDiscarded')
  assert.equal(FEATURE_FLAGS[FEATURE_KEYS.OPERATOR_DISCARDED], false)
  assert.equal(isFeatureEnabled(FEATURE_KEYS.OPERATOR_DISCARDED), false)
})

test('recruitment uses the shared beta gate with authenticated workspace', async function () {
  assert.equal(FEATURE_KEYS.RECRUITMENT_ARCHIVE, 'recruitmentArchive')
  assert.equal(FEATURE_FLAGS[FEATURE_KEYS.RECRUITMENT_ARCHIVE], true)
  assert.equal(isFeatureEnabled(FEATURE_KEYS.RECRUITMENT_ARCHIVE), true)
  const { routes } = await import('../src/router/routes.js')
  const route = routes.find(item => item.path === '/recruitment')
  assert.equal(route.meta.feature, FEATURE_KEYS.RECRUITMENT_ARCHIVE)
  assert.equal(route.meta.requiresAuth, true)
  assert.equal(route.meta.requiresRecruitmentAccess, undefined)
  assert.equal(route.meta.requiresBeta, true)
  assert.equal(typeof route.component, 'function')
})

test('operator tracking retains lazy loading and shows its persistent accuracy warning and feedback entry', function () {
  assert.equal((operatorPage.match(/@click="openGrowthPlanningPreview"/g) || []).length, 3)
  assert.match(operatorPage, /class="planning-bug-notice" role="note"><strong>测试中：<\/strong>规划结果可能不准确，请核对后操作。/)
  assert.match(operatorPage, /<router-link class="link" to="\/feedback">反馈问题<\/router-link>/)
  assert.match(operatorPage, /v-if="growthTrackingEnabled && visitedTabs\.has\('tracking'\)"/)
  assert.match(operatorPage, /function setTab\(t\) \{\s*if \(t === "tracking" && !growthTrackingEnabled\) return;/)
  assert.match(operatorPage, /return import\("\.\.\/\.\.\/components\/operator\/OperatorGrowthTracker\.vue"\)/)
})

test('router supports metadata-based feature fallback', function () {
  assert.match(router, /to\.meta && to\.meta\.feature/)
  assert.match(router, /isFeatureEnabled\(feature\)/)
  assert.match(router, /to\.meta\.featureFallback \|\| '\/cart'/)
})

test('CI and release pin production builds and release uses the configured official API', () => {
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const release = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
  assert.match(ci, /name: Build\s+env:\s+NODE_ENV: production\s+run: npm run build/)
  assert.ok(release.includes('NODE_ENV=production VITE_API_BASE="$API_BASE" npm run build'))
  assert.ok(release.includes('API_BASE: ${{ vars.YUANHUB_FRONTEND_API_BASE }}'))
})

test('star completion defaults to enabled in development, production and native Node', async () => {
  assert.equal(FEATURE_FLAGS[FEATURE_KEYS.STAR_COMPLETION], true)
  assert.equal(isFeatureEnabled(FEATURE_KEYS.STAR_COMPLETION), true)
  for (const env of [{}, { DEV: true, PROD: false }, { DEV: false, PROD: true }]) {
    const source = featureConfig.replaceAll('import.meta.env', JSON.stringify(env))
    const flags = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
    assert.equal(flags.isFeatureEnabled(flags.FEATURE_KEYS.STAR_COMPLETION), true)
  }
})

test('actual Vite production output enables completion without an opt-in or demo', async () => {
  const { build } = await import('vite')
  const result = await build({
    configFile: false, envFile: false, mode: 'production', logLevel: 'silent',
    build: { write: false, minify: false, lib: {
      entry: fileURLToPath(new URL('../src/config/features.js', import.meta.url)),
      formats: ['es'],
    } },
  })
  const outputs = Array.isArray(result) ? result : [result]
  const chunk = outputs.flatMap(item => item.output).find(item => item.type === 'chunk')
  const compiled = await import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'))
  assert.equal(compiled.isFeatureEnabled(compiled.FEATURE_KEYS.STAR_COMPLETION), true)
  assert.equal(compiled.isFeatureEnabled(compiled.FEATURE_KEYS.STAR_COMPLETION_DEMO), false)
})
