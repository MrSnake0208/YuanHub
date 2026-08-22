// 固定的密探养成需求规则，整理自 docs/reference/yuan-operator-calculator。
// 规则不随账号版本切换；库存主键使用 YuanHub catalog.js 的稳定 id。

export const OPERATOR_REQUIREMENT_SOURCE = 'Wiki 密探计算器 · v9 · revision 93628'

const LEVEL_EXP = [
  0, 0, 100, 100, 100, 100, 100, 100, 100, 100, 100,
  100, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300,
  1200, 1200, 1200, 1200, 1200, 1600, 2000, 2400, 2800, 3200,
  3500, 3800, 4100, 4400, 4700, 5100, 5500, 6000, 6500, 7000,
  7500, 8000, 8500, 9000, 9500, 10100, 10700, 11400, 12100, 12800,
  13500, 14200, 14900, 15600, 16300, 17100, 17900, 18800, 19700, 20600,
  21500, 22400, 23300, 24200, 25100, 26100, 27100, 28300, 29500, 30700,
  31900, 33100, 34300, 35500, 36700, 38700, 40700, 42700, 44700, 46700,
  48700, 50700, 52700, 54700, 56700, 60200, 63700, 67200, 70700, 74200,
  77200, 80200, 83200, 86200, 89200, 92200, 95200, 98200, 101200
]

const BREAKTHROUGHS = [
  { level: 10, jianjia: 4, money: 20000 },
  { level: 20, jianjia: 8, money: 50000 },
  { level: 30, jianjia: 12, money: 80000, yuanyu: 10 },
  { level: 40, jianjia: 40, money: 100000, yuanyu: 30 },
  { level: 50, jianjia: 60, money: 200000, diguanghe: 40, zuigucao: 30 },
  { level: 60, jianjia: 90, money: 200000, diguanghe: 60 },
  { level: 70, jianjia: 120, money: 300000, zhuanShu70: 30, jincuodao: 80 },
  { level: 80, jianjia: 160, money: 300000, zhuanShu80: 30, yingqiongyao: 105 },
  { level: 90, money: 400000, ziyunying: 160, qingtingyan: 120 }
]

const PROFESSION_MATERIALS = {
  70: { 破军: 'tietaigong', 龙盾: 'caiwendun', 岐黄: 'qingtongdao', 神纪: 'zhentiangu', 诡道: 'menghunlan' },
  80: { 破军: 'xijiaogong', 龙盾: 'yuguidun', 岐黄: 'yinwendao', 神纪: 'panlonggu', 诡道: 'fujunhaitang' }
}

const STAR_REQUIREMENTS = [
  null,
  { heart: 2, money: 4000 }, { heart: 3, money: 6000 }, { heart: 5, money: 10000 },
  { heart: 5, money: 10000 }, { heart: 5, money: 10000 }, { heart: 5, money: 10000 },
  { heart: 15, money: 30000 }, { heart: 15, money: 30000 }, { heart: 15, money: 30000 },
  { heart: 15, money: 30000 }, { heart: 15, money: 30000 }, { heart: 30, money: 60000 },
  { heart: 20, money: 40000 }, { heart: 20, money: 40000 }, { heart: 20, money: 40000 },
  { heart: 25, money: 50000 }, { heart: 25, money: 50000 }, { heart: 40, money: 80000 },
  { heart: 40, money: 80000 }, { heart: 40, money: 80000 }, { heart: 40, money: 80000 },
  { heart: 40, money: 80000 }, { heart: 40, money: 80000 }, { heart: 80, money: 160000 },
  { heart: 100, money: 300000, zhuangjinboli: 1 }
]

const STAR_LABELS = [
  '1-0', '1-1', '1-2', '1-3', '1-4', '1-5', '一星升二星',
  '2-1', '2-2', '2-3', '2-4', '2-5', '二星升三星',
  '3-1', '3-2', '3-3', '3-4', '3-5', '三星升四星',
  '4-1', '4-2', '4-3', '4-4', '4-5', '四星升五星', '觉醒'
]

const XIUMEI_REQUIREMENTS = {
  2: [20, 0, 0, 0, 0, 0],
  3: [40, 0, 0, 0, 0, 0],
  4: [60, 50, 0, 0, 0, 0],
  5: [60, 80, 0, 0, 0, 0],
  6: [0, 80, 120, 0, 0, 0],
  7: [0, 100, 150, 0, 0, 0],
  8: [0, 120, 180, 0, 0, 0],
  9: [0, 140, 210, 0, 0, 0],
  10: [0, 0, 240, 360, 0, 0],
  11: [0, 0, 260, 390, 0, 0],
  12: [0, 0, 280, 420, 0, 0],
  13: [0, 0, 0, 440, 660, 0],
  14: [0, 0, 0, 460, 690, 0],
  15: [0, 0, 0, 480, 720, 0],
  16: [0, 0, 0, 0, 600, 900],
  17: [0, 0, 0, 0, 750, 1200]
}

const XIUMEI_MONEY = {
  2: 30000, 3: 50000, 4: 80000, 5: 80000, 6: 80000,
  7: 100000, 8: 100000, 9: 100000, 10: 150000, 11: 150000,
  12: 150000, 13: 200000, 14: 300000, 15: 300000, 16: 300000, 17: 350000
}

