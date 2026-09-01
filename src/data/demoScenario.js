// Stable, local-only fixture for the public growth-planning demonstration.

export const VALID_DEMO_VIEWS = ['overview', 'targets', 'materials', 'operator']

export const DEMO_SCENARIO = {
  account: {
    name: '广陵王的示例存档',
    game: '如鸢 · 3.0 版本',
    updatedAt: '2026-08-16'
  },
  summary: {
    favoriteCount: 3,
    acquiredHeartPaper: 28,
    periodDays: 30
  },
  materials: [
    { id: 'baimozhijiu', name: '百末旨酒', category: '修为材料', owned: 112, required: 160, acquired7d: 36, acquired30d: 152 },
    { id: 'jincuodao', name: '金错刀', category: '修为材料', owned: 18, required: 40, acquired7d: 8, acquired30d: 35 },
    { id: 'yangmingjinsuo', name: '阳明金锁', category: '养成材料', owned: 7, required: 20, acquired7d: 3, acquired30d: 12 },
    { id: 'gongguoge', name: '功过格', category: '命盘材料', owned: 4, required: 10, acquired7d: 0, acquired30d: 0 },
    { id: 'jiezheping', name: '解谪瓶', category: '星石材料', owned: 12, required: 12, acquired7d: 1, acquired30d: 6 }
  ],
  operators: [
    {
      id: 'char_001_yangxiu',
      name: '杨修',
      avatar: '/inventory-icons/agents/char_001_yangxiu.png',
      prof: '阳',
      subProf: '神纪',
      level: 80,
      targetLevel: 90,
      elite: 12,
      targetElite: 15,
      starLevel: 25,
      targetStarLevel: 29,
      heartOwned: 14,
      heartRequired: 20,
      priority: '本周优先',
      loadout: '命盘 4 · 星石 2',
      combat: { attack: 4820, hp: 18640 },
      growthCosts: {
        level: { baimozhijiu: 4, jincuodao: 1 },
        elite: { yangmingjinsuo: 2, gongguoge: 1 },
        starLevel: { jiezheping: 1 }
      }
    },
    {
      id: 'char_002_jiaxu',
      name: '贾诩',
      avatar: '/inventory-icons/agents/char_002_jiaxu.png',
      prof: '阴',
      subProf: '诡道',
      level: 75,
      targetLevel: 90,
      elite: 10,
      targetElite: 14,
      starLevel: 23,
      targetStarLevel: 27,
      heartOwned: 11,
      heartRequired: 20,
      priority: '随后安排',
      loadout: '命盘 3 · 星石 1',
      combat: { attack: 4510, hp: 17220 },
      growthCosts: {
        level: { baimozhijiu: 5, jincuodao: 1 },
        elite: { yangmingjinsuo: 2, gongguoge: 1 },
        starLevel: { jiezheping: 1 }
      }
    },
    {
      id: 'char_003_sunshangxiang',
      name: '孙尚香',
      avatar: '/inventory-icons/agents/char_003_sunshangxiang.png',
      prof: '火',
      subProf: '破军',
      level: 70,
      targetLevel: 85,
      elite: 11,
      targetElite: 14,
      starLevel: 24,
      targetStarLevel: 28,
      heartOwned: 10,
      heartRequired: 18,
      priority: '资源充足后',
      loadout: '命盘 5 · 星石 2',
      combat: { attack: 4630, hp: 16580 },
      growthCosts: {
        level: { baimozhijiu: 3, jincuodao: 1 },
        elite: { yangmingjinsuo: 2, gongguoge: 1 },
        starLevel: { jiezheping: 1 }
      }
    }
  ]
}

