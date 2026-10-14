export function recordBarClass(span, fourStar = false) {
  return fourStar ? 'bar-count' : span == null || span === '' ? 'bar-unknown' : Number(span) <= 20 ? 'bar-low' : Number(span) <= 30 ? 'bar-mid' : 'bar-high'
}

export function recordSpanWidth(span, fourStar = false) {
  return fourStar ? '0%' : span == null || span === '' ? '100%' : Math.min(Number(span) / 40, 1) * 100 + '%'
}

export function knownGoldAverage(events) {
  const samples = events.filter(event => !event.deleted_at && Number(event.agent_snapshot?.rarity) === 5 && Number.isSafeInteger(event.pull_span) && event.pull_span > 0)
  return { count: samples.length, value: samples.length ? Math.round(samples.reduce((sum, event) => sum + event.pull_span, 0) / samples.length * 10) / 10 : null }
}

// 输入沿服务端最早→最新顺序；每池首条出金按产品约定视为小保底。
export function smallPityRate(events) {
  let guaranteed = false, wins = 0, count = 0
  for (const event of events) {
    if (event.deleted_at || Number(event.agent_snapshot?.rarity) === 4) continue
    if (Number(event.agent_snapshot?.rarity) !== 5 || !['up', 'non_up'].includes(event.up_status)) return null
    if (guaranteed) {
      if (event.up_status !== 'up') return null
      guaranteed = false
    } else {
      count++
      if (event.up_status === 'up') wins++
      else guaranteed = true
    }
  }
  return { wins, count, value: count ? Math.round(wins / count * 1000) / 10 : null }
}