const XIUMEI_ITEMS = [
  ['juanshan', 'cuishan', 'jinsishan', 'yushan', 'xianmenshan', 'beihuifengshan'],
  ['zhuojiu', 'qingjiu', 'baimozhijiu', 'lingshanquan', 'bawanglei', 'mulanzhuilu'],
  ['tongjing', 'liubojing', 'liujinjing', 'baoshijing', 'shuijing', 'xinghanjing']
]

function numberBetween(value, min, max) {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function add(map, id, count) {
  if (!id || !count) return
  map[id] = (map[id] || 0) + count
}

export function starStageFromLevel(starLevel) {
  const n = Math.trunc(Number(starLevel) || 0)
  if (n >= 31) return 25
  // 旧协议允许把 5 星节点写成 25..30；Wiki 计算器把它们视为
  // “四星升五星”之后、觉醒之前的同一阶段。
  if (n >= 25) return 24
  // YuanHub 的 1 表示 1星·0；Wiki 阶段 0 也表示 1-0。
  return numberBetween(n - 1, 0, 23)
}

export function starLabelForStage(stage) {
  return STAR_LABELS[numberBetween(stage, 0, 25)] || '1-0'
}

export function calculateLevelRequirements(currentLevel, targetLevel, subProf, skipBreakthroughMaterials) {
  const from = numberBetween(currentLevel, 0, 100)
  const to = numberBetween(targetLevel, 0, 100)
  const result = { experience: 0, money: 0, items: {}, books: { fragment: 0, complete: 0, sixTao: 0 } }
  if (to <= from) return result
  for (let level = from + 1; level <= to; level += 1) result.experience += LEVEL_EXP[level] || 0
  BREAKTHROUGHS.forEach(function (entry) {
    if (from <= entry.level && to > entry.level) {
      Object.keys(entry).forEach(function (key) {
        if (key === 'level' || key === 'zhuanShu70' || key === 'zhuanShu80') return
        if (key === 'money') result.money += entry[key]
        else if (!skipBreakthroughMaterials) add(result.items, key, entry[key])
      })
      const prof = String(subProf || '')
      if (!skipBreakthroughMaterials) {
        if (entry.zhuanShu70) add(result.items, PROFESSION_MATERIALS[70][prof], entry.zhuanShu70)
        if (entry.zhuanShu80) add(result.items, PROFESSION_MATERIALS[80][prof], entry.zhuanShu80)
      }
    }
  })
  result.books.fragment = Math.ceil(result.experience / 100)
  result.books.complete = Math.ceil(result.experience / 1000)
  result.books.sixTao = Math.ceil(result.experience / 10000)
  return result
}

export function calculateStarRequirements(currentStarLevel, targetStarLevel) {
  const from = starStageFromLevel(currentStarLevel)
  const to = starStageFromLevel(targetStarLevel)
  const result = { heart: 0, money: 0, items: {}, from, to }
  if (to <= from) return result
  for (let stage = from + 1; stage <= to; stage += 1) {
    const entry = STAR_REQUIREMENTS[stage] || {}
    result.heart += entry.heart || 0
    result.money += entry.money || 0
    Object.keys(entry).filter(function (key) { return key !== 'heart' && key !== 'money' }).forEach(function (key) {
      add(result.items, key, entry[key])
    })
  }
  return result
}

export function calculateXiuweiRequirements(currentElite, targetElite, job) {
  const from = numberBetween(currentElite, 0, 17)
  const to = numberBetween(targetElite, 0, 17)
  const result = { money: 0, items: {}, from, to }
  if (to <= from) return result
  const jobIndex = { fh: 0, ds: 1, yy: 2 }[job] == null ? 0 : { fh: 0, ds: 1, yy: 2 }[job]
  for (let level = Math.max(2, from + 1); level <= to; level += 1) {
    const costs = XIUMEI_REQUIREMENTS[level] || []
    add(result.items, XIUMEI_ITEMS[jobIndex][0], costs[0])
    add(result.items, XIUMEI_ITEMS[jobIndex][1], costs[1])
    add(result.items, XIUMEI_ITEMS[jobIndex][2], costs[2])
    add(result.items, XIUMEI_ITEMS[jobIndex][3], costs[3])
    add(result.items, XIUMEI_ITEMS[jobIndex][4], costs[4])
    add(result.items, XIUMEI_ITEMS[jobIndex][5], costs[5])
    result.money += XIUMEI_MONEY[level] || 0
  }
  return result
}

export function mergeRequirements(...requirements) {
  const result = { money: 0, heart: 0, items: {} }
  requirements.forEach(function (requirement) {
    if (!requirement) return
    result.money += Number(requirement.money) || 0
    result.heart += Number(requirement.heart) || 0
    Object.keys(requirement.items || {}).forEach(function (id) { add(result.items, id, requirement.items[id]) })
  })
  return result
}

export function netRequirement(requirement, stock) {
  const result = { money: requirement.money || 0, heart: requirement.heart || 0, items: {}, gaps: [] }
  Object.keys(requirement.items || {}).forEach(function (id) {
    const required = Number(requirement.items[id]) || 0
    const owned = Number(stock && stock[id]) || 0
    const gap = Math.max(required - owned, 0)
    result.items[id] = gap
    if (gap > 0) result.gaps.push({ id, required, owned, gap })
  })
  return result
}

export const OPERATOR_REQUIREMENT_DATA = {
  source: OPERATOR_REQUIREMENT_SOURCE,
  levelMax: 100,
  eliteMax: 17,
  starMax: 31,
  starLabels: STAR_LABELS,
  professionMaterials: PROFESSION_MATERIALS
}
