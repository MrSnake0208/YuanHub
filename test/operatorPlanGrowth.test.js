import test from 'node:test'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { normalizeGrowthTarget, sharedPlanCalculations, growthHuajiProgress } from '../src/data/operatorPlanGrowth.js'
import { growthTargetReached } from '../src/data/operatorTraining.js'
import { workspaceBody, workspaceFromRemote } from '../src/data/operatorPlannerRemote.js'
import { isMovieOperator, matchesOperatorQuality, isRecruitmentOperator } from '../src/utils/operatorForms.js'
import { normalizeOperatorCatalog, visibleAgentEntries } from '../src/data/inventory/agentManifest.js'
import { AGENT_CATALOG } from '../src/data/inventory/catalog.js'

const base = { id: 'base', name: '本体', rarity: 4, prof: '风', subProf: '神纪', games: ['如鸢'] }
const movie = { id: 'movie', name: '电影', spOf: 'base', rarity: 5, prof: '阳', subProf: '神纪', games: ['如鸢'] }

test('catalog normalization retains unknown future movie relations and hides their heart paper', () => {
  const [entry] = normalizeOperatorCatalog([{ ...movie, id: 'future', spOf: undefined, sp_of: base.id }])
  assert.equal(entry.spOf, base.id)
  assert.deepEqual(visibleAgentEntries([entry, base]), [base])
  assert.equal(isMovieOperator(AGENT_CATALOG.find(entry => entry.id === 'char_084_chendengsp')), true)
  assert.equal(isMovieOperator(AGENT_CATALOG.find(entry => entry.id === 'char_085_shizimiaosp')), true)
})

test('movie quality stays separate while recruitment accepts same-game four and five star forms', () => {
  assert.equal(matchesOperatorQuality(movie, 5), false)
  assert.equal(matchesOperatorQuality(movie, 'movie'), true)
  assert.equal(isRecruitmentOperator(movie, '如鸢'), true)
  assert.equal(isRecruitmentOperator({ ...base, rarity: 5 }, '如鸢'), true)
  assert.equal(isRecruitmentOperator({ ...base, rarity: 4 }, '如鸢'), true)
  assert.equal(isRecruitmentOperator({ ...base, rarity: 3 }, '如鸢'), false)
  assert.equal(isRecruitmentOperator(movie, '代号鸢'), false)
})

test('movie targets use direct stars and do not invent a new growth target by default', () => {
  assert.equal(normalizeGrowthTarget({ ...movie, starLevel: 2 }).starLevel, 2)
  const unknown = normalizeGrowthTarget(movie, { starLevel: 31 })
  assert.equal(unknown.starLevel, 31)
  assert.equal(unknown.huaji.stage, null)
  assert.equal(normalizeGrowthTarget({ ...movie, starLevel: 4 }, { starLevel: 2 }).starLevel, 4)
  assert.equal(normalizeGrowthTarget(base).starLevel, 7)
})

test('base and movie share maximal level and elite targets with one cost independent of catalog order', () => {
  const current = { base: { level: 90, elite: 16, starLevel: 7 }, movie: { level: 90, elite: 16, starLevel: 2 } }
  const targets = { base: { level: 95, elite: 16, starLevel: 7 }, movie: { level: 100, elite: 17, starLevel: 5 } }
  for (const catalog of [[base, movie], [movie, base]]) {
    const costs = sharedPlanCalculations(catalog, current, new Set(['base', 'movie']), row => targets[row.id])
    assert.equal(costs.base.level.experience, 877000)
    assert.equal(costs.movie.level.experience, 0)
    assert.deepEqual(costs.base.xiuwei.items, { xianmenshan: 750, beihuifengshan: 1200 })
    assert.deepEqual(costs.movie.xiuwei.items, {})
    assert.equal(costs.movie.star.unsupported, true)
    assert.equal(costs.movie.star.heart, 0)
  }
})

test('movie-only plan uses the known base progress and materials while star ownership stays independent', () => {
  const costs = sharedPlanCalculations([base, movie], { base: { level: 90, elite: 16 } }, new Set(['movie']), () => ({ level: 100, elite: 17, starLevel: 1 }))
  assert.equal(costs.movie.level.experience, 877000)
  assert.equal(costs.movie.xiuwei.items.xianmenshan, 750)
  assert.equal(costs.movie.star.unsupported, true)
})

