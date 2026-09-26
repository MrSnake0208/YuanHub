<template>
  <section class="game-account-manager" aria-labelledby="game-account-manager-title">
    <header class="manager-head">
      <div>
        <span class="section-kicker">GAME ACCOUNTS · 游戏账号</span>
        <h2 id="game-account-manager-title">统一管理游戏账号</h2>
        <p>账号名称与所属游戏只在这里维护；密探、库存、星石等页面只负责切换当前账号。</p>
      </div>
      <span class="account-count">{{ accounts.length }} 个账号</span>
    </header>

    <div v-if="loading" class="manager-state" role="status">正在读取游戏账号…</div>
    <div v-else-if="loadError" class="manager-state error" role="alert">
      <span>{{ loadError }}</span>
      <button type="button" class="text-button" @click="emit('reload')">重新加载</button>
    </div>

    <template v-else>
      <form class="create-card" data-tour="account-create" @submit.prevent="createNewAccount">
        <div class="create-copy">
          <h3>新建游戏账号</h3>
          <p>先确定所属游戏，再填写一个方便辨认的名称。</p>
        </div>
        <fieldset class="game-choice" :disabled="createBusy">
          <legend>所属游戏</legend>
          <div class="game-options">
            <label v-for="game in ACCOUNT_GAMES" :key="game" :class="{ selected: newGame === game }">
              <input v-model="newGame" type="radio" name="new-game-account-game" :value="game" />
              <span>{{ game }}</span>
            </label>
          </div>
        </fieldset>
        <label class="name-field" for="new-game-account-name">
          <span>账号名称</span>
          <input
            id="new-game-account-name"
            v-model.trim="newName"
            maxlength="64"
            autocomplete="off"
            placeholder="例如：大鸟大号"
            :disabled="createBusy"
          />
        </label>
        <button class="primary-action" type="submit" :disabled="createBusy || !newName">
          <Plus :size="16" aria-hidden="true" />
          {{ createBusy ? '正在创建…' : '创建账号' }}
        </button>
      </form>

      <p v-if="localError" class="manager-error" role="alert">{{ localError }}</p>

      <div v-if="accounts.length" class="account-groups">
        <section v-for="group in groupedAccounts" :key="group.game" class="account-group" :aria-labelledby="'game-account-group-' + group.game">
          <div class="group-head">
            <div>
              <span class="game-dot" aria-hidden="true"></span>
              <h3 :id="'game-account-group-' + group.game">{{ group.game }}</h3>
            </div>
            <span>{{ group.accounts.length }} 个</span>
          </div>

          <div class="account-list">
            <article
              v-for="account in group.accounts"
              :key="account.id"
              class="account-card"
              :class="{ current: account.id === accountId }"
            >
              <button
                type="button"
                class="account-main"
                :class="{ selected: account.id === accountId }"
                :aria-pressed="account.id === accountId"
                :disabled="busyAccountId === account.id"
                @click="selectAccount(account)"
              >
                <span class="account-name-line">
                  <b>{{ account.name }}</b>
                  <em v-if="account.id === accountId">当前账号</em>
                </span>
                <small>{{ account.id }}</small>
              </button>

              <div class="account-controls">
                <label class="game-field">
                  <span>所属游戏</span>
                  <select
                    :value="resolvedGame(account)"
                    :disabled="!!busyAccountId"
                    :aria-label="'修改 ' + account.name + ' 的所属游戏'"
                    @change="changeGame(account, $event.target.value)"
                  >
                    <option v-for="game in ACCOUNT_GAMES" :key="game" :value="game">{{ game }}</option>
                  </select>
                </label>
                <button
                  type="button"
                  class="icon-action"
                  :disabled="!!busyAccountId"
                  :aria-label="'修改 ' + account.name + ' 的名称'"
                  @click="rename(account)"
                >
                  <Pencil :size="15" aria-hidden="true" />
                  改名
                </button>
                <button
                  type="button"
                  class="icon-action danger"
                  :disabled="!!busyAccountId"
                  :aria-label="'删除 ' + account.name"
                  @click="remove(account)"
                >
                  <Trash2 :size="15" aria-hidden="true" />
                  删除
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>

      <div v-else class="empty-state">
        <Users :size="22" aria-hidden="true" />
        <div>
          <h3>还没有游戏账号</h3>
          <p>创建后，密探、库存、星石、奖励流水和连接码都会归属到这个账号。</p>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Pencil, Plus, Trash2, Users } from '@lucide/vue'
