// activeAccount 状态管理（Vue reactive 单例，无 pinia）
// - 记录「数据归属」当前选中的子账号 id 与该账号所属游戏版本
// - 库存 × 密探 × 快捷导入共用；跨页面导航与刷新都不丢
// - 用法：import { activeAccount } from '@/store/activeAccount.js'
//   activeAccount.id 读；activeAccount.set(id) 写；activeAccount.gameFor(id) / setGame(game, id) 读写版本
import { reactive } from 'vue'

const STORAGE_KEY = 'yh_active_account'
const GAME_STORAGE_KEY = 'yh_account_games'
const DEFAULT_ACCOUNT_KEY = '__default__'

export const DEFAULT_ACCOUNT_GAME = '代号鸢'
export const ACCOUNT_GAMES = [DEFAULT_ACCOUNT_GAME, '如鸢']

export function isAccountGame(game) {
  return ACCOUNT_GAMES.includes(game)
}

export function normalizeAccountGame(game) {
  return game === '如鸢' ? '如鸢' : DEFAULT_ACCOUNT_GAME
}

function loadSaved() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch (_e) {
    return ''
  }
}

function loadSavedGames() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GAME_STORAGE_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.keys(parsed).reduce(function (result, key) {
      if (key) result[key] = normalizeAccountGame(parsed[key])
      return result
    }, {})
  } catch (_e) {
    return {}
  }
}

function accountGameKey(accountId) {
  return accountId || DEFAULT_ACCOUNT_KEY
}

const savedId = loadSaved()
const savedGames = loadSavedGames()

export const activeAccount = reactive({
  id: savedId,
  games: savedGames,
  set(id) {
    activeAccount.id = id || ''
    persistAccount()
    return activeAccount.id
  },
  gameFor(accountId) {
    return normalizeAccountGame(activeAccount.games[accountGameKey(accountId || activeAccount.id)])
  },
  setGame(game, accountId) {
    const key = accountGameKey(accountId || activeAccount.id)
    const normalized = normalizeAccountGame(game)
    activeAccount.games[key] = normalized
    persistGames()
    return normalized
  },
  syncAccounts(accounts) {
    let changed = false
    ;(Array.isArray(accounts) ? accounts : []).forEach(function (account) {
      if (!account || !account.id || !isAccountGame(account.game)) return
      const key = accountGameKey(account.id)
      if (activeAccount.games[key] === account.game) return
      activeAccount.games[key] = account.game
      changed = true
    })
    if (changed) persistGames()
  },
  forgetGame(accountId) {
    const key = accountGameKey(accountId)
    delete activeAccount.games[key]
    persistGames()
  },
  clear() {
    activeAccount.set('')
  }
})

function persistAccount() {
  try {
    if (activeAccount.id) localStorage.setItem(STORAGE_KEY, activeAccount.id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch (_e) {
    // 隐私模式 / 存储满等异常静默忽略，不影响读写内存态
  }
}

function persistGames() {
  try {
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(activeAccount.games))
  } catch (_e) {
    // 隐私模式 / 存储满等异常静默忽略，不影响读写内存态
  }
}
