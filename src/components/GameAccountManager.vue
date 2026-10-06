<template>
  <section class="game-account-manager" aria-labelledby="game-account-manager-title">
    <header class="manager-head">
      <div class="manager-title">
        <h2 id="game-account-manager-title">游戏账号</h2>
        <span v-if="!loading && !loadError" class="account-count">{{ accounts.length }} 个</span>
      </div>
      <button ref="createTrigger" type="button" class="primary-action" data-tour="account-create"
        :disabled="loading || !!loadError || busy" @click="openCreate">
        <Plus :size="16" aria-hidden="true" />新建账号
      </button>
    </header>

    <div v-if="loading" class="manager-state" role="status">正在读取游戏账号…</div>
    <div v-else-if="loadError" class="manager-state error" role="alert">
      <span>{{ loadError }}</span><button type="button" class="text-button" @click="emit('reload')">重新加载</button>
    </div>
    <template v-else>
      <ul v-if="accounts.length" class="account-list" aria-label="游戏账号列表">
        <li v-for="account in accounts" :key="account.id" class="account-row">
          <div class="account-identity">
            <b class="account-name" :title="account.name">{{ account.name }}</b>
            <p>{{ resolvedGame(account) }}<span v-if="account.id === activeAccount.id"> · 当前账号</span></p>
          </div>
          <button type="button" class="more-trigger" :aria-label="account.name + '，更多操作'"
            aria-haspopup="dialog" :aria-expanded="mode === 'more' && target?.id === account.id"
            :aria-controls="panelId" :disabled="busy" @click="openMore(account, $event)">
            <MoreHorizontal :size="20" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <div v-else class="empty-state">
        <Users :size="22" aria-hidden="true" />
        <div><h3>还没有游戏账号</h3><p>创建后，密探、库存、星石、奖励流水和连接码都会归属到这个账号。</p></div>
      </div>
    </template>
    <p v-if="localError && !mode" class="manager-message error" role="alert">{{ localError }}</p>
    <p v-if="busy && !mode" class="manager-message" role="status">正在处理游戏账号…</p>
    <p v-if="localSuccess" class="manager-message" role="status">{{ localSuccess }}</p>

    <Teleport to="body">
      <div v-if="mode" class="modal-mask account-panel-mask" :class="{ 'is-more': mode === 'more' }"
        :style="viewportStyle" @click.self="closePanel">
        <section :id="panelId" ref="panel" class="modal account-panel" :class="{ 'more-panel': mode === 'more' }"
          :style="mode === 'more' && desktop ? menuPosition : undefined" role="dialog" aria-modal="true"
          :aria-labelledby="panelId + '-title'" :aria-busy="busy" tabindex="-1">
          <header class="modal-head">
            <h3 :id="panelId + '-title'">{{ panelTitle }}</h3>
            <button type="button" class="panel-close" aria-label="关闭账号面板" :disabled="busy" @click="closePanel"><X :size="20" aria-hidden="true" /></button>
          </header>
          <div v-if="mode === 'more'" class="more-actions" @keydown="moveFocus">
            <p class="panel-identity">{{ target.name }}<small>{{ resolvedGame(target) }}{{ target.id === activeAccount.id ? ' · 当前账号' : '' }}</small></p>
            <button type="button" :disabled="busy" @click="openEdit"><Pencil :size="16" aria-hidden="true" />编辑账号</button>
            <button type="button" :disabled="busy" @click="showId"><Hash :size="16" aria-hidden="true" />查看账号编号</button>
            <button type="button" class="danger" :disabled="busy" @click="remove"><Trash2 :size="16" aria-hidden="true" />{{ busy ? '正在处理…' : '删除账号' }}</button>
            <p v-if="localError" class="error" role="alert">{{ localError }}</p>
          </div>
          <div v-else-if="mode === 'id'" class="id-content">
            <p class="panel-identity">{{ target.name }}</p>
            <p>这是内部账号编号，也是库存、密探等数据的归属标识。</p>
            <code>{{ target.id }}</code>
            <button ref="copyButton" type="button" class="secondary-action" @click="copyId">{{ copyMessage || '复制编号' }}</button>
            <p v-if="copyMessage" :role="copyFailed ? 'alert' : 'status'">{{ copyMessage }}</p>
          </div>
          <form v-else class="account-form" @submit.prevent="mode === 'create' ? createNewAccount() : saveAccount()">
            <div class="form-body">
              <p v-if="mode === 'edit'" class="panel-identity">{{ target.name }}</p>
              <label class="name-field" :for="mode === 'create' ? 'new-game-account-name' : 'edit-game-account-name'">
                <span>账号名称</span>
                <input :id="mode === 'create' ? 'new-game-account-name' : 'edit-game-account-name'" ref="nameInput"
                  v-model.trim="newName" maxlength="64" required autocomplete="off" placeholder="例如：大鸟大号" :disabled="busy" />
              </label>
              <fieldset class="game-choice" :disabled="busy">
                <legend>所属游戏</legend>
                <div class="game-options">
                  <label v-for="game in ACCOUNT_GAMES" :key="game">
                    <input v-model="newGame" type="radio" name="game-account-game" :value="game" /><span>{{ game }}</span>
                  </label>
                </div>
              </fieldset>
              <p v-if="mode === 'edit'" class="form-hint">已有活动订阅历史或招募档案的账号不能修改所属游戏。</p>
              <p v-if="localError" class="error" role="alert">{{ localError }}</p>
              <p v-if="busy" role="status">{{ mode === 'create' ? '正在创建账号…' : '正在保存账号…' }}</p>
            </div>
            <footer class="modal-foot">
              <button type="button" class="secondary-action" :disabled="busy" @click="closePanel">取消</button>
              <button type="submit" class="primary-action" :disabled="busy || !newName || (mode === 'edit' && !editChanged)">
                {{ busy ? '正在处理…' : mode === 'create' ? '创建' : '保存' }}
              </button>
            </footer>
          </form>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { Hash, MoreHorizontal, Pencil, Plus, Trash2, Users, X } from '@lucide/vue'
