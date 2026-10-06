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
          <header><h2 :id="panelId + '-title'">{{ accounts.length > 1 ? '切换游戏账号' : '游戏账号' }}</h2><button type="button" class="switch-close" aria-label="关闭游戏账号切换器" @click="close"><X :size="18" aria-hidden="true" /></button></header>
          <label v-if="accounts.length > 8" class="switch-search">搜索游戏或账号<input ref="searchInput" v-model="query" type="search" autocomplete="off" placeholder="输入游戏或账号名" /></label>
          <div class="switch-list" @keydown="moveFocus">
            <section v-for="group in groups" :key="group.game" :aria-label="group.game">
              <h3>{{ group.game }}</h3>
              <button v-for="account in group.accounts" :key="account.id" type="button" class="switch-option"
                :data-account-id="account.id" :aria-pressed="account.id === accountId" :aria-label="group.game + ' · ' + account.name + (account.id === accountId ? '，当前账号' : '')"
                :title="group.game + ' · ' + account.name" @click="select(account.id)">
                <Check :size="16" aria-hidden="true" :class="{ 'is-hidden': account.id !== accountId }" /><span>{{ account.name }}</span><small v-if="account.id === accountId">当前</small>
              </button>
            </section>
            <p v-if="!groups.length">{{ accounts.length ? '没有匹配的游戏账号' : '还没有游戏账号，可以在这里新建。' }}</p>
          </div>
          <footer><button type="button" @click="openManager('create')"><Plus :size="16" aria-hidden="true" />新建游戏账号</button><button type="button" @click="openManager('list')"><Settings :size="16" aria-hidden="true" />管理游戏账号</button></footer>
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
.account-switcher { display: inline-flex; align-items: center; flex-wrap: wrap; min-width: 0; max-width: 100%; gap: 0 8px; }
.context-selector { display: inline-flex; align-items: center; gap: 6px; min-width: 0; min-height: 44px; max-width: 100%; padding: 8px; border: 0; border-radius: 6px; background: var(--cream); color: var(--tea); font: 500 13px/1.5 var(--font-b); cursor: pointer; }
.context-selector:disabled { cursor: wait; opacity: .65; }
.selector-game, svg { flex: none; }
.account-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; max-width: 10em; }
.switch-status, .switch-error { flex-basis: 100%; font: 12px/1.6 var(--font-b); overflow-wrap: anywhere; }
.switch-error { color: var(--rouge); }
.account-switch-mask { position: fixed; inset: 0; z-index: var(--z-overlay); display: flex; align-items: flex-end; background: color-mix(in srgb, var(--ink) 35%, transparent); }
.account-switch-panel { display: flex; flex-direction: column; width: 100%; min-width: 0; max-height: 85vh; max-height: 85dvh; border: 1px solid var(--line); border-radius: 18px 18px 0 0; padding: 8px max(12px, env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); background: var(--surface); color: var(--ink); font: 14px/1.6 var(--font-b); }
.account-switch-panel::before { content: ''; width: 32px; height: 4px; flex: none; margin: 0 auto 4px; border-radius: 4px; background: var(--line); }
header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex: none; }
h2 { margin: 0; font: 900 18px/1.4 var(--font-s); color: var(--tea); }
.switch-close { display: grid; place-items: center; min-width: 44px; min-height: 44px; border: 0; background: transparent; color: inherit; cursor: pointer; }
.switch-list { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 4px; }
h3 { margin: 8px 8px 4px; color: var(--ink-60); font: 600 12px/1.6 var(--font-b); }
.switch-option { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; border: 0; border-radius: 6px; padding: 8px; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.switch-option > span { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.switch-option small { flex: none; color: var(--tea); font-size: 12px; }
.switch-option[aria-pressed="true"] { background: color-mix(in srgb, var(--yellow) 28%, var(--surface)); font-weight: 700; }
.switch-option:hover, footer button:hover { background: var(--cream); }
.is-hidden { visibility: hidden; }
footer { flex: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); }
footer button { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 8px 12px; border: 0; border-radius: 6px; background: transparent; text-align: left; color: var(--tea); font: inherit; cursor: pointer; }
.switch-search { display: grid; gap: 4px; flex: none; padding: 4px; color: var(--ink-60); font-size: 12px; }
.switch-search input { width: 100%; min-width: 0; min-height: 44px; border: 1px solid var(--line); border-radius: 6px; padding: 8px; background: var(--cream); color: var(--ink); font: 16px/1.5 var(--font-b); }
button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (min-width: 768px) {
  .account-switch-mask { background: transparent; z-index: var(--z-popover); }
  .account-switch-panel { position: fixed; max-width: calc(100vw - 24px); border-radius: 10px; padding: 8px; box-shadow: 0 4px 16px rgba(73, 59, 44, .08); }
  .account-switch-panel::before { display: none; }
}
</style>
