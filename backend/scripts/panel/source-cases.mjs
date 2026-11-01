import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { parseAssignment, writePrivateBundle } from './convert-rules.mjs'

const [source, mappingPath, output] = process.argv.slice(2)
assert(source && mappingPath && output && process.argv.length === 5, 'Usage: node source-cases.mjs <reviewed-source-dir> <mapping.json> <private-cases.json>')
const mapping = JSON.parse(readFileSync(mappingPath, 'utf8'))
for (const name of ['panel_calc.js', 'panel_data.js', 'constellation_data.js', 'kizuna_data.js']) {
  assert.equal(createHash('sha256').update(readFileSync(join(source, name))).digest('hex'), mapping.sources.find(row => row.file === name)?.sha256, 'Source changed: ' + name)
}
// Explicit verification only: execute the reviewed reference core, never in the application/import path.
const core = createRequire(import.meta.url)(join(source, 'panel_calc.js'))
const read = (file, variable) => parseAssignment(readFileSync(join(source, file), 'utf8'), variable)
const data = read('panel_data.js', 'PANEL_DATA')
const cn = read('constellation_data.js', 'CONSTELLATION_DATA')
const kz = read('kizuna_data.js', 'KIZUNA_DATA')
const cases = []
function add(mapped, input, stones = []) {
  const extra = core.merge(
    ...stones.map(stone => core.stoneAttrs(cn, stone.sourceId, stone.level, stone.breakthroughStage + 1).attr),
    core.kizunaAttrs(core.kizunaFromStones(stones.map(stone => stone.sourceId), kz).active, kz),
  )
  const result = core.computePanel(data.warriors[mapped.source_id], {
    level: input.level, breakthrough: input.breakthroughStage, potential: input.potential,
    istar: input.star, awaken: input.awakened, rumor: { 2101: input.oddityHp, 2103: input.oddityAttack }, extra,
  })
  assert.equal(result.warnings.length, 0)
  cases.push({ operatorId: mapped.operator_id, input, stones, expected: { hp: result.hp, attack: result.atk } })
}
for (const mapped of mapping.operators) {
  const warrior = data.warriors[mapped.source_id]
  for (const level of [1, 10, 11, 50, 90, 100]) {
    for (let stage = Math.floor((level - 1) / 10); stage <= Math.min(Math.floor(level / 10), 9); stage++) {
      for (const potential of [0, 3, 17]) for (const star of [1, warrior.max_star]) {
        for (const awakened of star === 25 && Object.keys(warrior.awake).length ? [false, true] : [false]) {
          add(mapped, { level, breakthroughStage: stage, potential, star, awakened, oddityHp: 0, oddityAttack: 0 })
        }
      }
    }
  }
}
const operator = mapping.operators.find(row => row.name === '杨修')
assert(operator)
const full = { level: 100, breakthroughStage: 9, potential: 17, star: 25, awakened: true, oddityHp: 2600, oddityAttack: 500 }
for (const [sourceId, stone] of Object.entries(cn.stones)) {
  const maximum = Math.max(...Object.keys(stone.l).map(Number))
  for (const level of [...new Set([1, 10, 11, 20, 21, 30, 31, 40, 41, 50, 51, maximum])].filter(value => value <= maximum)) {
    for (let stage = Math.floor((level - 1) / 10); stage <= Math.min(Math.floor(level / 10), maximum / 10 - 1); stage++) {
      add(operator, full, [{ sourceId, level, breakthroughStage: stage }])
    }
  }
}
for (const combo of Object.values(kz)) for (let quality = 1; quality <= 5; quality++) {
  add(operator, full, combo.compose.map((series, index) => ({ sourceId: String(series * 10 + Math.min(quality + index, 5)), level: 1, breakthroughStage: 0 })))
}
writePrivateBundle(output, cases)
console.log(`Generated ${cases.length} source arithmetic comparisons for ${mapping.operators.length} mapped operators, 190 stones and ${Object.keys(kz).length} combos.`)
