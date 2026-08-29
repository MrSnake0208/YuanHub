<template>
  <div class="page-star">
    <IslandSidebar />
    <main id="main-content" class="star-main">
      <header class="hero"><div class="wrap">
        <div class="crumb"><span class="pill fill">星石</span><span class="pill">识别</span><span class="pill">养成</span><span class="pill">经验</span></div>
        <h1>星石养成<span class="small">背包 · 整理 · 计划</span></h1>
        <p class="hero-sub">如鸢 / 代号鸢 星石背包整理：本地导入截图并完成 OCR 与人工核对，管理当前背包、养成计划与经验星曜，并在登录后同步当前账号数据。</p>
        <div class="hero-stats"><div><div class="k">当前背包</div><div class="v">{{ summary.currentCount }}<small class="stat-unit">颗</small></div></div><div><div class="k">养成计划</div><div class="v">{{ summary.planCount }}<small class="stat-unit">颗</small></div></div><div><div class="k">当前版本</div><div class="v game-stat">{{ summary.gameVersion }}</div></div><div class="is-authed"><div class="k">登录状态</div><div class="v">{{ auth.isLoggedIn ? '已登录' : '未登录' }}</div></div></div>
      </div></header>
      <section><div class="wrap">
        <AccountWorkspace v-model:accountId="accountId" v-model:game="accountGame" :accounts="accounts" :error="accountError" :disabled="!auth.isLoggedIn || accountsLoading || accountBusy" :game-disabled="!auth.isLoggedIn || accountsLoading || accountBusy" :busy="accountBusy" stacked soft-dropdown heading-title="选择要查看的账号" heading-sub="星石、库存和密探都会跟随这个子账号，在各页面保持一致。" @change="onAccountChange" @game-change="onAccountGameChange" @create="onCreateAccount" @rename="onRenameAccount" @delete="onDeleteAccount" />
        <div class="star-tabs" role="tablist" aria-label="星石工作区"><button role="tab" :aria-selected="activeTab === 'import'" :class="{ on: activeTab === 'import' }" @click="setTab('import')">导入识别</button><button role="tab" :aria-selected="activeTab === 'review'" :class="{ on: activeTab === 'review' }" @click="setTab('review')">人工核对</button></div>
        <div id="product-root" ref="mountRoot"></div>
        <p v-if="mountError" class="yuanstar-mount-error" role="alert">YuanStar 产品页加载失败：{{ mountError }}</p>
      </div></section>
      <SiteFooter>
        <template #big>星石养成<br><span>背包 · 整理 · 计划</span></template>
        <template #fine>
          <b>YuanHub</b> · 星石养成工作区<br>
          MAA × 代号鸢BWiki × 辟雍学宫 × YuanAssist 共同搭建<br>
          数据仅供参考，请以游戏内实际背包为准
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AccountWorkspace from '../../components/AccountWorkspace.vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { createAccount, deleteAccount, listAccounts, renameAccount, updateAccountGame } from '../../api/accounts.js'
import { auth } from '../../store/auth.js'
import { activeAccount, isAccountGame } from '../../store/activeAccount.js'
import { disposeYuanStarHandle, waitForYuanStarDisposal } from './embedLifecycle.js'

const EMBED_MODULE_URL = '/yuanstar-embed/yuanstar-embed.js'
const EMBED_STYLESHEET_URL = '/yuanstar-embed/yuanstar-embed.css'
const EMBED_STYLESHEET_ID = 'yuanstar-embed-styles'
const mountRoot = ref(null)
const mountError = ref('')
const accounts = ref([])
const accountsLoading = ref(false)
const accountBusy = ref(false)
const accountError = ref('')
const activeTab = ref('import')
const summary = ref({ currentCount: 0, planCount: 0, gameVersion: '如鸢' })
let handle = null
let unmounted = false
let mountedAccountId = ''

