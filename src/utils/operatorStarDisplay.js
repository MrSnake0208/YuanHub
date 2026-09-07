export const OPERATOR_STAR_LEVEL_AWAKEN = 31

export function starCardHasIcon(value) {
  const level = Number(value) || 0
  return level > 0 && level !== OPERATOR_STAR_LEVEL_AWAKEN
}

export function starCardNumber(value, spOf) {
  const level = Number(value) || 0
  return spOf ? level : Math.floor((level - 1) / 6) + 1
}

export function starCardNode(value) {
  return (Number(value) - 1) % 6
}

export function starCardFallback(value) {
  const level = Number(value) || 0
  if (level === 0) return '未拥有'
  if (level === OPERATOR_STAR_LEVEL_AWAKEN) return '觉醒'
  return level
}