import {
  createAccount,
  deleteAccount,
  renameAccount,
  updateAccountGame,
} from '../api/accounts.js'
import {
  ACCOUNT_GAMES,
  DEFAULT_ACCOUNT_GAME,
  activeAccount,
  isAccountGame,
  normalizeAccountGame,
} from '../store/activeAccount.js'
import { dialog } from '../utils/dialog.js'

const props = defineProps({
  accounts: { type: Array, default: function () { return [] } },
  accountId: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  loadError: { type: String, default: '' },
})

const emit = defineEmits(['update:accounts', 'update:accountId', 'reload', 'changed'])

const newName = ref('')
const newGame = ref(DEFAULT_ACCOUNT_GAME)
const createBusy = ref(false)
const busyAccountId = ref('')
const localError = ref('')

const groupedAccounts = computed(function () {
  return ACCOUNT_GAMES.map(function (game) {
    return {
      game,
      accounts: props.accounts.filter(function (account) {
        return resolvedGame(account) === game
      }),
    }
  })
})

function readableError(error, fallback) {
  if (!error || !error.message) return fallback
  return /Failed to fetch|NetworkError|fetch/i.test(error.message)
    ? '网络异常，请稍后重试'
    : error.message
}

function resolvedGame(account) {
  if (account && isAccountGame(account.game)) return account.game
  return activeAccount.gameFor(account && account.id) || normalizeAccountGame(account && account.game)
}

function replaceAccount(updatedAccount) {
  const next = props.accounts.map(function (account) {
    return account.id === updatedAccount.id ? { ...account, ...updatedAccount } : account
  })
  emit('update:accounts', next)
  emit('changed', next)
}

function selectAccount(account) {
  if (!account || !account.id || busyAccountId.value) return
  activeAccount.set(account.id)
  activeAccount.setGame(resolvedGame(account), account.id)
  emit('update:accountId', account.id)
}

async function createNewAccount() {
  const name = newName.value.trim()
  if (!name || createBusy.value) return
  createBusy.value = true
  localError.value = ''
  try {
    const created = await createAccount(name, newGame.value)
    if (!created || !created.id) throw new Error('账号已创建，但没有返回账号编号，请重新加载')
    const normalized = {
      ...created,
      game: isAccountGame(created.game) ? created.game : newGame.value,
    }
    const next = props.accounts.concat(normalized)
    activeAccount.setGame(normalized.game, normalized.id)
    activeAccount.set(normalized.id)
    emit('update:accounts', next)
    emit('update:accountId', normalized.id)
    emit('changed', next)
    newName.value = ''
  } catch (error) {
    localError.value = readableError(error, '游戏账号创建失败，请稍后重试')
  } finally {
    createBusy.value = false
  }
}

async function changeGame(account, game) {
  if (!account || !account.id || !isAccountGame(game) || busyAccountId.value) return
  const previousGame = resolvedGame(account)
  if (previousGame === game) return
  busyAccountId.value = account.id
  localError.value = ''
  try {
    const updated = await updateAccountGame(account.id, game)
    const confirmed = {
      ...account,
      ...(updated || {}),
      game: isAccountGame(updated && updated.game) ? updated.game : game,
    }
    activeAccount.setGame(confirmed.game, account.id)
    replaceAccount(confirmed)
  } catch (error) {
    activeAccount.setGame(previousGame, account.id)
    localError.value = readableError(error, '所属游戏保存失败，请稍后重试')
  } finally {
    busyAccountId.value = ''
  }
}

