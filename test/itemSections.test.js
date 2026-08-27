import test from 'node:test'
import assert from 'node:assert/strict'
import { ITEM_CATALOG } from '../src/data/inventory/catalog.js'
import { GAME_BAG_ITEM_IDS, buildItemCategorySections, sortItemsByGameOrder, sortStockEditItems, visibleInventoryItems } from '../src/data/inventory/itemSections.js'

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

test('调整库存时只展示四种鸟食并置顶', function () {
  const sorted = sortStockEditItems(visibleInventoryItems(ITEM_CATALOG))

  assert.deepEqual(sorted.slice(0, 5).map(function (item) { return item.name }), ['鸡炙', '麻籽', '蛇肉', '茱萸', '六韬兵书'])
  assert.equal(sorted.some(function (item) { return item.name === '白金币' }), false)
})

test('资源道具顺序不受当前库存返回顺序影响', function () {
  const resourceNames = ['鸡炙', '麻籽', '蛇肉', '茱萸', '白金币']
  const shuffled = ITEM_CATALOG.filter(function (item) { return resourceNames.includes(item.name) }).reverse()
  const sorted = sortItemsByGameOrder(shuffled)

  assert.deepEqual(sorted.map(function (item) { return item.name }), resourceNames)
})

test('追踪清单不展示装金玻璃和白金币', function () {
  const visible = visibleInventoryItems(ITEM_CATALOG)

  assert.equal(visible.some(function (item) { return item.name === '装金玻璃' }), false)
  assert.equal(visible.some(function (item) { return item.name === '白金币' }), false)
  assert.equal(visible.length, ITEM_CATALOG.length - 2)
})

test('类别模式只展示资源道具和密探养成资源且不遗漏道具', function () {
  const sections = buildItemCategorySections(sortItemsByGameOrder(visibleInventoryItems(ITEM_CATALOG)))
  const flattened = sections.flatMap(function (section) { return section.entries })

  assert.deepEqual(sections.map(function (section) { return section.name }), ['资源道具', '密探养成资源'])
  assert.equal(flattened.length, ITEM_CATALOG.length - 2)
  assert.equal(new Set(flattened.map(function (item) { return item.id })).size, ITEM_CATALOG.length - 2)
})

test('资源道具分为鸟食礼包、命盘&星石、密探经验三行资源架', function () {
  const sections = buildItemCategorySections(sortItemsByGameOrder(visibleInventoryItems(ITEM_CATALOG)))
  const resourceSection = sections[0]

  assert.equal(resourceSection.subsectionLayout, 'shelves')
  assert.deepEqual(resourceSection.subsections.map(function (section) { return section.name }), ['鸟食礼包', '命盘&星石', '密探经验'])
  assert.deepEqual(resourceSection.subsections[0].entries.map(function (item) { return item.name }), ['鸡炙', '麻籽', '蛇肉', '茱萸'])
  assert.deepEqual(resourceSection.subsections[1].entries.map(function (item) { return item.name }), [
    '功过格', '善恶簿', '骨算筹', '金算筹', '解殃瓶', '解谪瓶', '解注瓶'
  ])
  assert.deepEqual(resourceSection.subsections[2].entries.map(function (item) { return item.name }), ['六韬兵书', '兵书全卷', '兵书残卷'])
})

test('密探养成资源三个子类别使用全宽行布局并保持游戏顺序', function () {
  const sections = buildItemCategorySections(sortItemsByGameOrder(visibleInventoryItems(ITEM_CATALOG)))
  const development = sections[1]

  assert.equal(development.subsectionLayout, 'rows')
  assert.deepEqual(development.subsections.map(function (section) { return section.name }), ['修为进阶材料', '等级突破材料', '羁绊突破材料'])
  assert.deepEqual(development.subsections[0].entries.map(function (item) { return item.name }), [
    '星汉镜', '水镜', '悲回风扇', '仙门扇', '木兰坠露', '霸王泪', '宝石镜', '鎏金镜',
    '羽扇', '金丝扇', '灵山泉', '百末旨酒', '六博镜', '铜镜', '翠扇', '绢扇', '清酒', '浊酒'
  ])
  assert.deepEqual(development.subsections[0].subgroups.map(function (group) { return group.name }), [
    '火&风（扇）', '地&水（露、泪、酒、泉）', '阴&阳（镜）'
  ])
  assert.deepEqual(development.subsections[0].subgroups[0].entries.map(function (item) { return item.name }), [
    '悲回风扇', '仙门扇', '羽扇', '金丝扇', '翠扇', '绢扇'
  ])
  assert.deepEqual(development.subsections[0].subgroups[1].entries.map(function (item) { return item.name }), [
    '木兰坠露', '霸王泪', '灵山泉', '百末旨酒', '清酒', '浊酒'
  ])
  assert.deepEqual(development.subsections[0].subgroups[2].entries.map(function (item) { return item.name }), [
    '星汉镜', '水镜', '宝石镜', '鎏金镜', '六博镜', '铜镜'
  ])
  assert.equal(development.subsections[0].subgroups.flatMap(function (group) { return group.entries }).length, 18)
  assert.deepEqual(development.subsections[2].entries.map(function (item) { return item.name }), [
    '怀阴金锁', '阳明金锁', '天风金锁', '火源金锁', '水心金锁', '载地金锁'
  ])
})
