export const OPERATOR_LEVEL_MAX = 100
export const OPERATOR_ELITE_MAX = 17

// 修为 1 为初始阶段；后续修为按以下等级节点逐步解锁。
// 1–9 → 1，10–14 → 2，15–29 → 3，30–39 → 4，
// 40–44 → 5，45–49 → 6，之后每 5 级提升 1，100 级 → 17。
export const OPERATOR_ELITE_UNLOCK_LEVELS = Object.freeze([
  1,
  10,
  15,
  30,
  40,
  45,
  50,
  55,
  60,
  65,
  70,
  75,
  80,
  85,
  90,
  95,
  100,
])

export function getMaxEliteForLevel(level) {
  const normalizedLevel = Math.min(
    OPERATOR_LEVEL_MAX,
    Math.max(0, Math.trunc(Number(level) || 0)),
  )
  if (normalizedLevel <= 0) return 0

  let maxElite = 0
  for (const unlockLevel of OPERATOR_ELITE_UNLOCK_LEVELS) {
    if (normalizedLevel < unlockLevel) break
    maxElite += 1
  }
  return Math.min(OPERATOR_ELITE_MAX, maxElite)
}