function numeric(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function integer(value) {
  return Math.max(0, Math.round(numeric(value)))
}

export function normalizeDemoView(value) {
  return VALID_DEMO_VIEWS.includes(value) ? value : 'overview'
}

export function calculateGap(required, owned) {
  return Math.max(integer(required) - integer(owned), 0)
}

export function calculateEtaDays(gap, acquired30d) {
  const missing = integer(gap)
  const monthlyRate = numeric(acquired30d) / 30
  if (missing <= 0 || monthlyRate <= 0) return null
  return Math.ceil(missing / monthlyRate)
}

export function calculateMaterialPlan(material) {
  const required = integer(material && material.required)
  const owned = integer(material && material.owned)
  const acquired7d = integer(material && material.acquired7d)
  const acquired30d = integer(material && material.acquired30d)
  const gap = calculateGap(required, owned)
  return {
    ...material,
    required,
    owned,
    acquired7d,
    acquired30d,
    gap,
    rate7d: acquired7d / 7,
    rate30d: acquired30d / 30,
    etaDays: calculateEtaDays(gap, acquired30d)
  }
}

function targetDelta(operator, field) {
  const current = integer(operator && operator[field])
  const targetField = 'target' + field[0].toUpperCase() + field.slice(1)
  return Math.max(integer(operator && operator[targetField]) - current, 0)
}

export function calculateOperatorRequirements(operator) {
  const items = {}
  const costs = operator && operator.growthCosts ? operator.growthCosts : {}
  ;['level', 'elite', 'starLevel'].forEach(function (field) {
    const delta = targetDelta(operator, field)
    Object.entries(costs[field] || {}).forEach(function ([id, cost]) {
      items[id] = (items[id] || 0) + delta * integer(cost)
    })
  })
  const heartGap = calculateGap(operator && operator.heartRequired, operator && operator.heartOwned)
  if (heartGap > 0) items['heart-paper'] = heartGap
  return { items }
}

export function calculateOperatorProgress(operator) {
  const dimensions = [
    ['level', 'targetLevel'],
    ['elite', 'targetElite'],
    ['starLevel', 'targetStarLevel'],
    ['heartOwned', 'heartRequired']
  ]
  const ratios = dimensions.map(function ([currentField, targetField]) {
    const target = integer(operator && operator[targetField])
    return target > 0 ? Math.min(integer(operator && operator[currentField]) / target, 1) : 1
  })
  const percent = Math.round(ratios.reduce((total, ratio) => total + ratio, 0) / ratios.length * 100)
  return { percent, ratios, requirements: calculateOperatorRequirements(operator) }
}

export function calculateMaterialPlans(state) {
  const source = state || DEMO_SCENARIO
  const requiredById = {}
  ;(source.operators || []).forEach(function (operator) {
    const requirements = calculateOperatorRequirements(operator)
    Object.entries(requirements.items).forEach(function ([id, amount]) {
      requiredById[id] = (requiredById[id] || 0) + amount
    })
  })
  // 心纸按密探分别核算，不能混入共享材料库存，否则会把库存跨密探重复抵扣。
  return (source.materials || []).filter(function (material) {
    return material.id !== 'heart-paper'
  }).map(function (material) {
    return calculateMaterialPlan({ ...material, required: requiredById[material.id] || 0 })
  })
}

export function calculateDemoSummary(state) {
  const source = state || DEMO_SCENARIO
  const materials = calculateMaterialPlans(source)
  return {
    favoriteCount: (source.operators || []).length,
    materialCount: materials.length,
    totalRequired: materials.reduce((total, item) => total + item.required, 0),
    totalOwned: materials.reduce((total, item) => total + item.owned, 0),
    totalGap: materials.reduce((total, item) => total + item.gap, 0),
    acquiredHeartPaper: numeric(source.summary && source.summary.acquiredHeartPaper),
    periodDays: integer(source.summary && source.summary.periodDays)
  }
}

export function createDemoState(source = DEMO_SCENARIO) {
  return JSON.parse(JSON.stringify(source))
}

export function updateDemoTarget(state, operatorId, field, value) {
  const allowed = { level: 100, elite: 17, starLevel: 31 }
  if (!allowed[field]) return createDemoState(state)
  const next = createDemoState(state)
  const operator = next.operators.find(item => item.id === operatorId)
  if (!operator) return next
  const current = integer(operator[field])
  const target = Math.min(Math.max(integer(value), current), allowed[field])
  operator['target' + field[0].toUpperCase() + field.slice(1)] = target
  return next
}
