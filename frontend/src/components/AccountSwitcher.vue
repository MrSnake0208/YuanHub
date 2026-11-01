<template>
  <span class="account-switcher">
    <button ref="trigger" type="button" class="context-selector" aria-haspopup="dialog"
      :aria-expanded="open" :aria-controls="panelId" :aria-label="label" :title="selected ? gameFor(selected) + ' · ' + selected.name : label"
      :disabled="loading || disabled" :aria-busy="pending" @click="show" @keydown.down.prevent="show">
      <span v-if="loading">正在读取账号…</span>
      <template v-else-if="selected"><span class="selector-game">{{ gameFor(selected) }}</span><span aria-hidden="true">·</span><span class="account-name">{{ selected.name }}</span></template>
      <span v-else>选择游戏账号</span>
      <ChevronDown :size="14" aria-hidden="true" />
    </button>
    <small v-if="disabled && disabledReason" class="switch-status" role="status">{{ disabledReason }}</small>
    <small v-if="failure" class="switch-error" role="alert">{{ failure }}</small>
    <Teleport to="body">
      <div v-if="open" class="account-switch-mask" :class="{ 'is-desktop': desktop }" :style="desktop ? undefined : sheetViewport" @click.self="close">
        <section :id="panelId" ref="panel" class="account-switch-panel" :style="desktop ? position : sheetSize"
          role="dialog" aria-modal="true" :aria-labelledby="panelId + '-title'" tabindex="-1">
          <header><h2 :id="panelId + '-title'">{{ desktop ? (accounts.length > 1 ? '切换游戏账号' : '游戏账号') : '切换 BOX' }}</h2><button type="button" class="switch-close" aria-label="关闭游戏账号切换器" @click="close"><X :size="18" aria-hidden="true" /></button></header>
          <label v-if="accounts.length > 8" class="switch-search">搜索游戏或账号<input ref="searchInput" v-model="query" type="search" autocomplete="off" placeholder="输入游戏或账号名" /></label>
          <div class="switch-list" @keydown="moveFocus">
            <section v-for="group in groups" :key="group.game" :aria-label="group.game">
              <h3>{{ group.game }}</h3>
              <button v-for="account in group.accounts" :key="account.id" type="button" class="switch-option"
                :data-account-id="account.id" :aria-pressed="account.id === accountId" :aria-label="group.game + ' · ' + account.name + (account.id === accountId ? '，当前账号' : '')"
                :title="group.game + ' · ' + account.name" @click="select(account.id)">
                <Check :size="16" aria-hidden="true" :class="{ 'is-hidden': account.id !== accountId }" /><span class="switch-option-copy"><span>{{ account.name }}</span><span class="switch-option-game">{{ group.game }}</span></span><small v-if="account.id === accountId">当前</small>
              </button>
            </section>
            <p v-if="!groups.length">{{ accounts.length ? '没有匹配的游戏账号' : '还没有游戏账号，可以在这里新建。' }}</p>
          </div>
          <footer><button type="button" @click="openManager('create')"><Plus :size="16" aria-hidden="true" />{{ desktop ? '新建游戏账号' : '新建 BOX' }}</button><button type="button" @click="openManager('list')"><Settings :size="16" aria-hidden="true" />{{ desktop ? '管理游戏账号' : '管理 BOX' }}</button></footer>
        </section>
      </div>
    </Teleport>
    <GameAccountManager v-if="managerOpen" presentation="dialog" :initial-view="managerView" :accounts="accounts"
      :loading="loading" :load-error="loadError" :before-switch="beforeSwitch" :context-disabled="disabled"
      :settings-to="manageTo" @changed="managerRows = $event" @close="managerOpen = false" />
  </span>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { Check, ChevronDown, Plus, Settings, X } from '@lucide/vue'
import { activeAccount, normalizeAccountGame } from '../store/activeAccount.js'
import { auth } from '../store/auth.js'
import { useModalFocus } from '../composables/useModalFocus.js'
import GameAccountManager from './GameAccountManager.vue'