test('五星目标与觉醒目标分别完成；视觉第26步不写进stage，旧31目标连续读取', () => {
  const five = { ...base, level: 100, elite: 17, huaji: { owned: true, stage: 25, awakened: null } }
  const target = normalizeGrowthTarget(five, { huaji: { owned: true, stage: 25, awakened: true } })
  assert.equal(growthTargetReached(five, target), false)
  assert.equal(growthHuajiProgress(five, target), 96)
  assert.equal(growthHuajiProgress({ ...five, huaji: { ...five.huaji, awakened: false } }, target), 96)
  const complete = { ...five, huaji: { ...five.huaji, awakened: true } }
  assert.equal(growthTargetReached(complete, target), true)
  assert.equal(growthHuajiProgress(complete, target), 100)
  const onlyFive = normalizeGrowthTarget(five, { huaji: { owned: true, stage: 25, awakened: null } })
  assert.equal(growthTargetReached(five, onlyFive), true)
  assert.equal(growthHuajiProgress(five, onlyFive), 100)
  assert.deepEqual(normalizeGrowthTarget(five, { starLevel: 31 }).huaji, target.huaji)
  const historical = { ...five, starLevel: 31, huaji: null }
  assert.equal(growthHuajiProgress(historical, target), 100)
  assert.equal(growthTargetReached(historical, target), true)
  const unknown = { ...historical, starLevel: 32 }
  assert.equal(growthHuajiProgress(unknown, target), 0)
  assert.equal(growthTargetReached(unknown, target), false)
})

test('觉醒材料未知仍保留24→25已知成本，共享等级修为不重复计费', () => {
  const current = { base: { level: 90, elite: 16, huaji: { owned: true, stage: 24, awakened: null } }, movie: { level: 90, elite: 16, starLevel: 2 } }
  const targets = row => normalizeGrowthTarget(row, { level: 100, elite: 17, ...(row.id === 'base' ? { huaji: { owned: true, stage: 25, awakened: true } } : { starLevel: 2 }) })
  const costs = sharedPlanCalculations([base, movie], current, new Set(['base', 'movie']), targets)
  assert.equal(costs.base.star.heart, 80)
  assert.equal(costs.base.star.money, 160000)
  assert.deepEqual(costs.base.star.items, {})
  assert.equal(costs.base.star.awakeningUnsupported, true)
  assert.equal(costs.base.star.unsupported, true)
  assert.equal(costs.movie.level.experience, 0)
  assert.deepEqual(costs.movie.xiuwei.items, {})
})

test('自建计划云端目标仅使用独立huaji，回读保留unknown而非false', () => {
  const workspace = { accountId: 'acc', revision: 3, activePlanId: 'plan', plans: [{ id: 'plan', name: '目标', source: 'custom', operatorIds: ['base'], excludedOperatorIds: [],
    targets: { base: { level: 100, elite: 17, starLevel: 25, huaji: { owned: true, stage: 25, awakened: null } } } }] }
  const body = workspaceBody(workspace)
  assert.deepEqual(body.plans[0].targets.base, { level: 100, elite: 17, huaji: workspace.plans[0].targets.base.huaji })
  const remote = workspaceFromRemote({ ...body, account_id: 'acc', revision: 4 }, 'acc')
  assert.equal(remote.plans[0].targets.base.huaji.awakened, null)
})

test('fallback generator retains SP relations from canonical and legacy input without touching repository catalog', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sp-catalog-'))
  try {
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}')
    for (const file of ['scripts/build-inventory-catalog.mjs', 'src/utils/operatorFilters.js', 'src/utils/operatorForms.js', 'src/utils/operatorStarDisplay.js', 'src/utils/operatorHuaji.js']) {
      const target = join(directory, file)
      mkdirSync(target.slice(0, target.lastIndexOf('/')), { recursive: true })
      copyFileSync(new URL('../' + file, import.meta.url), target)
    }
    const items = join(directory, 'items.json')
    const operators = join(directory, 'operators.json')
    writeFileSync(items, JSON.stringify({ items: [{ id: 'item', name: '道具' }] }))
    for (const source of [[{ ...movie, prof: ['阳'], subProf: ['shenji'] }], { OPERATORS: [movie] }]) {
      writeFileSync(operators, JSON.stringify(source))
      execFileSync(process.execPath, [join(directory, 'scripts/build-inventory-catalog.mjs'), items, operators])
      const output = readFileSync(join(directory, 'src/data/inventory/catalog.js'), 'utf8')
      assert.match(output, /spOf: 'base'/)
      assert.match(output, /subProf: '神纪'/)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})


test('共享规划只计一次，已确认90突破不再计该节点的材料或铜钱', () => {
  const current = { base: { level: 90, elite: 15, levelBreakthroughStage: 9 }, movie: { level: 90, elite: 15, levelBreakthroughStage: 9 } }
  const targets = row => normalizeGrowthTarget(row, { level: 95, elite: 15 })
  const costs = sharedPlanCalculations([base, movie], current, new Set(['base', 'movie']), targets)
  assert.deepEqual(costs.base.level.items, {})
  assert.equal(costs.base.level.money, 0)
  assert.ok(costs.base.level.experience > 0)
  assert.equal(costs.movie.level.experience, 0)
})
