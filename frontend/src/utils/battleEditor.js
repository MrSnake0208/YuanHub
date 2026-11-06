export const BATTLE_STAR_SLOTS = ['主星1', '主星2', '主星3', '辅星1', '辅星2', '辅星3']

// 只识别账号快照的完整格式，旧自由文本留在原处，不能靠猜测拆分后覆盖。
export function battleStarFields(value) {
  const lines = String(value || '').split('\n')
  return BATTLE_STAR_SLOTS.map(label => {
    const matches = lines.flatMap((line, index) => {
      const match = line.match(new RegExp(`^${label}：[ ]*([^·\\n]+) · ([^·\\n]+) · (未知|\\d+)级 · (突破未知|突破\\d+)$`))
      return match ? [{ line: index, name: match[1].trim(), quality: match[2] === '品质未知' ? '' : match[2], level: match[3] === '未知' ? '' : match[3], breakthrough: match[4] === '突破未知' ? '' : match[4].slice(2) }] : []
    })
    return { label, line: -1, name: '', quality: '', level: '', breakthrough: '', ...(matches.length === 1 ? matches[0] : {}) }
  })
}

export function updateBattleStar(value, slot, field, content) {
  const fields = battleStarFields(value)
  if (!fields[slot] || !['name', 'quality', 'level', 'breakthrough'].includes(field)) throw new Error('星石字段无效。')
  const next = { ...fields[slot], [field]: String(content).trim() }
  if (next.line < 0 && String(value || '').split('\n').some(line => line.trim().startsWith(next.label + '：') || line.trim().startsWith(next.label + ':'))) throw new Error('该槽位已有无法识别或重复的内容，请先在原文本中整理；原内容未改。')
  if (field === 'name' && !next.name) { next.quality = ''; next.level = ''; next.breakthrough = '' }
  if ([next.name, next.quality].some(text => /[·\r\n]/.test(text))) throw new Error('名称与品质不能包含分隔符或换行。')
  if ([next.level, next.breakthrough].some(text => text && !/^\d{1,3}$/.test(text))) throw new Error('等级与突破请填写非负整数，未知可留空。')
  if (!next.name && [next.quality, next.level, next.breakthrough].some(Boolean)) throw new Error('请先填写星石名称，再设置等级、品质与突破。')
  const lines = String(value || '').split('\n')
  const line = next.name ? `${next.label}：${next.name} · ${next.quality || '品质未知'} · ${next.level || '未知'}级 · ${next.breakthrough ? '突破' + next.breakthrough : '突破未知'}` : ''
  if (next.line >= 0) lines.splice(next.line, 1, line)
  else if (line) { if (!value) lines.length = 0; lines.push(line) }
  const result = lines.join('\n')
  if (result.length > 300) throw new Error('星石配置最多 300 字；原内容未改，请在原文本中整理后再试。')
  return result
}

export function battleStarSummary(value, kind) {
  return String(value || '').split('\n').filter(line => line.trim().startsWith(kind)).join('\n')
}

export function moveBattleAction(actions, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= actions.length || to < 0 || to >= actions.length) return false
  if (from === to) return true
  const next = [...actions]
  next.splice(to, 0, next.splice(from, 1)[0])
  // 一次替换，避免同步草稿保存观察到中间状态。
  actions.splice(0, actions.length, ...next)
  return true
}
