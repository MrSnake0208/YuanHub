import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const fields = { 2101: 'hp', 2102: 'hpPercent', 2103: 'attack', 2104: 'attackPercent' }
const attributes = row => Object.fromEntries(Object.entries(fields).map(([key, field]) => {
  const value = row[key] ?? 0
  assert(Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000, 'Invalid integer attribute')
  return [field, value]
}))
const table = rows => Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, attributes(row)]))

// These are JSON assignments, not programs. Never execute the supplied calculator data.
export function parseAssignment(text, variable) {
  const body = text.replace(/^\s*\/\*[\s\S]*?\*\//, '').trim()
  const match = body.match(new RegExp('^window\\.' + variable + '\\s*=\\s*([\\s\\S]*?)\\s*;?$'))
  assert(match, 'Expected data assignment: ' + variable)
  return JSON.parse(match[1])
}

export function convertRules(sourceDirectory, mapping, version) {
  assert(/^[a-zA-Z0-9_-]{1,64}$/.test(version), 'Invalid version')
  const read = (file, variable) => {
    const bytes = readFileSync(join(sourceDirectory, file))
    const expected = mapping.sources.find(row => row.file === file)?.sha256
    assert(expected && createHash('sha256').update(bytes).digest('hex') === expected, 'Source differs from reviewed mapping: ' + file)
    return parseAssignment(bytes.toString('utf8'), variable)
  }
  const data = read('panel_data.js', 'PANEL_DATA')
  const stones = read('constellation_data.js', 'CONSTELLATION_DATA')
  const meta = read('constellation_meta.js', 'CONSTELLATION_META')
  const kizunas = read('kizuna_data.js', 'KIZUNA_DATA')
  const mappings = [...mapping.operators, ...mapping.private_unmapped_operators]
  assert.equal(new Set(mappings.map(row => row.source_id)).size, mappings.length, 'Duplicate source mapping')
  const mappedIds = mapping.operators.map(row => row.operator_id)
  assert(mappedIds.every(id => typeof id === 'string' && id.trim()) && new Set(mappedIds).size === mappedIds.length)
  assert.deepEqual(new Set(mappings.map(row => row.source_id)), new Set(Object.keys(data.warriors)))
  const operators = mappings.map(mapped => {
    const row = data.warriors[mapped.source_id]
    assert(row.id === mapped.source_id && row.name === mapped.name, 'Operator mapping mismatch')
    return {
      id: `${version}:operator:${row.id}`, version, sourceId: row.id, operatorId: mapped.operator_id,
      rarity: row.quality + 1, maxStar: row.max_star, base: attributes(row.base),
      experience: table(row.experience), breakthrough: table(row.breakthrough),
      star: table(Object.fromEntries(Object.entries(row.star).filter(([key]) => Number(key) <= row.max_star))),
      potential: Object.fromEntries(Object.entries(row.potential).map(([key, value]) => [key, { step: value.step, attributes: attributes(value) }])),
      potentialExtra: table(row.potential_extra), awake: Object.keys(row.awake).length ? attributes(row.awake) : null,
    }
  })
  const starRules = Object.entries(stones.stones).map(([sourceId, row]) => {
    const series = Math.floor(Number(sourceId) / 10), quality = Number(sourceId) % 10
    assert(mapping.star_series.some(item => Number(item.source_series_id) === series && item.name === meta.series[series]), 'Star mapping mismatch')
    assert.equal(Object.keys(row.b).length, meta.maxBrk[sourceId])
    return {
      id: `${version}:star:${sourceId}`, version, sourceId, series, quality, kind: series < 200 ? 'main' : 'support',
      name: meta.series[series], maxLevel: meta.maxLevel[sourceId], levels: table(row.l),
      breakthrough: Object.fromEntries(Object.entries(row.b).map(([key, value]) => {
        assert.equal(value.brk, Number(key)); assert.equal(value.limit, Number(key) * 10)
        return [Number(key) - 1, attributes(value.a)]
      })),
    }
  })
  const ruleSet = {
    id: version, games: ['如鸢', '代号鸢'], operatorCount: operators.length, starCount: starRules.length,
    kizunas: Object.values(kizunas).map(row => ({
      series: row.compose,
      qualities: Object.fromEntries(Object.entries(row.props).map(([key, rows]) => {
        const sums = {}
        for (const item of Object.values(rows)) {
          assert(Number.isSafeInteger(item.amount) && item.amount >= 0)
          sums[item.id] = (sums[item.id] ?? 0) + item.amount
        }
        return [key, attributes(sums)]
      })),
    })),
  }
  return { ruleSet, operators, stars: starRules }
}

export function writePrivateBundle(path, bundle) {
  const parent = realpathSync(dirname(resolve(path)))
  for (let current = parent; ; current = dirname(current)) {
    assert(!existsSync(join(current, '.git')), 'Write private rule files outside Git worktrees')
    if (current === dirname(current)) break
  }
  writeFileSync(join(parent, path.split(/[\\/]/).at(-1)), JSON.stringify(bundle), { flag: 'wx', mode: 0o600 })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, mappingFile, version, output] = process.argv.slice(2)
  assert(source && mappingFile && version && output && process.argv.length === 6, 'Usage: node convert-rules.mjs <source-dir> <mapping.json> <version> <private-output.json>')
  const bundle = convertRules(source, JSON.parse(readFileSync(mappingFile, 'utf8')), version)
  writePrivateBundle(output, bundle)
  console.log(`Converted ${bundle.operators.length} operators and ${bundle.stars.length} stones; output is private and not activated.`)
}
