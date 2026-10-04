<template>
  <div class="page-changelog">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero"><div class="wrap"><div class="crumb"><span class="pill fill">YuanHub</span><span class="pill">更新日志</span><span class="pill">站点版本 {{ productVersionLabel }}</span></div><h1>更新日志<span class="small">Changelog</span></h1><p class="hero-sub">了解 YuanHub 最近新增与改进的内容。站点版本来自当前构建，下方日志为审核通过的公开记录。</p></div></header>
      <section class="wrap changelog-feed" aria-live="polite">
        <p v-if="loading && !entries.length" class="state">正在加载更新日志…</p>
        <p v-else-if="error && !entries.length" class="state error" role="alert">{{ error }} <button type="button" @click="load(1)">重试</button></p>
        <p v-else-if="!entries.length" class="state">还没有已发布的更新日志。</p>
        <article v-for="(entry, index) in entries" :id="'version-' + entry.id" :key="entry.id + '-' + entry.revision" class="changelog-card">
          <header><span class="version">{{ index === 0 ? '最新公开日志 · ' : '' }}{{ entry.versionLabel }}</span><time :datetime="entry.publishedAt">{{ formatDate(entry.publishedAt) }}</time><h2>{{ entry.title }}</h2></header>
          <ul v-if="changelogHighlights(entry.body, entry.title).length" class="changelog-highlights" aria-label="更新摘要"><li v-for="(text, line) in changelogHighlights(entry.body, entry.title)" :key="line"><span>{{ text }}</span></li></ul>
          <details class="changelog-full" :open="index === 0">
            <summary>阅读完整更新</summary>
            <ChangelogContent :body="entry.body" />
          </details>
          <ChangelogRelatedFeedback :version-id="entry.id" />
        </article>
        <p v-if="error && entries.length" class="inline-error" role="alert">{{ error }}</p>
        <p v-if="anchorMissing" class="anchor-status" role="status">未找到此链接对应的公开日志。</p>
        <p v-else-if="anchorPending" class="anchor-status" role="status">此日志尚未加载，可继续加载更多查找。</p>
        <button v-if="hasNext" class="load-more" type="button" :disabled="loading" @click="load(page + 1)">{{ loading ? '正在加载…' : '加载更多' }}</button>
      </section>
      <SiteFooter><template #big>持续更新<br><span>让每次改变都有迹可循</span></template><template #fine><b>YuanHub</b> · 更新日志<br>仅展示审核通过的公开内容</template></SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { listChangelog } from '../../api/changelog.js'
import { productVersionLabel } from '../../config/buildInfo.js'
import { changelogHighlights } from '../../utils/changelogContent.js'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import ChangelogContent from '../../components/changelog/ChangelogContent.vue'
import ChangelogRelatedFeedback from '../../components/changelog/ChangelogRelatedFeedback.vue'

const entries = ref([])
const page = ref(1)
const hasNext = ref(false)
const loading = ref(false)
const error = ref('')
const anchorMissing = ref(false)
const anchorPending = ref(false)
// ponytail: 深链每次最多自动读取五页，更久的历史可继续加载；有公开单条接口后改为直接定位。
const ANCHOR_PAGE_LIMIT = 5
let mounted = false
let requestId = 0

async function load(nextPage) {
  if (loading.value) return
  const current = ++requestId
  const hash = window.location.hash.startsWith('#version-') ? window.location.hash : ''
  loading.value = true
  error.value = ''
  anchorMissing.value = false
  anchorPending.value = false
  try {
    let remaining = ANCHOR_PAGE_LIMIT
    while (mounted && current === requestId) {
      const result = await listChangelog({ page: nextPage })
      if (!mounted || current !== requestId) return
      if (result.page !== nextPage || (!result.data.length && result.hasNext)) throw new Error('日志分页响应异常，请重试。')
      entries.value = nextPage === 1 ? result.data : entries.value.concat(result.data)
      page.value = result.page
      hasNext.value = result.hasNext
      if (!hash || window.location.hash !== hash) break
      await nextTick()
      if (!mounted || current !== requestId || window.location.hash !== hash) return
      const target = document.getElementById(hash.slice(1))
      if (target) {
        const details = target.querySelector('details')
        if (details) details.open = true
        target.scrollIntoView({ block: 'start' })
        break
      }
      if (!hasNext.value) { anchorMissing.value = true; break }
      if (--remaining === 0) { anchorPending.value = true; break }
      nextPage = page.value + 1
    }
  } catch (err) {
    if (!mounted || current !== requestId) return
    error.value = err && err.message ? err.message : '更新日志加载失败'
  } finally { if (mounted && current === requestId) loading.value = false }
}

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

onMounted(function () { mounted = true; load(1) })
onBeforeUnmount(function () { mounted = false; requestId += 1 })
</script>

<style scoped>
.page-changelog { min-height: 100vh; min-height: 100dvh; }
.page-changelog .hero { --wm: '新'; }
.page-changelog .hero { padding: 38px 0 28px; }
.page-changelog .hero h1 { font-size: clamp(32px, 4vw, 48px); line-height: 1.2; }
.page-changelog .hero h1 .small { font-size: 18px; }
.changelog-card { scroll-margin-top: 84px; }
.changelog-highlights { margin-top: 18px; padding-left: 20px; color: var(--ink-60); font-size: 14px; line-height: 1.8; }
.changelog-highlights li { margin-block: 6px; overflow-wrap: anywhere; }
.changelog-highlights li span { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.changelog-full summary { min-height: 44px; padding-top: 14px; color: var(--tea); font-size: 13px; font-weight: 800; cursor: pointer; }
.page-changelog .crumb .pill { white-space: nowrap; }
.changelog-feed { display: grid; gap: 22px; padding-bottom: 12px; }
.changelog-card { padding: clamp(22px, 4vw, 42px); background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: 0 18px 38px -30px rgba(73,59,44,.45); }
.changelog-card header { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 9px 12px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
.changelog-card h2 { grid-column: 1 / -1; font-family: var(--font-s); font-size: clamp(25px, 4vw, 36px); font-weight: 900; }
.version { width: max-content; padding: 4px 11px; background: var(--yellow); border-radius: 999px; font-family: var(--font-d); font-size: 12px; font-weight: 800; }
.changelog-card time { color: var(--ink-60); font-family: var(--font-d); font-size: 12px; }
.state { min-height: 220px; display: grid; place-content: center; text-align: center; color: var(--ink-60); background: rgba(255,253,246,.7); border: 1px dashed var(--line); border-radius: 18px; }
.state button, .load-more { min-height: 44px; margin: 12px auto 0; padding: 10px 22px; border: 0; border-radius: 999px; color: var(--cream); background: var(--tea); font-weight: 800; cursor: pointer; }
.inline-error { color: var(--rouge); text-align: center; }
.anchor-status { color: var(--ink-60); font-size: 13px; text-align: center; }
.load-more { display: block; }
.load-more:disabled { opacity: .55; cursor: wait; }
@media (max-width: 640px) { .changelog-card { border-radius: 14px; } }
</style>
