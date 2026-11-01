export function recruitmentGoldMetrics(summary, account = false) {
  const s = summary || {}
  const notApplicable = s.pity_status === 'not_applicable'
  const unavailable = notApplicable ? (account ? '当前账号没有适用的非永久 UP 池' : '无 UP 机制，不适用') : '统计尚未提供'
  const sampleNote = s.known_up_gold_count == null || s.up_gold_count == null || s.unknown_up_gold_count == null
    ? '样本统计尚未提供'
    : `UP ${s.up_gold_count} / 归属已知 ${s.known_up_gold_count} 条；未知 ${s.unknown_up_gold_count} 条（未计入比例）`
  const pityNote = s.pity_status === 'insufficient_history' ? '历史不足以推断' : s.pity_status === 'no_samples' ? '暂无五星样本' : ''
  const metrics = [
    { key: 'total-up', label: '总 UP 率', value: !notApplicable && s.total_up_rate != null ? `${s.total_up_rate}%` : '—', note: notApplicable ? unavailable : s.known_up_gold_count === 0 ? `暂无已知归属的五星样本；${sampleNote}` : sampleNote },
    { key: 'guaranteed-gold', label: '大保底次数', value: !notApplicable && s.guaranteed_gold_count != null ? `${s.guaranteed_gold_count} 次` : '—', note: notApplicable ? unavailable : pityNote || (s.guaranteed_gold_count == null ? unavailable : '已触发并实际出金') }
  ]
  if (!account) metrics.push({ key: 'small-pity', label: '小保底不歪率', value: !notApplicable && s.small_pity_win_rate != null ? `${s.small_pity_win_rate}%` : '—', note: notApplicable ? unavailable : pityNote || (s.small_pity_win_rate == null ? unavailable : '仅统计小保底，不含保证 UP') })
  return metrics
}