const props = defineProps({
  accounts: { type: Array, default: () => [] }, accountId: { type: String, default: '' }, game: { type: String, default: '' },
  loading: Boolean, disabled: Boolean, disabledReason: { type: String, default: '' }, beforeSwitch: Function,
  loadError: { type: String, default: '' },
  manageTo: { type: [String, Object], default: '/user/profile#game-accounts' },
})
const panelId = 'account-switch-' + useId()
const open = ref(false), panel = ref(null), trigger = ref(null), searchInput = ref(null), query = ref(''), pending = ref(false), failure = ref('')
const desktop = ref(false), position = ref({}), sheetViewport = ref({}), sheetSize = ref({})
const managerOpen = ref(false), managerView = ref('list'), managerRows = ref(null)
const accounts = computed(() => managerRows.value || props.accounts)
watch(() => props.accounts, () => { managerRows.value = null })
const selected = computed(() => accounts.value.find(account => account.id === props.accountId))
const gameFor = account => normalizeAccountGame(account.game || activeAccount.gameFor(account.id))
const label = computed(() => selected.value ? '当前游戏账号：' + gameFor(selected.value) + ' · ' + selected.value.name + '，打开账号切换器' : '选择游戏账号')
const groups = computed(() => {
  const result = new Map(), search = query.value.trim().toLocaleLowerCase()
  for (const account of accounts.value) {
    const game = gameFor(account)
    if (search && !(game + ' ' + account.name).toLocaleLowerCase().includes(search)) continue
    if (!result.has(game)) result.set(game, [])
    result.get(game).push(account)
  }
  return [...result].map(([game, accounts]) => ({ game, accounts }))
})
useModalFocus(open, panel, {
  initialFocus: () => searchInput.value || panel.value?.querySelector('[aria-pressed="true"]') || panel.value?.querySelector('.switch-option') || panel.value,
  onEscape: close,
})
let cleanup = null, alive = true, contextVersion = 0
function close() { open.value = false }
async function openManager(view = 'list', opener) {
  if (props.disabled || props.loading || pending.value || managerOpen.value) return
  const version = contextVersion
  close()
  await nextTick()
  if (!alive || version !== contextVersion || props.disabled || props.loading) return
  ;(opener || trigger.value)?.focus()
  managerView.value = props.loadError ? 'list' : view; managerOpen.value = true
}
defineExpose({ openManager })
function place() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return
  const viewport = window.visualViewport
  sheetViewport.value = { bottom: Math.max(0, window.innerHeight - (viewport?.height || window.innerHeight) - (viewport?.offsetTop || 0)) + 'px' }
  sheetSize.value = { maxHeight: Math.floor((viewport?.height || window.innerHeight) * .85) + 'px' }
  const width = Math.min(320, window.innerWidth - 24)
  const below = window.innerHeight - rect.bottom - 16, above = rect.top - 16
  const useBelow = below >= Math.min(360, window.innerHeight - 24) || below >= above
  position.value = {
    left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + 'px', width: width + 'px',
    ...(useBelow ? { top: rect.bottom + 4 + 'px' } : { bottom: window.innerHeight - rect.top + 4 + 'px' }),
    maxHeight: Math.min(440, Math.max(0, useBelow ? below : above)) + 'px',
  }
}
function show() {
  if (props.disabled || props.loading || pending.value) return
  query.value = ''; failure.value = ''; trigger.value?.focus(); open.value = true
}
watch(open, value => {
  cleanup?.(); cleanup = null
  if (!value) return
  const media = window.matchMedia('(min-width: 768px)')
  desktop.value = media.matches
  place()
  const overflow = document.body.style.overflow, rootOverflow = document.documentElement.style.overflow
  if (!desktop.value) document.body.style.overflow = document.documentElement.style.overflow = 'hidden'
  media.addEventListener('change', close)
  window.addEventListener('resize', place)
  window.addEventListener('scroll', place, true)
  window.visualViewport?.addEventListener('resize', place)
  window.visualViewport?.addEventListener('scroll', place)
  cleanup = () => {
    if (!desktop.value) { document.body.style.overflow = overflow; document.documentElement.style.overflow = rootOverflow }
    media.removeEventListener('change', close)
    window.removeEventListener('resize', place)
    window.removeEventListener('scroll', place, true)
    window.visualViewport?.removeEventListener('resize', place)
    window.visualViewport?.removeEventListener('scroll', place)
  }
}, { flush: 'sync' })
watch(() => [props.accountId, props.disabled, props.loading], close)
watch(() => [activeAccount.id, activeAccount.gameFor(), auth.accessToken, auth.userInfo?.id], () => { contextVersion++; close() }, { flush: 'sync' })
async function select(id) {
  if (pending.value || props.disabled || props.loading || !accounts.value.some(account => account.id === id)) return
  close()
  if (id === props.accountId) return
  const version = contextVersion, source = activeAccount.id, game = activeAccount.gameFor(source), identity = auth.accessToken, owner = auth.userInfo?.id
  pending.value = true; failure.value = ''
  try {
    // Restore focus before a page-specific confirmation takes ownership of it.
    await nextTick()
    if (!alive || version !== contextVersion || source !== activeAccount.id) return
    if (props.beforeSwitch && !(await props.beforeSwitch(id))) return
    if (!alive || version !== contextVersion || props.disabled || props.loading || source !== activeAccount.id || game !== activeAccount.gameFor(source) || identity !== auth.accessToken || owner !== auth.userInfo?.id || !accounts.value.some(account => account.id === id)) return
    activeAccount.set(id)
  } catch (error) { if (alive && version === contextVersion && source === activeAccount.id) failure.value = error.message || '暂时无法切换账号，请重试。' }
  finally { pending.value = false }
}
function moveFocus(event) {
  const options = [...panel.value.querySelectorAll('.switch-option')], index = options.indexOf(document.activeElement)
  if (index < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
  options[next]?.focus()
}
onBeforeUnmount(() => { alive = false; cleanup?.() })
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.context-selector { border: 0; border-radius: 6px; background: var(--cream); color: var(--theme-strong-text, var(--tea)); cursor: pointer; }
.context-selector:disabled { cursor: wait; opacity: .65; }
.switch-error { color: var(--theme-danger-text, var(--rouge)); }
.account-switch-mask { background: var(--theme-overlay, color-mix(in srgb, var(--ink) 35%, transparent)); }
.account-switch-panel { border: 1px solid var(--line); border-radius: 18px 18px 0 0; background: var(--surface); color: var(--ink); }
.account-switch-panel::before { content: ''; border-radius: 4px; background: var(--line); }
h2 { color: var(--theme-strong-text, var(--tea)); }
.switch-close { border: 0; background: transparent; color: inherit; cursor: pointer; }
h3 { color: var(--ink-60); }
.switch-option { border: 0; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.switch-option small { color: var(--theme-strong-text, var(--tea)); }
.switch-option-game { display: none; }
.switch-option[aria-pressed="true"] { background: color-mix(in srgb, var(--yellow) 28%, var(--surface)); }
.switch-option:hover, footer button:hover { background: var(--cream); }
footer { border-top: 1px solid var(--line); }
footer button { border: 0; border-radius: 6px; background: transparent; color: var(--theme-strong-text, var(--tea)); cursor: pointer; }
.switch-search { color: var(--ink-60); }
.switch-search input { border: 1px solid var(--line); border-radius: 6px; background: var(--cream); color: var(--ink); }
button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
@media (min-width: 768px) {
  .account-switch-mask { background: transparent; }
  .account-switch-panel { border-radius: 10px; box-shadow: 0 4px 16px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.08); }
}
</style>
<style scoped src="./accountSwitcherDesktop.css"></style>
<style scoped src="./accountSwitcherMobile.css"></style>
