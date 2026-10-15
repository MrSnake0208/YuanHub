<template>
  <div class="page-star-share">
    <IslandSidebar />
    <main id="main-content" class="share-main">
      <header class="page-header"><div class="wrap">
        <router-link class="page-header-back" to="/star">← 星石背包</router-link>
        <h1 class="page-header-title">星石背包分享</h1>
        <p class="page-header-description">只读查看分享者云端已保存的当前背包，无需登录。</p>
        <p v-if="share" class="page-header-context">{{ share.game }} · 只读分享</p>
      </div></header>
      <section class="share-content"><div class="wrap">
        <form v-if="status === 'input'" class="share-entry" @submit.prevent="submit">
          <span class="section-kicker">公开查看</span><h2>输入星石分享码</h2>
          <p>可粘贴分享码，也可粘贴完整分享链接。</p>
          <label for="star-share-token">星石分享码或分享链接</label>
          <div class="share-entry-row"><input id="star-share-token" v-model="input" autocomplete="off" :aria-invalid="!!inputError" :aria-describedby="inputError ? 'star-share-input-error' : undefined" placeholder="粘贴分享码或链接" /><button type="submit">查看星石背包</button></div>
          <p v-if="inputError" id="star-share-input-error" class="entry-error" role="alert">{{ inputError }}</p>
        </form>
        <div v-else-if="status === 'loading'" class="share-state" role="status" aria-live="polite"><h2>正在打开星石背包</h2><p>正在读取云端公开数据…</p></div>
        <div v-else-if="status === 'not-found' || status === 'unauthorized'" class="share-state" role="alert">
          <h2>{{ status === 'unauthorized' ? '分享者尚未公开星石背包' : '分享码不存在或已失效' }}</h2>
          <p>{{ status === 'unauthorized' ? '此分享码没有星石授权，请向分享者确认。' : '分享可能已撤销、重新生成，或代码输入有误。' }}</p>
          <div class="state-actions"><button type="button" @click="load">重试</button><button type="button" @click="reset">重新输入</button></div>
        </div>
        <div v-else-if="status === 'error'" class="share-state" role="alert"><h2>暂时无法加载</h2><p>{{ loadError }}</p><div class="state-actions"><button type="button" @click="load">重试</button><button type="button" @click="reset">重新输入</button></div></div>
        <template v-else>
          <div class="share-toolbar"><p>云端状态保存于 <time :datetime="share.updated_at || undefined">{{ formatDate(share.updated_at) }}</time></p><button type="button" :disabled="refreshing" @click="load">{{ refreshing ? '刷新中…' : '刷新数据' }}</button><button type="button" @click="reset">重新输入</button></div>
          <p v-if="refreshing" class="share-empty-note" role="status">正在读取最新云端背包…</p>
          <div v-if="status === 'missing'" class="share-state"><h2>暂无已保存的云端星石背包</h2><p>分享已开启，等待分享者保存云端数据。</p></div>
          <template v-else><p v-if="!share.inventory.length" class="share-empty-note" role="status">当前云端背包为空。</p><StarShareInventoryGrid :inventory="share.inventory" v-model:quality="quality" v-model:search="search" v-model:sort="sort" /></template>
        </template>
      </div></section>
      <SiteFooter><template #big>星石背包<br /><span>只读分享</span></template><template #fine><b>YuanHub</b> · 数据仅供参考，请以游戏内实际背包为准</template></SiteFooter>
    </main>
  </div>
</template>
<script setup>
import '@/styles/page-header.css'
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import StarShareInventoryGrid from '../../components/star/StarShareInventoryGrid.vue'
import { viewStarShare } from '../../api/accountShare.js'
import { parseShareLink, shareRoute } from '../../utils/shareLink.js'