async function rename(account) {
  if (!account || !account.id || busyAccountId.value) return
  const value = await dialog.prompt({
    title: '修改游戏账号名称',
    message: '名称只用于帮助你区分不同游戏存档。',
    value: account.name || '',
    inputLabel: '账号名称',
    placeholder: '1–64 字',
  })
  if (value == null) return
  const name = value.trim()
  if (!name) {
    localError.value = '账号名称不能为空'
    return
  }
  busyAccountId.value = account.id
  localError.value = ''
  try {
    const updated = await renameAccount(account.id, name)
    replaceAccount({ ...account, ...(updated || {}), name: (updated && updated.name) || name })
  } catch (error) {
    localError.value = readableError(error, '账号改名失败，请稍后重试')
  } finally {
    busyAccountId.value = ''
  }
}

async function remove(account) {
  if (!account || !account.id || busyAccountId.value) return
  const ok = await dialog.confirm({
    title: '删除游戏账号',
    message:
      '删除“' +
      account.name +
      '”后，该账号的库存、密探、特别关注、星石数据和所有 API Token 都会一并清除，且不可恢复。',
    type: 'danger',
    confirmText: '确认删除',
  })
  if (!ok) return

  busyAccountId.value = account.id
  localError.value = ''
  try {
    await deleteAccount(account.id)
    activeAccount.forgetGame(account.id)
    const next = props.accounts.filter(function (item) { return item.id !== account.id })
    const nextId = account.id === props.accountId ? (next[0] && next[0].id) || '' : props.accountId
    activeAccount.set(nextId)
    if (nextId) {
      const nextAccount = next.find(function (item) { return item.id === nextId })
      if (nextAccount) activeAccount.setGame(resolvedGame(nextAccount), nextId)
    }
    emit('update:accounts', next)
    emit('update:accountId', nextId)
    emit('changed', next)
  } catch (error) {
    localError.value = readableError(error, '删除游戏账号失败，请稍后重试')
  } finally {
    busyAccountId.value = ''
  }
}
</script>