import { createAccount, deleteAccount, updateAccount } from '../api/accounts.js'
import { ACCOUNT_GAMES, DEFAULT_ACCOUNT_GAME, activeAccount, isAccountGame, normalizeAccountGame } from '../store/activeAccount.js'
import { auth } from '../store/auth.js'
import { dialog } from '../utils/dialog.js'
import { useModalFocus } from '../composables/useModalFocus.js'

const props = defineProps({
  accounts: { type: Array, default: () => [] },
  accountId: { type: String, default: '' },
  loading: Boolean,
  loadError: { type: String, default: '' },
})
const emit = defineEmits(['update:accounts', 'update:accountId', 'reload', 'changed'])
const mode = ref(''), target = ref(null), newName = ref(''), newGame = ref(DEFAULT_ACCOUNT_GAME)
const busy = ref(false), localError = ref(''), localSuccess = ref(''), copyMessage = ref(''), copyFailed = ref(false)
const panel = ref(null), nameInput = ref(null), copyButton = ref(null), createTrigger = ref(null)
const panelId = 'account-manager-' + useId()
const desktop = ref(false), viewportStyle = ref({}), menuPosition = ref({})
const panelTitle = computed(() => ({ create: '新建游戏账号', edit: '编辑游戏账号', id: '账号编号', more: '账号操作' }[mode.value]))
const editChanged = computed(() => target.value && (newName.value !== target.value.name || newGame.value !== resolvedGame(target.value)))
let alive = true, identityVersion = 0, cleanup = null, moreTrigger = null
const isOpen = computed(() => !!mode.value)
useModalFocus(isOpen, panel, { initialFocus, onEscape: closePanel })
function initialFocus() { return mode.value === 'create' || mode.value === 'edit' ? nameInput.value : mode.value === 'id' ? copyButton.value : panel.value?.querySelector('.more-actions button') }
function resolvedGame(account) {
  return isAccountGame(account?.game) ? account.game : activeAccount.gameFor(account?.id) || normalizeAccountGame(account?.game)
}
function readableError(error, fallback) {
  return /Failed to fetch|NetworkError|fetch/i.test(error?.message || '') ? '网络异常，请稍后重试' : error?.message || fallback
}
function closePanel() { if (!busy.value) mode.value = '' }
function openCreate(event) {
  if (props.loading || props.loadError || busy.value) return
  event.currentTarget.focus()
  newName.value = ''; newGame.value = DEFAULT_ACCOUNT_GAME; target.value = null
  localError.value = ''; localSuccess.value = ''; mode.value = 'create'
}
function openMore(account, event) {
  if (props.loading || props.loadError || busy.value) return
  moreTrigger = event.currentTarget; moreTrigger.focus()
  target.value = account; localError.value = ''; localSuccess.value = ''; mode.value = 'more'
}
async function openEdit() {
  newName.value = target.value.name; newGame.value = resolvedGame(target.value)
  mode.value = 'edit'; localError.value = ''
  await nextTick(); nameInput.value?.focus()
}
async function showId() {
  copyMessage.value = ''; copyFailed.value = false; mode.value = 'id'
  await nextTick(); copyButton.value?.focus()
}
async function copyId() {
  const id = target.value.id, version = identityVersion
  try {
    await navigator.clipboard.writeText(id)
    if (valid(version) && mode.value === 'id' && target.value.id === id) { copyFailed.value = false; copyMessage.value = '已复制' }
  } catch {
    if (valid(version) && mode.value === 'id' && target.value.id === id) { copyFailed.value = true; copyMessage.value = '复制失败，请手动选择编号' }
  }
}
function valid(version) { return alive && version === identityVersion }
function publish(next) { emit('update:accounts', next); emit('changed', next) }
async function createNewAccount() {
  const name = newName.value.trim(), game = newGame.value, version = identityVersion
  if (!name || name.length > 64 || !isAccountGame(game) || busy.value || props.loading || props.loadError) return
  busy.value = true; localError.value = ''; localSuccess.value = ''
  try {
    const created = await createAccount(name, newGame.value)
    if (!valid(version)) return
    if (!created?.id) throw new Error('账号已创建，但没有返回账号编号，请重新加载')
    const normalized = { ...created, game: isAccountGame(created.game) ? created.game : game }
    activeAccount.setGame(normalized.game, normalized.id); activeAccount.set(normalized.id)
    publish(props.accounts.concat(normalized)); emit('update:accountId', normalized.id)
    mode.value = ''; localSuccess.value = '已创建游戏账号“' + normalized.name + '”。'
  } catch (error) { if (valid(version)) localError.value = readableError(error, '游戏账号创建失败，请稍后重试') }
  finally { busy.value = false }
}
async function saveAccount() {
  const account = props.accounts.find(item => item.id === target.value?.id), name = newName.value.trim(), game = newGame.value, version = identityVersion
  if (!account || !name || name.length > 64 || !isAccountGame(game) || busy.value || props.loading || props.loadError || !editChanged.value) return
  const patch = {}
  if (name !== account.name) patch.name = name
  if (game !== resolvedGame(account)) patch.game = game
  if (!Object.keys(patch).length) { mode.value = ''; return }
  busy.value = true; localError.value = ''; localSuccess.value = ''
  try {
    const updated = await updateAccount(account.id, patch)
    if (!valid(version) || !props.accounts.some(item => item.id === account.id)) return
    const confirmed = { ...account, ...(updated || {}), id: account.id, name: updated?.name || name, game: isAccountGame(updated?.game) ? updated.game : game }
    activeAccount.setGame(confirmed.game, account.id)
    publish(props.accounts.map(item => item.id === account.id ? { ...item, ...confirmed } : item))
    mode.value = ''; localSuccess.value = '已保存游戏账号“' + confirmed.name + '”。'
  } catch (error) { if (valid(version)) localError.value = readableError(error, '游戏账号保存失败，请稍后重试') }
  finally { busy.value = false }
}
async function remove() {
  const account = target.value, version = identityVersion
  if (!account?.id || busy.value || props.loading || props.loadError) return
  let deleted = false
  busy.value = true; localError.value = ''; localSuccess.value = ''
  try {
    const ok = await dialog.confirm({
      title: '删除游戏账号',
      message: '删除“' + account.name + '”后，该账号的库存、密探、特别关注、星石数据、活动订阅及个人关卡进度和所有 API Token 都会一并清除，且不可恢复。',
      type: 'danger', confirmText: '确认删除',
    })
    if (!ok || !valid(version) || props.loading || props.loadError || !props.accounts.some(item => item.id === account.id)) return
    await deleteAccount(account.id)
    if (!valid(version)) return
    const next = props.accounts.filter(item => item.id !== account.id)
    activeAccount.forgetGame(account.id)
    // Read the current context after DELETE resolves: the switcher may have changed it meanwhile.
    const currentId = activeAccount.id
    const nextId = next.some(item => item.id === currentId) ? currentId : next[0]?.id || ''
    if (nextId !== currentId) activeAccount.set(nextId)
    if (nextId) activeAccount.setGame(resolvedGame(next.find(item => item.id === nextId)), nextId)
    publish(next); emit('update:accountId', nextId)
    mode.value = ''; localSuccess.value = '已删除游戏账号“' + account.name + '”。'
    deleted = true
  } catch (error) { if (valid(version)) localError.value = readableError(error, '删除游戏账号失败，请稍后重试') }
  finally {
    busy.value = false
    if (deleted && valid(version)) { await nextTick(); createTrigger.value?.focus() }
  }
}
function moveFocus(event) {
  const options = [...panel.value.querySelectorAll('.more-actions button:not(:disabled)')], index = options.indexOf(document.activeElement)
  if (index < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  options[event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus()
}
function place() {
  desktop.value = window.matchMedia('(min-width: 768px)').matches
  const viewport = window.visualViewport, height = viewport?.height || window.innerHeight, top = viewport?.offsetTop || 0
  viewportStyle.value = { top: top + 'px', height: height + 'px', bottom: 'auto' }
  if (mode.value !== 'more' || !moreTrigger) return
  const rect = moreTrigger.getBoundingClientRect(), width = Math.min(280, window.innerWidth - 24), below = height + top - rect.bottom - 12
  menuPosition.value = { width: width + 'px', right: Math.max(12, window.innerWidth - rect.right) + 'px', maxHeight: Math.max(0, height - 24) + 'px',
    ...(below >= 260 ? { top: rect.bottom + 4 + 'px' } : { bottom: Math.max(12, window.innerHeight - height - top + 12) + 'px' }) }
}
watch(isOpen, open => {
  cleanup?.(); cleanup = null
  if (!open) return
  place()
  const overflow = document.body.style.overflow, rootOverflow = document.documentElement.style.overflow
  document.body.style.overflow = document.documentElement.style.overflow = 'hidden'
  window.addEventListener('resize', place)
  window.visualViewport?.addEventListener('resize', place); window.visualViewport?.addEventListener('scroll', place)
  cleanup = () => {
    document.body.style.overflow = overflow; document.documentElement.style.overflow = rootOverflow
    window.removeEventListener('resize', place)
    window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place)
  }
}, { flush: 'sync' })
watch(() => auth.userInfo?.id, () => {
  identityVersion++; mode.value = ''; localError.value = ''; localSuccess.value = ''
}, { flush: 'sync' })
watch(() => [props.loading, props.loadError], () => { if ((props.loading || props.loadError) && !busy.value) mode.value = '' })
onBeforeUnmount(() => { alive = false; cleanup?.() })
</script>

<style scoped>
.game-account-manager { margin-top: 24px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.manager-head, .manager-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.manager-head { justify-content: space-between; flex-wrap: wrap; padding: 16px; border-bottom: 1px solid var(--line); }
.manager-title h2 { color: var(--tea); font: 900 20px/1.4 var(--font-s); }
.account-count { color: var(--ink-60); font: 13px/1.5 var(--font-d); white-space: nowrap; }
.account-list { margin: 0; padding: 0 16px; list-style: none; }
.account-row { display: flex; align-items: center; gap: 12px; min-height: 76px; padding: 12px 0; }
.account-row + .account-row { border-top: 1px solid var(--line); }
.account-identity { flex: 1; min-width: 0; }
.account-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-size: 14px; font-weight: 700; }
.account-identity p { margin: 3px 0 0; color: var(--ink-60); font-size: 12px; }
.account-identity p span { color: var(--tea); }
.more-trigger, .panel-close { display: grid; place-items: center; flex: none; min-width: 44px; min-height: 44px; border: 0; border-radius: 8px; background: transparent; color: var(--tea); cursor: pointer; }
.more-trigger:hover, .panel-close:hover { background: var(--cream); }
.primary-action, .secondary-action { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 8px 14px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; font: 700 13px/1.5 var(--font-b); white-space: nowrap; }
.primary-action { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink); }
.secondary-action { background: var(--surface); color: var(--tea); }
button:disabled { opacity: .55; cursor: not-allowed; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--tea); outline-offset: 2px; }
.manager-state, .empty-state { display: flex; align-items: center; gap: 12px; padding: 20px 16px; color: var(--ink-60); font-size: 13px; }
.empty-state svg { flex: none; }
.empty-state h3 { color: var(--tea); font: 900 15px/1.5 var(--font-s); }
.empty-state p { margin-top: 4px; line-height: 1.6; }
.text-button { min-height: 44px; flex: none; border: 0; background: transparent; color: var(--tea); font: inherit; cursor: pointer; text-decoration: underline; }
.manager-message { margin: 0; padding: 12px 16px; border-top: 1px solid var(--line); color: var(--tea); font-size: 13px; overflow-wrap: anywhere; }
.error { color: var(--rouge); }
.account-panel-mask { align-items: flex-end; padding: max(12px, env(safe-area-inset-top)) max(0px, env(safe-area-inset-right)) 0 max(0px, env(safe-area-inset-left)); }
.account-panel { display: flex; flex-direction: column; min-width: 0; width: 100%; max-width: none; max-height: 100%; border-radius: 18px 18px 0 0; overflow: hidden; box-shadow: none; color: var(--ink); font: 14px/1.6 var(--font-b); }
.account-panel .modal-head { flex: none; padding: 12px 16px; }
.account-panel .modal-head h3 { min-width: 0; overflow-wrap: anywhere; }
.account-panel .account-form { display: flex; flex-direction: column; min-height: 0; gap: 0; padding: 0; }
.form-body, .more-actions, .id-content { overflow-y: auto; overscroll-behavior: contain; min-height: 0; padding: 16px; overflow-wrap: anywhere; }
.form-body { display: grid; gap: 16px; }
.account-panel .modal-foot { flex: none; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); }
.modal-foot button { flex: 1; }
.panel-identity { margin: 0; color: var(--tea); font-weight: 700; overflow-wrap: anywhere; }
.panel-identity small { display: block; color: var(--ink-60); font-size: 12px; font-weight: 400; }
.name-field { min-width: 0; margin: 0; }
.name-field > span, .game-choice legend { display: block; margin-bottom: 6px; color: var(--tea); font-size: 13px; font-weight: 700; }
.account-panel .name-field input { width: 100%; min-width: 0; min-height: 44px; padding: 10px 12px; font-size: 16px; }
.game-choice { min-width: 0; margin: 0; padding: 0; border: 0; }
.game-options { display: flex; gap: 24px; flex-wrap: wrap; }
.account-panel .game-options label { display: flex; align-items: center; gap: 8px; min-height: 44px; margin: 0; color: var(--ink); cursor: pointer; font-size: 14px; }
.account-panel .game-options input { width: 18px; height: 18px; min-height: 0; margin: 0; padding: 0; accent-color: var(--tea); }
.form-hint, .id-content > p:not(.panel-identity) { margin: 0; color: var(--ink-60); font-size: 12px; }
.more-actions { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
.more-actions .panel-identity { padding: 0 8px 12px; }
.more-actions button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 10px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--tea); text-align: left; font: inherit; cursor: pointer; }
.more-actions button:hover { background: var(--cream); }
.more-actions .danger { margin-top: 8px; border-top: 1px solid var(--line); border-radius: 0; color: var(--rouge); }
.id-content { display: grid; gap: 12px; padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
.id-content code { display: block; min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); overflow-wrap: anywhere; user-select: text; }
/* The shared danger confirmation is opened above this manager's panel. */
:global(body:has(.account-panel-mask) .dialog-close),
:global(body:has(.account-panel-mask) .dlg-btn) { min-width: 44px; min-height: 44px; }
@media (min-width: 768px) {
  .manager-head { padding: 16px 24px; }
  .account-list { padding: 0 24px; }
  .account-panel-mask { align-items: center; padding: 16px; }
  .account-panel { max-width: 460px; max-height: 100%; border-radius: 16px; }
  .account-panel-mask.is-more { background: transparent; z-index: var(--z-popover); }
  .more-panel { position: fixed; box-shadow: 0 4px 16px rgba(73,59,44,.08); border-radius: 10px; }
  .modal-foot button { flex: none; }
}
</style>
