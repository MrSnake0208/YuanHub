<template>
  <div class="page-changelog">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero"><div class="wrap"><div class="crumb"><span class="pill fill">YuanHub</span><span class="pill">更新日志</span></div><h1>更新日志<span class="small">Changelog</span></h1><p class="hero-sub">了解 YuanHub 最近新增与改进的内容。</p></div></header>
      <section class="wrap changelog-feed" aria-live="polite">
        <p v-if="loading && !entries.length" class="state">正在加载更新日志…</p>
        <p v-else-if="error && !entries.length" class="state error" role="alert">{{ error }} <button type="button" @click="load(1)">重试</button></p>
        <p v-else-if="!entries.length" class="state">还没有已发布的更新日志。</p>
        <article v-for="entry in entries" :key="entry.id + '-' + entry.revision" class="changelog-card">
          <header><span class="version">{{ entry.versionLabel }}</span><time :datetime="entry.publishedAt">{{ formatDate(entry.publishedAt) }}</time><h2>{{ entry.title }}</h2></header>
          <ChangelogContent :body="entry.body" />
        </article>
        <p v-if="error && entries.length" class="inline-error" role="alert">{{ error }}</p>
        <button v-if="hasNext" class="load-more" type="button" :disabled="loading" @click="load(page + 1)">{{ loading ? '正在加载…' : '加载更多' }}</button>
      </section>
      <SiteFooter><template #big>持续更新<br><span>让每次改变都有迹可循</span></template><template #fine><b>YuanHub</b> · 更新日志<br>仅展示审核通过的公开内容</template></SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { listChangelog } from '../../api/changelog.js'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import ChangelogContent from '../../components/changelog/ChangelogContent.vue'

const entries = ref([])
const page = ref(1)
const hasNext = ref(false)
const loading = ref(false)
const error = ref('')

async function load(nextPage) {
  loading.value = true
  error.value = ''
  try {
    const result = await listChangelog({ page: nextPage })
    entries.value = nextPage === 1 ? result.data : entries.value.concat(result.data)
    page.value = result.page
    hasNext.value = result.hasNext
  } catch (err) {
    error.value = err && err.message ? err.message : '更新日志加载失败'
  } finally { loading.value = false }
}

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

onMounted(function () { load(1) })
</script>

<style scoped>
.page-changelog { min-height: 100vh; }
.page-changelog .hero { --wm: '新'; }
.changelog-feed { display: grid; gap: 22px; padding-bottom: 12px; }
.changelog-card { padding: clamp(22px, 4vw, 42px); background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: 0 18px 38px -30px rgba(73,59,44,.45); }
.changelog-card header { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 9px 12px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
.changelog-card h2 { grid-column: 1 / -1; font-family: var(--font-s); font-size: clamp(25px, 4vw, 36px); font-weight: 900; }
.version { width: max-content; padding: 4px 11px; background: var(--yellow); border-radius: 999px; font-family: var(--font-d); font-size: 12px; font-weight: 800; }
.changelog-card time { color: var(--ink-60); font-family: var(--font-d); font-size: 12px; }
.state { min-height: 220px; display: grid; place-content: center; text-align: center; color: var(--ink-60); background: rgba(255,253,246,.7); border: 1px dashed var(--line); border-radius: 18px; }
.state button, .load-more { margin: 12px auto 0; padding: 10px 22px; border: 0; border-radius: 999px; color: var(--cream); background: var(--tea); font-weight: 800; cursor: pointer; }
.inline-error { color: var(--rouge); text-align: center; }
.load-more { display: block; }
.load-more:disabled { opacity: .55; cursor: wait; }
@media (max-width: 640px) { .changelog-card { border-radius: 14px; } }
</style>