const route = useRoute(), router = useRouter()
const input = ref(''), inputError = ref(''), loadError = ref(''), status = ref('input'), share = ref(null)
const quality = ref('all'), search = ref(''), sort = ref('catalog'), refreshing = ref(false)
let sequence = 0
function submit() {
  const target = parseShareLink(input.value, 'star')
  if (!target) { inputError.value = '未识别到有效的分享码或分享链接'; return }
  inputError.value = ''; router.push(shareRoute(target))
}
function reset() { router.push({ name: 'star-share' }) }
async function load() {
  const token = parseShareLink(route.params.token, 'star')?.token, seq = ++sequence
  loadError.value = ''
  if (!token) { status.value = 'input'; return }
  refreshing.value = Boolean(share.value)
  if (!share.value) status.value = 'loading'
  try {
    const data = await viewStarShare(token)
    if (seq !== sequence) return
    share.value = data
    status.value = data.has_state ? 'ready' : 'missing'
  } catch (err) {
    if (seq !== sequence) return
    share.value = null
    status.value = err?.code === 'share_not_authorized' ? 'unauthorized' : err?.status === 404 || err?.code === 'share_not_found' ? 'not-found' : 'error'
    loadError.value = err?.code === 'REQUEST_TIMEOUT' ? '读取分享数据超时，请检查网络后重试。' : err?.status >= 500 ? '分享服务暂时不可用，请稍后重试。' : '暂时无法读取分享数据，请检查网络后重试。'
  } finally {
    if (seq === sequence) refreshing.value = false
  }
}
function formatDate(value) {
  if (!value) return '暂无保存记录'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
watch(() => route.params.token, token => {
  if (token) input.value = String(token)
  share.value = null; refreshing.value = false
  quality.value = 'all'; search.value = ''; sort.value = 'catalog'
  inputError.value = ''; void load()
}, { immediate: true })
onBeforeUnmount(() => { sequence++ })
</script>
<style scoped>
.share-main { padding-bottom: 0 }.share-content { padding-top: 12px; padding-bottom: 24px }
.share-entry,.share-state { border: 1px solid var(--line); border-radius: 20px; background: var(--surface); padding: 28px; color: var(--ink) }
.share-entry { max-width: 780px; margin: 0 auto }.share-state { text-align: center }
.share-entry h2,.share-state h2 { font: 900 24px var(--font-s) }.share-entry p,.share-state p { margin-top: 8px; color: var(--ink-60); font-size: 13px; line-height: 1.8 }
.section-kicker { display: block; margin-bottom: 8px; color: var(--accent-strong); font-size: 12px; font-weight: 800 }
.share-entry label { display: block; margin-top: 24px; color: var(--ink-60); font-size: 12px; font-weight: 800 }
.share-entry-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; margin-top: 8px }
.share-entry input { min-width: 0; min-height: 46px; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--paper); color: var(--ink); font: 16px var(--font-b) }
button { min-height: 44px; border: 1px solid var(--tea); border-radius: 999px; padding: 8px 16px; background: var(--tea); color: var(--cream); font: 700 13px var(--font-b); cursor: pointer }
button:focus-visible,input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
button:disabled { opacity: .6; cursor: wait }
.state-actions { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; margin-top: 16px }
.share-toolbar { display: grid; grid-template-columns: minmax(0,1fr) auto auto; align-items: center; gap: 10px; padding-bottom: 14px; margin-bottom: 16px; border-bottom: 1px solid var(--line) }
.share-toolbar p,.share-empty-note { color: var(--ink-60); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere }.share-empty-note { margin-bottom: 12px }
.share-entry .entry-error { color: var(--rouge) }
@media(max-width:640px) { .share-entry,.share-state { padding: 20px 16px }.share-entry-row { grid-template-columns: 1fr }.share-toolbar { grid-template-columns: repeat(2,minmax(0,1fr)) }.share-toolbar p { grid-column: 1 / -1 }.share-content { padding-bottom: calc(16px + env(safe-area-inset-bottom)) } }
</style>