<style scoped>
.game-account-manager {
  margin-top: 32px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--surface);
}
.manager-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 24px;
  border-bottom: 1px solid var(--line);
}
.section-kicker {
  display: block;
  margin-bottom: 6px;
  color: var(--accent-strong);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .14em;
}
.manager-head h2 {
  font-family: var(--font-s);
  font-size: 21px;
  line-height: 1.35;
}
.manager-head p {
  max-width: 720px;
  margin-top: 6px;
  color: var(--ink-60);
  font-size: 12.5px;
  line-height: 1.7;
}
.account-count {
  flex: none;
  padding: 6px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-60);
  font-size: 11px;
  font-weight: 800;
}
.manager-state,
.empty-state {
  margin: 20px 24px 24px;
  padding: 18px;
  border: 1px dashed var(--line);
  border-radius: 14px;
  background: var(--cream);
  color: var(--ink-60);
}
.manager-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 12.5px;
  font-weight: 700;
}
.manager-state.error,
.manager-error {
  color: var(--rouge);
}
.text-button {
  border: 0;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.create-card {
  display: grid;
  grid-template-columns: minmax(180px, .85fr) minmax(220px, .9fr) minmax(220px, 1fr) auto;
  align-items: end;
  gap: 14px;
  margin: 20px 24px 0;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--cream);
}
.create-copy {
  align-self: center;
}
.create-copy h3,
.empty-state h3 {
  font-family: var(--font-s);
  font-size: 15px;
  font-weight: 900;
}
.create-copy p,
.empty-state p {
  margin-top: 4px;
  color: var(--ink-60);
  font-size: 12px;
  line-height: 1.55;
}
.game-choice {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.game-choice legend,
.name-field > span,
.game-field > span {
  display: block;
  margin-bottom: 6px;
  color: var(--ink-60);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .06em;
}
.game-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  padding: 3px;
  border: 1.5px solid var(--line);
  border-radius: 11px;
  background: var(--paper);
}
.game-options label {
  position: relative;
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: var(--ink-60);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}
.game-options label.selected {
  background: var(--yellow);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--yellow-deep);
}
.game-options input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.game-options label:focus-within {
  outline: 2px solid var(--brand-blue);
  outline-offset: 1px;
}
.name-field input,
.game-field select {
  width: 100%;
  min-height: 44px;
  border: 1.5px solid var(--line);
  border-radius: 11px;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-b);
  font-size: 14px;
  outline: none;
}
.name-field input {
  padding: 10px 12px;
}
.game-field select {
  padding: 9px 34px 9px 11px;
}
.name-field input:focus,
.game-field select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(215, 137, 53, .13);
}
.primary-action,
.icon-action {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1.5px solid var(--line);
  border-radius: 11px;
  cursor: pointer;
  font-family: var(--font-b);
  font-size: 12.5px;
  font-weight: 800;
}
.primary-action {
  padding: 0 16px;
  border-color: var(--yellow-deep);
  background: var(--yellow);
  color: var(--ink);
}
.primary-action:disabled,
.icon-action:disabled,
.account-main:disabled {
  cursor: not-allowed;
  opacity: .5;
}
.manager-error {
  margin: 12px 24px 0;
  font-size: 12px;
  font-weight: 800;
}
.account-groups {
  display: grid;
  gap: 18px;
  padding: 22px 24px 26px;
}
.account-group {
  min-width: 0;
}
.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 9px;
}
.group-head > div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.group-head h3 {
  font-family: var(--font-s);
  font-size: 14px;
}
.group-head > span {
  color: var(--ink-35);
  font-size: 11px;
  font-weight: 800;
}
.game-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--yellow-deep);
}
.account-list {
  display: grid;
  gap: 8px;
}
.account-card {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--paper);
}
.account-card.current {
  border-color: var(--accent);
  box-shadow: inset 3px 0 0 var(--accent);
}
.account-main {
  min-width: 0;
  padding: 6px 8px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.account-main:hover:not(:disabled),
.account-main:focus-visible {
  background: var(--cream);
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.account-name-line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.account-name-line b {
  overflow: hidden;
  font-size: 13.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-name-line em {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--yellow);
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
}
.account-main small {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: var(--ink-35);
  font-family: var(--font-d);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-controls {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.game-field {
  width: 140px;
}
.icon-action {
  padding: 0 12px;
  background: transparent;
  color: var(--ink-60);
}
.icon-action:hover:not(:disabled),
.icon-action:focus-visible {
  border-color: var(--accent);
  color: var(--ink);
  outline: none;
}
.icon-action.danger {
  border-color: rgba(166, 81, 74, .28);
  color: var(--rouge);
}
.icon-action.danger:hover:not(:disabled),
.icon-action.danger:focus-visible {
  background: rgba(166, 81, 74, .08);
  border-color: rgba(166, 81, 74, .5);
}
.empty-state {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

@media (max-width: 880px) {
  .create-card {
    grid-template-columns: 1fr 1fr;
  }
  .create-copy {
    grid-column: 1 / -1;
  }
  .primary-action {
    width: 100%;
  }
  .account-card {
    grid-template-columns: 1fr;
  }
  .account-controls {
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .game-account-manager {
    margin-top: 24px;
    border-radius: 18px;
  }
  .manager-head {
    padding: 18px 16px;
  }
  .manager-head h2 {
    font-size: 18px;
  }
  .create-card {
    grid-template-columns: 1fr;
    margin: 16px;
    padding: 14px;
  }
  .create-copy {
    grid-column: auto;
  }
  .account-groups {
    padding: 18px 16px 20px;
  }
  .account-controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
  }
  .game-field {
    grid-column: 1 / -1;
    width: 100%;
  }
  .icon-action {
    width: 100%;
  }
  .name-field input,
  .game-field select {
    font-size: 16px;
  }
  .manager-state,
  .empty-state {
    margin-right: 16px;
    margin-left: 16px;
  }
}
</style>
