import { createBattleOperator } from './battleImages.js'
import { agentMatchesGame } from '../data/inventory/agentManifest.js'
import { createDiscLoadoutState } from './operatorDiscLoadouts.js'
import { operatorHuaji, operatorHuajiLabel } from './operatorHuaji.js'
import { calculateOperatorCombatStats, normalizeOperatorCombatStats, combatStatsSourceLabel } from './operatorCombatStats.js'
import { operatorLevelBreakthroughStage } from './operatorGrowthRules.js'
import { STAR_LOADOUT_SLOTS, normalizeStarInventoryEntry } from '../domain/starLoadout.js'
import { STAR_QUALITY_LABELS } from '../data/starDiscs.js'

export function findBattleCatalogOperator(catalog, name, game) {
  const query = name.trim()
  return catalog.find(op => agentMatchesGame(op, game) && (op.name === query || op.alias === query))
}

export function battleAccountEntries({ catalog, current, state, loadout, panels = {}, account, panelWarning = '' }) {
  if (state?.account_id !== account.id || loadout?.account_id !== account.id) throw new Error('星石数据与当前账号不一致，请重新读取。')
  if (state.generation !== loadout.generation) throw new Error('星石配装已更新，请重新读取。')
  const rows = Array.isArray(current) ? current : [current]
  const entries = {}
  for (const row of rows) {
    if (row?.account_id !== account.id || row.game !== account.game) throw new Error('密探数据与当前账号或游戏不一致，请重新读取。')
    Object.assign(entries, row.entries)
  }
  const stars = new Map((state.inventory || []).map(item => {
    const star = normalizeStarInventoryEntry(item)
    return [star.instanceId, star]
  }))
  return catalog.filter(op => agentMatchesGame(op, account.game) && Object.hasOwn(entries, op.id)).flatMap(op => {
    const raw = entries[op.id]
    const huaji = operatorHuaji({ ...op, ...raw })
    if (!huaji.owned) return []
    const member = createBattleOperator(op.name, op.id)
    member.level = String(raw.level ?? '')
    member.elite = String(raw.elite ?? '')
    member.huaji = operatorHuajiLabel({ ...op, ...raw })
    if (huaji.stage === 25 && huaji.awakened == null) member.huaji = member.huaji.replace('未觉醒', '觉醒待确认')
    member.discLoadouts = createDiscLoadoutState(raw.disc_loadouts, raw.discs).loadouts.map(({ name, discNames }) => ({ name, discNames }))
    member.discs = member.discLoadouts[0].discNames.join('\n')
    const stones = {}
    const lines = []
    const hasEquipment = Object.hasOwn(loadout.loadouts || {}, op.id)
    for (const slot of STAR_LOADOUT_SLOTS) {
      const id = loadout.loadouts?.[op.id]?.[slot]
      const legacySlot = slot.replace('support', 'assist')
      const legacy = !hasEquipment && (raw.star_stones || []).find(stone => stone.type === legacySlot || stone.type + '1' === legacySlot)
      if (!id && !legacy?.name) continue
      const kind = slot.startsWith('main') ? 'main' : 'support'
      const star = hasEquipment ? stars.get(id) : { ...legacy, kind, breakthroughStage: legacy.breakthrough_stage }
      if (!star || star.kind !== kind) throw new Error('星石装备与背包不一致，请重新读取。')
      stones[hasEquipment ? slot : legacySlot] = hasEquipment ? star : { name: star.name, level: star.level, rarity: star.rarity }
      lines.push(`${kind === 'main' ? '主星' : '辅星'}${slot.at(-1)}：${star.name} · ${STAR_QUALITY_LABELS[star.quality] || star.quality || '品质未知'} · ${star.level ?? '未知'}级 · ${star.breakthroughStage == null ? '突破未知' : '突破' + star.breakthroughStage}`)
    }
    member.stars = lines.join('\n')
    const stored = normalizeOperatorCombatStats(raw.combat_stats, op.oddity_schema)
    const result = calculateOperatorCombatStats({
      stored, input: { operatorName: op.name, level: raw.level, elite: raw.elite, starLevel: raw.star_level,
        huaji, levelBreakthroughStage: operatorLevelBreakthroughStage(raw), stones, oddities: stored.oddities },
      serverResult: panels[op.id], allowAutomatic: account.operator_panel_auto_fill !== false,
    })
    member.hp = String(result.hp ?? '')
    member.attack = String(result.attack ?? '')
    const unverified = stored.observedStatus === 'unverified' || operatorLevelBreakthroughStage(raw) == null || operatorLevelBreakthroughStage(stored.observedInputs) == null
    const label = key => result[key + 'Source'] === 'observed'
      ? combatStatsSourceLabel(stored.source, result.changedSinceObservation ? 'stale' : unverified ? 'unverified' : 'observed')
      : ({ calculated: '自动计算', manual: '手动修正', missing: '未知' })[result[key + 'Source']]
    member.panelNote = `导入时：生命 ${label('hp')}；攻击 ${label('attack')}。${panelWarning}`
    return [member]
  })
}
