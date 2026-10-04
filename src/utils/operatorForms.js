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

export function isStandardRecruitmentOperator(entry, game) {
  return !isMovieOperator(entry) && Number(entry?.rarity) === 5 && entry?.games?.includes(game)
}
