export const milestoneLabel = key => key === 'star_1' ? '首次获得' : key === 'awakening' ? '觉醒' : `${key.slice(5)} 星`

export function elapsedDays(from, to) {
  if (!from || !to) return null
  const start = Date.parse(from + 'T00:00:00Z'), end = Date.parse(to + 'T00:00:00Z')
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 86400000) : null
}

export function milestoneRows(milestones, dates) {
  return milestones.map((item, index) => ({
    ...item,
    label: milestoneLabel(item.key),
    previousDays: index ? elapsedDays(dates[milestones[index - 1].key], dates[item.key]) : null,
    totalDays: index ? elapsedDays(dates.star_1, dates[item.key]) : null,
  }))
}
