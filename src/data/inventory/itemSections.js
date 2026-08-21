export const GAME_BAG_ITEM_IDS = Object.freeze([
  'zhuangjinboli',
  'liutaobingshu',
  'bingshuquanjuan',
  'bingshucanjuan',
  'fujunhaitang',
  'panlonggu',
  'yinwendao',
  'yuguidun',
  'xijiaogong',
  'menghunlan',
  'zhentiangu',
  'qingtongdao',
  'caiwendun',
  'tietaigong',
  'zuigucao',
  'qingtingyan',
  'ziyunying',
  'yingqiongyao',
  'jincuodao',
  'diguanghe',
  'yuanyu',
  'jianjia',
  'xinghanjing',
  'shuijing',
  'beihuifengshan',
  'xianmenshan',
  'mulanzhuilu',
  'bawanglei',
  'baoshijing',
  'liujinjing',
  'yushan',
  'jinsishan',
  'lingshanquan',
  'baimozhijiu',
  'liubojing',
  'tongjing',
  'cuishan',
  'juanshan',
  'qingjiu',
  'zhuojiu',
  'jieyangping',
  'gongguoge',
  'jinsuanchou',
  'gusuanchou',
  'jiezheping',
  'shanebu',
  'jiezhuping',
  'huaiyinjinsuo',
  'yangmingjinsuo',
  'tianfengjinsuo',
  'huoyuanjinsuo',
  'shuixinjinsuo',
  'zaidijinsuo',
  'jizhi',
  'mazi',
  'sherou',
  'zhuyu',
  'baijinbi'
])

export const FRONTEND_HIDDEN_ITEM_IDS = Object.freeze(['zhuangjinboli', 'baijinbi'])

const GAME_BAG_POSITION = new Map(GAME_BAG_ITEM_IDS.map(function (id, index) { return [id, index] }))
const STOCK_EDIT_LEADING_IDS = ['jizhi', 'mazi', 'sherou', 'zhuyu', 'baijinbi']
const RESOURCE_SUBCATEGORIES = Object.freeze([
  { id: 'bird-food-pack', name: '鸟食礼包', itemIds: ['jizhi', 'mazi', 'sherou', 'zhuyu', 'baijinbi'] },
  { id: 'divination-stone', name: '命盘&星石', itemIds: ['gongguoge', 'shanebu', 'gusuanchou', 'jinsuanchou', 'jieyangping', 'jiezheping', 'jiezhuping'] },
  { id: 'agent-experience', name: '密探经验', itemIds: ['liutaobingshu', 'bingshuquanjuan', 'bingshucanjuan'] }
])
const CULTIVATION_SUBGROUPS = Object.freeze([
  { id: 'fire-wind', name: '火&风', itemIds: ['beihuifengshan', 'xianmenshan', 'yushan', 'jinsishan', 'cuishan', 'juanshan'] },
  { id: 'earth-water', name: '地&水', itemIds: ['mulanzhuilu', 'bawanglei', 'lingshanquan', 'baimozhijiu', 'qingjiu', 'zhuojiu'] },
  { id: 'yin-yang', name: '阴&阳', itemIds: ['xinghanjing', 'shuijing', 'baoshijing', 'liujinjing', 'liubojing', 'tongjing'] }
])
const AGENT_EXPERIENCE_IDS = new Set(RESOURCE_SUBCATEGORIES[2].itemIds)

export function sortItemsByGameOrder(entries) {
  return entries
    .map(function (entry, index) { return { entry: entry, sourceIndex: index } })
    .sort(function (a, b) {
      const aPosition = GAME_BAG_POSITION.has(a.entry.id) ? GAME_BAG_POSITION.get(a.entry.id) : Infinity
      const bPosition = GAME_BAG_POSITION.has(b.entry.id) ? GAME_BAG_POSITION.get(b.entry.id) : Infinity
      return aPosition - bPosition || a.sourceIndex - b.sourceIndex
    })
    .map(function (wrapped) { return wrapped.entry })
}

export function visibleInventoryItems(entries) {
  const hiddenIds = new Set(FRONTEND_HIDDEN_ITEM_IDS)
  return entries.filter(function (entry) { return !hiddenIds.has(entry.id) })
}

export function sortStockEditItems(entries) {
  const leadingPosition = new Map(STOCK_EDIT_LEADING_IDS.map(function (id, index) { return [id, index] }))
  return sortItemsByGameOrder(entries).sort(function (a, b) {
    const aPosition = leadingPosition.has(a.id) ? leadingPosition.get(a.id) : Infinity
    const bPosition = leadingPosition.has(b.id) ? leadingPosition.get(b.id) : Infinity
    return aPosition - bPosition
  })
}

export function groupItemsByCategory(entries, categoryOrder, categoryAliases) {
  const groups = new Map()
  entries.forEach(function (entry) {
    const sourceCategory = entry.category || '未分类'
    const category = (categoryAliases && categoryAliases[sourceCategory]) || sourceCategory
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category).push(entry)
  })

  const order = new Map((categoryOrder || []).map(function (category, index) { return [category, index] }))
  return Array.from(groups, function ([name, categoryEntries], sourceIndex) {
    return { id: name, name: name, entries: categoryEntries, sourceIndex: sourceIndex }
  }).sort(function (a, b) {
    const aPosition = order.has(a.name) ? order.get(a.name) : Infinity
    const bPosition = order.has(b.name) ? order.get(b.name) : Infinity
    return aPosition - bPosition || a.sourceIndex - b.sourceIndex
  }).map(function (section) {
    return { id: section.id, name: section.name, entries: section.entries }
  })
}

export function buildItemCategorySections(entries) {
  const entryById = new Map(entries.map(function (entry) { return [entry.id, entry] }))
  const resourceSubsections = RESOURCE_SUBCATEGORIES.map(function (subcategory) {
    return {
      id: subcategory.id,
      name: subcategory.name,
      entries: subcategory.itemIds.map(function (id) { return entryById.get(id) }).filter(Boolean)
    }
  })
  const cultivationEntries = entries.filter(function (entry) { return entry.category === '修为进阶材料' })
  const cultivationSubgroups = CULTIVATION_SUBGROUPS.map(function (subgroup) {
    return {
      id: subgroup.id,
      name: subgroup.name,
      entries: subgroup.itemIds.map(function (id) { return entryById.get(id) }).filter(Boolean)
    }
  })
  const developmentSubsections = [
    {
      id: 'cultivation',
      name: '修为进阶材料',
      entries: cultivationEntries,
      subgroups: cultivationSubgroups
    },
    {
      id: 'level-breakthrough',
      name: '等级突破材料',
      entries: entries.filter(function (entry) {
        return entry.category === '密探突破材料' && !AGENT_EXPERIENCE_IDS.has(entry.id)
      })
    },
    {
      id: 'bond-breakthrough',
      name: '羁绊突破材料',
      entries: entries.filter(function (entry) { return entry.category === '养成材料' })
    }
  ]

  return [
    {
      id: 'resources',
      name: '资源道具',
      entries: resourceSubsections.flatMap(function (section) { return section.entries }),
      primaryEntries: [],
      subsectionLayout: 'shelves',
      subsections: resourceSubsections
    },
    {
      id: 'agent-development',
      name: '密探养成资源',
      entries: developmentSubsections.flatMap(function (section) { return section.entries }),
      primaryEntries: [],
      subsectionLayout: 'rows',
      subsections: developmentSubsections
    }
  ]
}
