const PROF_ORDER = ['阳', '阴', '火', '风', '水', '地', '混沌']
const SUB_PROF_ORDER = ['神纪', '诡道', '破军', '岐黄', '龙盾']

// 暂不在心纸清单和库存编辑中展示的限定变体。
export const HIDDEN_AGENT_IDS = new Set([
  'char_084_chendengsp',
  'char_085_shizimiaosp'
])

export function visibleAgentEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter(function (entry) {
    return !HIDDEN_AGENT_IDS.has(entry && entry.id)
  })
}

// The order shown by the in-game agent inventory. Names missing from this list
// have not been verified yet and are kept together at the end of the sort.
export const AGENT_BACKPACK_ORDER = [
  '司马徽', '黄盖', '张鲁', '张闿', '葛洪', '张角', '贾诩', '法正', '周忠', '虞翻',
  '张绣', '满宠', '张松', '酆公玖', '酆公珠', '诸葛亮', '祢衡', '徐庶', '庞统', '杨修',
  '董奉', '华佗', '朱然', '黄月英', '夏侯渊', '曹丕', '庞羲', '曹植', '郭嘉', '张昭',
  '张邈', '荀彧', '赵云', '陈应', '太史慈', '张飞', '蒯良', '程昱', '张修', '钟繇',
  '张燕', '蒯越', '诸葛诞', '甄宓', '张郃', '孟获', '孙权', '郭解', '孙静', '凌统',
  '孙尚香', '吕蒙', '陆逊', '孙辅', '士燮', '刘繇', '甘宁', '蔡琰', '简雍', '刘豹',
  '令狐茂', '孔融', '王粲', '周瑜', '司马孚', '郭女王', '诸葛瑾', '卢植', '戏学', '荀攸',
  '陈群', '刘璋', '董白', '张仲景', '夏侯惇', '吕布', '马腾', '安期', '马超', '张辽',
  '干吉', '鲁肃', '严白虎', '许曼', '陈登', '史子眇', '公孙珊', '文丑', '颜良', '许攸',
  '阿蝉', '第五天', '山九', '绣球', '飞云', '毛玠', '李真', '李脱', '伍丹', '崔烈',
  '鸢使', '蛾使', '甘缇'
]
const BACKPACK_ORDER_BY_NAME = new Map(AGENT_BACKPACK_ORDER.map(function (name, index) { return [name, index] }))

function favoriteSet(favoriteIds) {
  return favoriteIds instanceof Set ? favoriteIds : new Set(favoriteIds || [])
}

function selectedSet(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : [])
  return new Set(values.map(function (item) { return String(item) }))
}

export function agentReleaseOrder(id) {
  const match = /^char_(\d+)_/.exec(String(id || ''))
  return match ? Number(match[1]) : -1
}

export function agentBackpackOrder(entry) {
  const name = typeof entry === 'string' ? entry : entry && entry.name
  const rank = BACKPACK_ORDER_BY_NAME.get(String(name || ''))
  return rank == null ? AGENT_BACKPACK_ORDER.length : rank
}

export function compareAgentRelease(left, right) {
  const order = agentReleaseOrder(right && right.id) - agentReleaseOrder(left && left.id)
  if (order) return order
  return String(left && left.id || '').localeCompare(String(right && right.id || ''))
}

// 未声明 games 的旧目录项视为双版本通用，兼容库存本地兜底目录。
export function agentMatchesGame(entry, game) {
  if (!game || game === 'all') return true
  const games = entry && Array.isArray(entry.games) ? entry.games : []
  if (!games.length) return true
  return games.includes(game)
}

export function sortAgentEntries(entries, mode, favoriteIds, options) {
  const favorites = favoriteSet(favoriteIds)
  const settings = options || {}
  const direction = settings.direction === 'asc' ? 1 : (settings.direction === 'desc' ? -1 : ((mode === 'name' || mode === 'backpack') ? 1 : -1))
  return (Array.isArray(entries) ? entries : []).slice().sort(function (left, right) {
    if (settings.favoriteFirst || mode === 'favorite') {
      const favoriteDiff = Number(favorites.has(right.id)) - Number(favorites.has(left.id))
      if (favoriteDiff) return favoriteDiff
    }
    let primaryDiff = 0
    if (mode === 'count') {
      primaryDiff = (Number(left.count) || 0) - (Number(right.count) || 0)
    } else if (mode === 'rarity') {
      primaryDiff = (Number(left.rarity) || 0) - (Number(right.rarity) || 0)
    } else if (mode === 'name') {
      primaryDiff = String(left.name || left.id).localeCompare(String(right.name || right.id), 'zh-CN')
    } else if (mode === 'backpack') {
      primaryDiff = agentBackpackOrder(left) - agentBackpackOrder(right)
    } else {
      primaryDiff = agentReleaseOrder(left && left.id) - agentReleaseOrder(right && right.id)
    }
    if (primaryDiff) return primaryDiff * direction

    const rarityDiff = (Number(right.rarity) || 0) - (Number(left.rarity) || 0)
    if (rarityDiff) return rarityDiff
    return compareAgentRelease(left, right)
  })
}

export function filterAgentEntries(entries, filters, favoriteIds) {
  const options = filters || {}
  const favorites = favoriteSet(favoriteIds)
  const query = String(options.query || '').trim().toLowerCase()
  const statuses = selectedSet(options.statuses || options.status)
  const rarities = selectedSet(options.rarities || options.rarity)
  const profs = selectedSet(options.profs || options.prof)
  const subProfs = selectedSet(options.subProfs || options.subProf)
  return (Array.isArray(entries) ? entries : []).filter(function (entry) {
    const owned = (Number(entry.count) || 0) > 0
    if (!agentMatchesGame(entry, options.game)) return false
    if (statuses.size === 1 && statuses.has('owned') && !owned) return false
    if (statuses.size === 1 && statuses.has('missing') && owned) return false
    if ((options.favoriteOnly || options.favoriteMode === 'only') && !favorites.has(entry.id)) return false
    if (rarities.size && !rarities.has(String(entry.rarity))) return false
    if (profs.size && !profs.has(String(entry.prof))) return false
    if (subProfs.size && !subProfs.has(String(entry.subProf))) return false
    if (query) {
      const haystack = [entry.id, entry.name, entry.rarity, entry.prof, entry.subProf].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

function groupRank(groupBy, value) {
  if (groupBy === 'prof') {
    const index = PROF_ORDER.indexOf(value)
    return index === -1 ? PROF_ORDER.length : index
  }
  if (groupBy === 'subProf') {
    const index = SUB_PROF_ORDER.indexOf(value)
    return index === -1 ? SUB_PROF_ORDER.length : index
  }
  return 0
}

export function buildAgentGroups(entries, groupBy) {
  const list = Array.isArray(entries) ? entries : []
  if (!groupBy || groupBy === 'none') return [{ id: 'all', label: '', entries: list }]
  const groups = new Map()
  list.forEach(function (entry) {
    const value = String(entry[groupBy] || '未标注')
    if (!groups.has(value)) groups.set(value, [])
    groups.get(value).push(entry)
  })
  return Array.from(groups.entries()).map(function (pair) {
    return {
      id: groupBy + ':' + pair[0],
      label: pair[0],
      value: pair[0],
      entries: pair[1]
    }
  }).sort(function (left, right) {
    return groupRank(groupBy, left.value) - groupRank(groupBy, right.value) || left.value.localeCompare(right.value, 'zh-CN')
  })
}
