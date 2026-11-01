export function recordBarClass(span, fourStar = false) {
  return fourStar ? 'bar-count' : span == null || span === '' ? 'bar-unknown' : Number(span) <= 20 ? 'bar-low' : Number(span) <= 30 ? 'bar-mid' : 'bar-high'
}

export function recordSpanWidth(span, fourStar = false) {
  return fourStar ? '0%' : span == null || span === '' ? '100%' : Math.min(Number(span) / 40, 1) * 100 + '%'
}
