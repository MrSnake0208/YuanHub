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

export const FRONTEND_HIDDEN_ITEM_IDS = Object.freeze(['zhuangjinboli'])

const GAME_BAG_POSITION = new Map(GAME_BAG_ITEM_IDS.map(function (id, index) { return [id, index] }))
const STOCK_EDIT_LEADING_IDS = ['jizhi', 'mazi', 'sherou', 'zhuyu', 'baijinbi']
const CULTIVATION_SUBCATEGORIES = Object.freeze([
  { id: 'mirror', name: '镜', itemIds: ['xinghanjing', 'shuijing', 'baoshijing', 'liujinjing', 'liubojing', 'tongjing'] },
  { id: 'fan', name: '扇', itemIds: ['beihuifengshan', 'xianmenshan', 'yushan', 'jinsishan', 'cuishan', 'juanshan'] },
  { id: 'wine', name: '酒', itemIds: ['mulanzhuilu', 'bawanglei', 'lingshanquan', 'baimozhijiu', 'qingjiu', 'zhuojiu'] }
])

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

export function withCultivationSubcategories(sections) {
  return sections.map(function (section) {
    if (section.name !== '修为进阶材料') return section
    const entryById = new Map(section.entries.map(function (entry) { return [entry.id, entry] }))
    const placedIds = new Set()
    const subsections = CULTIVATION_SUBCATEGORIES.map(function (subcategory) {
      const entries = subcategory.itemIds.map(function (id) { return entryById.get(id) }).filter(Boolean)
      entries.forEach(function (entry) { placedIds.add(entry.id) })
      return { id: subcategory.id, name: subcategory.name, entries: entries }
    }).filter(function (subcategory) { return subcategory.entries.length > 0 })
    const otherEntries = section.entries.filter(function (entry) { return !placedIds.has(entry.id) })
    if (otherEntries.length) subsections.push({ id: 'other', name: '其他', entries: otherEntries })
    return Object.assign({}, section, { subsections: subsections })
  })
}