const accountId = computed({ get: function () { return activeAccount.id }, set: function (value) { activeAccount.set(value) } })
const accountGame = computed({ get: function () { return activeAccount.gameFor(accountId.value) }, set: function (value) { activeAccount.setGame(value, accountId.value) } })
function message(error, fallback) { return error instanceof Error && error.message ? error.message : fallback }
function selectedHostAccount() {
  if (!auth.isLoggedIn) return null
  const account = accounts.value.find(function (item) { return item.id === accountId.value })
  return account ? { accountId: account.id, displayName: account.name, gameVersion: isAccountGame(account.game) ? account.game : accountGame.value } : null
}
async function loadAccounts() {
  if (!auth.isLoggedIn) { accounts.value = []; accountId.value = ''; return }
  accountsLoading.value = true; accountError.value = ''
  try {
    const list = await listAccounts()
    accounts.value = Array.isArray(list) ? list : []
    activeAccount.syncAccounts(accounts.value)
    if (!accounts.value.some(function (account) { return account.id === accountId.value })) accountId.value = accounts.value[0]?.id || ''
  } catch (error) { accountError.value = message(error, '子账号加载失败') } finally { accountsLoading.value = false }
}
async function syncHostAccount() {
  if (!handle) return
  const host = selectedHostAccount()
  try { await handle.setHostAccount(host); mountedAccountId = host?.accountId || '' } catch (error) { if (mountedAccountId) accountId.value = mountedAccountId; accountError.value = message(error, '星石账号切换失败'); throw error }
}
async function onAccountChange() { try { await syncHostAccount() } catch (_error) {} }
async function onAccountGameChange(game) {
  const account = accounts.value.find(function (item) { return item.id === accountId.value }); if (!account) return
  const oldGame = isAccountGame(account.game) ? account.game : accountGame.value
  accountBusy.value = true; accountError.value = ''
  try { const updated = await updateAccountGame(account.id, game); Object.assign(account, updated || {}, { game: isAccountGame(updated && updated.game) ? updated.game : game }); activeAccount.setGame(account.game, account.id); await syncHostAccount() } catch (error) { account.game = oldGame; activeAccount.setGame(oldGame, account.id); accountError.value = message(error, '游戏版本保存失败') } finally { accountBusy.value = false }
}
async function onCreateAccount(rawName) {
  const name = String(rawName || '').trim(); if (!name) return
  accountBusy.value = true; accountError.value = ''
  try { const created = await createAccount(name, accountGame.value); await loadAccounts(); if (created?.id) { activeAccount.setGame(isAccountGame(created.game) ? created.game : accountGame.value, created.id); accountId.value = created.id }; await syncHostAccount() } catch (error) { accountError.value = message(error, '创建账号失败') } finally { accountBusy.value = false }
}
async function onRenameAccount(account) {
  const name = prompt('修改子账号名称（1~64 字）：', account.name || ''); if (name == null) return
  const trimmed = name.trim(); if (!trimmed) { accountError.value = '名称不能为空'; return }
  accountBusy.value = true; accountError.value = ''
  try { const updated = await renameAccount(account.id, trimmed); Object.assign(account, updated || {}, { name: (updated && updated.name) || trimmed }); if (account.id === accountId.value) await syncHostAccount() } catch (error) { accountError.value = message(error, '改名失败') } finally { accountBusy.value = false }
}
async function onDeleteAccount(account) {
  if (!confirm('删除子账号「' + account.name + '」？该账号的库存数据、密探数据、特别关注和所有 API Token 都会被一并清除，且不可恢复。')) return
  accountBusy.value = true; accountError.value = ''
  try { await deleteAccount(account.id); activeAccount.forgetGame(account.id); await loadAccounts(); await syncHostAccount() } catch (error) { accountError.value = message(error, '删除账号失败') } finally { accountBusy.value = false }
}
function ensureEmbedStylesheet() {
  if (document.getElementById(EMBED_STYLESHEET_ID)) return Promise.resolve()
  return new Promise(function (resolve, reject) { const link = document.createElement('link'); link.id = EMBED_STYLESHEET_ID; link.rel = 'stylesheet'; link.href = EMBED_STYLESHEET_URL; link.addEventListener('load', resolve, { once: true }); link.addEventListener('error', function () { reject(new Error('YuanStar 样式资源加载失败。')) }, { once: true }); document.head.appendChild(link) })
}
function loadEmbedModule() { return Function('url', 'return import(url)')(EMBED_MODULE_URL) }
async function mountProduct() {
  try {
    await waitForYuanStarDisposal(); await ensureEmbedStylesheet(); const product = await loadEmbedModule()
    if (unmounted || !mountRoot.value) return
    const mountedHandle = product.mountYuanStar(mountRoot.value, { assetBaseUrl: '/yuanstar-embed/', embedded: true, hostAccount: selectedHostAccount(), onSummaryChange: function (nextSummary) { summary.value = nextSummary } })
    if (unmounted) { await mountedHandle.dispose(); return }
    handle = mountedHandle; mountedAccountId = selectedHostAccount()?.accountId || ''
  } catch (error) { if (!unmounted) mountError.value = message(error, '请稍后重试。') }
}
function setTab(tab) { activeTab.value = tab; handle?.setActiveTab(tab) }
onMounted(async function () { await loadAccounts(); void mountProduct() })
onBeforeUnmount(function () { unmounted = true; const current = handle; handle = null; if (current) void disposeYuanStarHandle(current).catch(function () {}) })
</script>

<style scoped>
.page-star { --wm: '星石' }.star-main { min-height: 100vh }.game-stat { font-size: 21px; line-height: 1.4 }.star-tabs { position: sticky; top: 24px; z-index: 45; display: flex; gap: 4px; margin-top: 32px; padding: 5px; border: 1px solid var(--line); border-radius: 14px; background: rgba(255, 248, 236, .94); backdrop-filter: blur(12px); box-shadow: 0 12px 28px -22px rgba(73, 59, 44, .5) }.star-tabs button { display: inline-flex; align-items: center; justify-content: center; border: none; border-radius: 10px; padding: 10px 26px; color: var(--ink-60); background: transparent; cursor: pointer; font-family: var(--font-b); font-size: 14px; font-weight: 700 }.star-tabs button.on { color: var(--cream); background: var(--tea) }.star-tabs button:hover:not(.on) { color: var(--ink) }#product-root { min-width: 0; background: transparent }.yuanstar-mount-error { margin: 24px 0; padding: 16px 20px; border: 1px solid rgba(166, 81, 74, .45); border-radius: 14px; color: var(--rouge); background: var(--surface); font-weight: 700; line-height: 1.7 }
@media (max-width: 1080px) { .star-main > section { padding-bottom: 40px }.page-star :deep(.footer) { padding-bottom: calc(32px + 64px + env(safe-area-inset-bottom)) }.star-tabs { position: fixed; top: auto; right: 0; bottom: 0; left: 0; z-index: 55; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; margin: 0; padding: 7px max(12px, env(safe-area-inset-right)) calc(7px + env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); border: 0; border-top: 1px solid var(--line); border-radius: 0; background: rgba(255, 248, 236, .96); box-shadow: 0 -10px 26px -18px rgba(73, 59, 44, .48) }.star-tabs button { min-height: 48px; padding: 6px 8px; border-radius: 11px; font-size: 11.5px; line-height: 1.1 }.star-tabs button.on { color: var(--ink); background: var(--yellow) } }
</style>
