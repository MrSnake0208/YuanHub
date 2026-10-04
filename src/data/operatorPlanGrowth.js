import { operatorBaseId, isMovieOperator } from '../utils/operatorForms.js'
import { getMaxEliteForLevel } from '../utils/operatorGrowthRules.js'
import { calculateLevelRequirements, calculateXiuweiRequirements, calculateStarRequirements, starStageFromLevel } from './operatorRequirements.js'

export function normalizeGrowthTarget(row, saved = {}) {
  const movie = isMovieOperator(row)
  const level = Math.max(Number(row.level) || 0, Math.min(100, Number(saved.level ?? 100) || 0))
  const elite = Math.max(Number(row.elite) || 0, Math.min(getMaxEliteForLevel(level), Number(saved.elite ?? 17) || 0))
  const currentStar = Number(row.starLevel) || 0
  const star = Math.min(movie ? 5 : 31, Math.max(0, Number(saved.starLevel ?? (movie ? currentStar : 7)) || 0))
  const stage = movie ? Number : starStageFromLevel
  return { level, elite, starLevel: stage(star) < stage(currentStar) ? currentStar : star, revision: Number(saved.revision) || 0 }
}

// Shared progress is purchased through the base form. Only one selected row owns its cost.
export function sharedPlanCalculations(catalog, currentById, selectedIds, targetFor) {
  const byId = Object.fromEntries(catalog.map(entry => [entry.id, entry]))
  const groups = new Map()
  for (const entry of catalog.filter(entry => selectedIds.has(entry.id))) {
    const baseId = operatorBaseId(entry)
    if (!groups.has(baseId)) groups.set(baseId, [])
    groups.get(baseId).push(entry)
  }
  const result = {}
  for (const [baseId, forms] of groups) {
    const base = byId[baseId]
    const owner = forms.find(entry => entry.id === baseId) || forms[0]
    const current = currentById[baseId] || forms.map(entry => currentById[entry.id]).find(Boolean) || {}
    const targets = forms.map(entry => targetFor({ ...entry, ...currentById[entry.id] }))
    const levelTarget = Math.max(...targets.map(target => target.level))
    const eliteTarget = Math.max(...targets.map(target => target.elite))
    const prof = Array.isArray(base?.prof) ? base.prof[0] : String(base?.prof || '').split('、')[0]
    const subProf = Array.isArray(base?.subProf) ? base.subProf[0] : base?.subProf
    const job = ['风', '火'].includes(prof) ? 'fh' : ['水', '地'].includes(prof) ? 'ds' : 'yy'
    forms.forEach((entry, index) => {
      const ownsCost = entry.id === owner.id && Boolean(base)
      const star = Number(currentById[entry.id]?.starLevel) || 0
      result[entry.id] = {
        level: calculateLevelRequirements(current.level || 0, ownsCost ? levelTarget : current.level || 0, subProf),
        xiuwei: calculateXiuweiRequirements(current.elite || 0, ownsCost ? eliteTarget : current.elite || 0, job),
        star: isMovieOperator(entry)
          ? { heart: 0, money: 0, items: {}, unsupported: targets[index].starLevel > star }
          : calculateStarRequirements(star, targets[index].starLevel),
        sharedTarget: { level: levelTarget, elite: eliteTarget },
        sharedCostOwner: owner.name || owner.id,
        sharedGrowth: forms.length > 1 || isMovieOperator(entry),
        sharedUnsupported: !base,
      }
    })
  }
  return result
}
