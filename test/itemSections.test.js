import test from 'node:test'
import assert from 'node:assert/strict'
import { ITEM_CATEGORIES, ITEM_CATALOG } from '../src/data/inventory/catalog.js'
import { GAME_BAG_ITEM_IDS, groupItemsByCategory, sortItemsByGameOrder, sortStockEditItems, visibleInventoryItems, withCultivationSubcategories } from '../src/data/inventory/itemSections.js'

const GAME_BAG_ORDER = [
  '装金玻璃', '六韬兵书', '兵书全卷', '兵书残卷', '府君海棠', '蟠龙鼓', '银纹刀', '玉龟盾', '犀角弓',
  '梦魂兰', '震天鼓', '青铜刀', '彩纹盾', '铁胎弓', '醉骨草', '蜻蜓眼', '紫云英', '瑛琼瑶', '金错刀',
  '低光荷', '鸢羽', '蒹葭', '星汉镜', '水镜', '悲回风扇', '仙门扇', '木兰坠露', '霸王泪', '宝石镜', '鎏金镜',
  '羽扇', '金丝扇', '灵山泉', '百末旨酒', '六博镜', '铜镜', '翠扇', '绢扇', '清酒', '浊酒', '解殃瓶', '功过格', '金算筹',
  '骨算筹', '解谪瓶', '善恶簿', '解注瓶', '怀阴金锁', '阳明金锁', '天风金锁', '火源金锁', '水心金锁', '载地金锁',
  '鸡炙', '麻籽', '蛇肉', '茱萸', '白金币'
]

test('背包游戏顺序覆盖指定道具', function () {
  const catalogById = new Map(ITEM_CATALOG.map(function (item) { return [item.id, item] }))
  const configuredEntries = GAME_BAG_ITEM_IDS.map(function (id) { return catalogById.get(id) })

  assert.equal(configuredEntries.includes(undefined), false)
  assert.deepEqual(configuredEntries.map(function (item) { return item.name }), GAME_BAG_ORDER)
})

test('目录道具按固定顺序完整排列', function () {
  const sorted = sortItemsByGameOrder(ITEM_CATALOG)

  assert.equal(sorted.length, ITEM_CATALOG.length)
  assert.deepEqual(sorted.slice(-5).map(function (item) { return item.name }), ['鸡炙', '麻籽', '蛇肉', '茱萸', '白金币'])
})

test('调整库存时四种鸟食和白金币置顶', function () {
  const sorted = sortStockEditItems(visibleInventoryItems(ITEM_CATALOG))

  assert.deepEqual(sorted.slice(0, 6).map(function (item) { return item.name }), ['鸡炙', '麻籽', '蛇肉', '茱萸', '白金币', '六韬兵书'])
})

test('资源道具顺序不受当前库存返回顺序影响', function () {
  const resourceNames = ['鸡炙', '麻籽', '蛇肉', '茱萸', '白金币']
  const shuffled = ITEM_CATALOG.filter(function (item) { return resourceNames.includes(item.name) }).reverse()
  const sorted = sortItemsByGameOrder(shuffled)

  assert.deepEqual(sorted.map(function (item) { return item.name }), resourceNames)
})

test('前端暂不展示装金玻璃', function () {
  const visible = visibleInventoryItems(ITEM_CATALOG)

  assert.equal(visible.some(function (item) { return item.name === '装金玻璃' }), false)
  assert.equal(visible.length, ITEM_CATALOG.length - 1)
})

test('类别模式使用目录 category 分组且不遗漏道具', function () {
  const resourceCategories = ['未分类', '鸟食', '货币']
  const aliases = { '未分类': '资源道具', '鸟食': '资源道具', '货币': '资源道具' }
  const displayCategories = ['资源道具'].concat(ITEM_CATEGORIES.filter(function (category) { return !resourceCategories.includes(category) }))
  const sections = groupItemsByCategory(sortItemsByGameOrder(visibleInventoryItems(ITEM_CATALOG)), displayCategories, aliases)
  const flattened = sections.flatMap(function (section) { return section.entries })

  assert.deepEqual(sections.map(function (section) { return section.name }), displayCategories)
  assert.equal(flattened.length, ITEM_CATALOG.length - 1)
  assert.equal(new Set(flattened.map(function (item) { return item.id })).size, ITEM_CATALOG.length - 1)
  sections.filter(function (section) { return section.name !== '资源道具' }).forEach(function (section) {
    assert.equal(section.entries.every(function (item) { return item.category === section.name }), true)
  })
  const resourceSection = sections[0]
  assert.equal(resourceSection.name, '资源道具')
  assert.deepEqual(resourceSection.entries.map(function (item) { return item.name }), ['鸡炙', '麻籽', '蛇肉', '茱萸', '白金币'])
  assert.equal(resourceSection.entries.every(function (item) { return resourceCategories.includes(item.category) }), true)
})

test('修为进阶材料分为镜、扇、酒三个子类别', function () {
  const categories = groupItemsByCategory(sortItemsByGameOrder(visibleInventoryItems(ITEM_CATALOG)), ITEM_CATEGORIES)
  const sections = withCultivationSubcategories(categories)
  const cultivation = sections.find(function (section) { return section.name === '修为进阶材料' })

  assert.deepEqual(cultivation.subsections.map(function (section) { return section.name }), ['镜', '扇', '酒'])
  assert.deepEqual(cultivation.subsections.map(function (section) { return section.entries.map(function (item) { return item.name }) }), [
    ['星汉镜', '水镜', '宝石镜', '鎏金镜', '六博镜', '铜镜'],
    ['悲回风扇', '仙门扇', '羽扇', '金丝扇', '翠扇', '绢扇'],
    ['木兰坠露', '霸王泪', '灵山泉', '百末旨酒', '清酒', '浊酒']
  ])
  assert.equal(cultivation.subsections.flatMap(function (section) { return section.entries }).length, cultivation.entries.length)
})
