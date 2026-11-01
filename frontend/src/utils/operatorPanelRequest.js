// Bind every response to the complete account/input key, including edits made during debounce.
export function createOperatorPanelRequest({ request, publish, delay = 250 }) {
  let sequence = 0, timer, current = null, disposed = false
  function update(value) {
    if (disposed) return
    current = value
    const token = ++sequence
    clearTimeout(timer)
    publish({ key: value?.key || '', status: value ? 'loading' : 'idle', result: null })
    if (!value) return
    timer = setTimeout(async () => {
      try {
        const result = await request(value.input)
        if (!disposed && token === sequence) publish({ key: value.key, status: 'ready', result })
      } catch (error) {
        if (!disposed && token === sequence) publish({ key: value.key, status: 'failed', result: null, error })
      }
    }, delay)
  }
  return {
    update,
    retry() { if (current) update(current) },
    dispose() { disposed = true; sequence++; clearTimeout(timer); current = null }
  }
}

export function operatorPanelHint(result, requestStatus) {
  if (requestStatus === 'loading') return '正在计算面板…'
  if (requestStatus === 'failed') return '面板计算失败，请重试'
  if (result?.status === 'incomplete') {
    const fields = result.missing_fields || []
    const labels = [...new Set(fields.map(field => {
      if (field.startsWith('loadout')) return '星石配装或突破'
      return ({ level: '等级', elite: '修为', level_breakthrough_stage: '等级突破', 'huaji.stage': '星级节点',
        'huaji.awakened': '觉醒', 'oddities.hp': '生命奇闻', 'oddities.attack': '攻击奇闻' })[field] || '养成信息'
    }))]
    return '请核对：' + labels.join('、')
  }
  if (result?.status === 'unsupported') return result.reason === 'not_owned' ? '拥有密探后可计算面板' : '该密探的自动计算暂不可用'
  return ''
}

export function operatorPanelPreviewBody(accountId, operatorId, input, loadout) {
  const number = value => value == null || value === '' ? null : Number(value)
  return {
    account_id: accountId, operator_id: operatorId,
    level: number(input.level), level_breakthrough_stage: input.levelBreakthroughStage ?? null,
    elite: number(input.elite), huaji: input.huaji?.owned === false
      ? { owned: false, stage: 0, awakened: null } : input.huaji,
    oddities: { attack: number(input.oddities?.attack?.current), hp: number(input.oddities?.hp?.current) },
    ...(loadout === undefined ? {} : { loadout })
  }
}
