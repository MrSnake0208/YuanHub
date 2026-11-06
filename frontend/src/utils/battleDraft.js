import { BATTLE_ACTIONS, BATTLE_NOTES, BATTLE_STATS, battleDraftDiscError } from './battleImages.js'

export const BATTLE_DRAFT_MAX_BYTES = 1024 * 1024
export function battleDraftKey(userId, accountId) {
  return 'yh_battle_draft:v1:' + JSON.stringify(userId ? [String(userId), String(accountId || '')] : ['guest'])
}

// Rebuild only editor fields; account identity and private API fields never enter a portable draft.
export function validateBattleDraft(value) {
  const fail = label => { throw new Error('草稿格式无效：' + label) }
  const object = (item, label) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(label)
    return item
  }
  const text = (item, max, label) => {
    if (typeof item !== 'string' || item.length > max) fail(label)
    return item
  }
  const list = (item, min, max, label) => {
    if (!Array.isArray(item) || item.length < min || item.length > max) fail(label)
    return item
  }
  const index = (item, max, label) => {
    if (!Number.isInteger(item) || item < 0 || item > max) fail(label)
    return item
  }
  const draft = object(value, '正文')
  if (!['如鸢', '代号鸢'].includes(draft.game)) fail('游戏')
  return {
    title: text(draft.title, 120, '标题'), author: text(draft.author, 60, '署名'),
    game: draft.game, note: text(draft.note, 2000, '说明'),
    operators: list(draft.operators, 5, 5, '五人阵容').map(item => {
      const op = object(item, '密探')
      return {
        id: text(op.id ?? '', 128, '密探 ID'), name: text(op.name, 40, '密探名称'),
        ...Object.fromEntries(BATTLE_STATS.map(([key]) => [key, text(op[key], 30, '练度')])),
        ...Object.fromEntries(BATTLE_NOTES.map(([key]) => [key, text(op[key], 300, '配装')])),
        panelNote: text(op.panelNote ?? '', 200, '面板来源'),
        discIndex: index(op.discIndex ?? 0, 1, '命盘组合'),
        discLoadouts: list(op.discLoadouts ?? [], 0, 2, '命盘组合').map(item => {
          const loadout = object(item, '命盘组合')
          return { name: text(loadout.name, 300, '命盘组合名称'), discNames: list(loadout.discNames, 0, 3, '命盘词条').map(name => text(name, 90, '命盘词条')) }
        }),
      }
    }),
    targets: list(draft.targets, 5, 5, '敌方目标').map(name => text(name, 20, '敌方名称')),
    rounds: list(draft.rounds, 1, 50, '回合数').map(item => {
      const round = object(item, '回合')
      return {
        remark: text(round.remark, 2000, '回合备注'),
        actions: list(round.actions, 0, 50, '回合动作数').map(item => {
          const action = object(item, '动作')
          if (!BATTLE_ACTIONS.some(({ type }) => action.type === type)) fail('动作类型')
          return { slot: index(action.slot, 4, '密探槽位'), type: action.type, target: index(action.target, 4, '目标槽位') }
        }),
      }
    }),
  }
}

export function encodeBattleDraft(draft) {
  const validated = validateBattleDraft(draft)
  const error = battleDraftDiscError(validated)
  if (error) throw new Error(error)
  return JSON.stringify({ format: 'yuanhub-battle-draft', version: 1, draft: validated }, null, 2)
}

export function decodeBattleDraft(text) {
  if (new TextEncoder().encode(text).length > BATTLE_DRAFT_MAX_BYTES) throw new Error('草稿文件不能超过 1 MB。')
  let doc
  try { doc = JSON.parse(text) } catch { throw new Error('无法读取草稿，请选择有效的 JSON 文件。') }
  if (doc?.format !== 'yuanhub-battle-draft' || doc.version !== 1) throw new Error('不支持此草稿格式或版本。')
  // 旧版允许自由文本超限；完整恢复供修正，保存和出图另行阻止非法携带配置。
  return validateBattleDraft(doc.draft)
}
