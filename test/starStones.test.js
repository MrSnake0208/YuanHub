import test from 'node:test'
import assert from 'node:assert/strict'
import { STAR_STONE_RESTRICTIONS } from '../src/data/starStones.js'

test('星石装备限制使用密探属性或职业定义', function () {
  assert.deepEqual(STAR_STONE_RESTRICTIONS.紫微, { subProf: ['龙盾'] })
  assert.deepEqual(STAR_STONE_RESTRICTIONS.破军, { subProf: ['破军'] })
  assert.deepEqual(STAR_STONE_RESTRICTIONS.天机, { subProf: ['神纪', '诡道'] })
  assert.deepEqual(STAR_STONE_RESTRICTIONS.文昌, { subProf: ['岐黄'] })
  assert.deepEqual(STAR_STONE_RESTRICTIONS.天魁, { prof: ['地'] })
  assert.deepEqual(STAR_STONE_RESTRICTIONS.天钺, { prof: ['水'] })
  assert.deepEqual(STAR_STONE_RESTRICTIONS.左辅, { prof: ['火'] })
  assert.deepEqual(STAR_STONE_RESTRICTIONS.右弼, { prof: ['风'] })
  assert.deepEqual(STAR_STONE_RESTRICTIONS.天马, { prof: ['阴'] })
  assert.deepEqual(STAR_STONE_RESTRICTIONS.擎羊, { prof: ['阳'] })
})
