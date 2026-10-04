import test from 'node:test'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { normalizeGrowthTarget, sharedPlanCalculations } from '../src/data/operatorPlanGrowth.js'
import { isMovieOperator, matchesOperatorQuality, isStandardRecruitmentOperator } from '../src/utils/operatorForms.js'
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

test('movie quality is separate from numeric tier and standard recruitment', () => {
  assert.equal(matchesOperatorQuality(movie, 5), false)
  assert.equal(matchesOperatorQuality(movie, 'movie'), true)
  assert.equal(isStandardRecruitmentOperator(movie, '如鸢'), false)
  assert.equal(isStandardRecruitmentOperator({ ...base, rarity: 5 }, '如鸢'), true)
})

test('movie targets use direct stars and do not invent a new growth target by default', () => {
  assert.equal(normalizeGrowthTarget({ ...movie, starLevel: 2 }).starLevel, 2)
  assert.equal(normalizeGrowthTarget(movie, { starLevel: 31 }).starLevel, 5)
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

test('fallback generator retains SP relations from canonical and legacy input without touching repository catalog', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sp-catalog-'))
  try {
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}')
    for (const file of ['scripts/build-inventory-catalog.mjs', 'src/utils/operatorFilters.js', 'src/utils/operatorForms.js', 'src/utils/operatorStarDisplay.js']) {
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
