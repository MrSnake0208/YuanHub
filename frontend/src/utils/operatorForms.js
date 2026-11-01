export function operatorBaseId(entry) {
  return entry?.spOf || entry?.sp_of || entry?.id || ''
}

export function isMovieOperator(entry) {
  return Boolean(entry?.spOf || entry?.sp_of)
}

export function matchesOperatorQuality(entry, quality) {
  if (quality == null || quality === 'all') return true
  return isMovieOperator(entry) ? quality === 'movie' : Number(entry?.rarity) === Number(quality)
}

export function isRecruitmentOperator(entry, game) {
  return [4, 5].includes(Number(entry?.rarity)) && entry?.games?.includes(game)
}
