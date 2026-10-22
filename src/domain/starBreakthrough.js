const levelCaps = { white: 30, green: 40, blue: 50, purple: 60, orange: 60 }

export function starBreakthroughOptions(star) {
  const maximum = levelCaps[star?.quality]
  const level = star?.level
  if (!Number.isInteger(level) || level < 1 || !maximum || level > maximum) return []
  const lower = Math.floor((level - 1) / 10), upper = Math.min(Math.floor(level / 10), maximum / 10 - 1)
  return lower === upper ? [lower] : [lower, upper]
}

export function starBreakthroughPatch(state, changes) {
  return {
    expected_generation: state.generation, expected_revision: state.revision,
    inventory: state.inventory.map(star => ({
      instance_id: star.instance_id, kind: star.kind, name: star.name, quality: star.quality, level: star.level,
      ...(Object.hasOwn(changes, star.instance_id) ? { breakthrough_stage: changes[star.instance_id] } : {}),
    })),
    plan_targets: state.plan_targets, experience: state.experience, bag: state.bag,
  }
}
