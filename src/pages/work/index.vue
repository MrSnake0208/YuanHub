<template>
  <div class="page-plaza works-page">
    <IslandSidebar />

    <main id="main-content">
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">作业</span>
            <span class="pill">公开数据</span>
          </div>
          <h1>作业广场<span class="small">Work Protocol v1</span></h1>
          <p class="hero-sub">浏览已公开的真实作业、Legacy 转换结果与目标平台兼容性。</p>
          <div class="hero-stats" aria-label="作业列表统计">
            <div><div class="k">公开作业</div><div class="v">{{ total }}<small>份</small></div></div>
            <div><div class="k">当前页</div><div class="v">{{ page }}<small>/ {{ totalPages }}</small></div></div>
            <div><div class="k">每页</div><div class="v">{{ limit }}<small>份</small></div></div>
            <div><div class="k">数据来源</div><div class="v source-value">API<small>实时读取</small></div></div>
          </div>
        </div>
      </header>

      <section class="works-content">
        <div class="wrap">
          <div class="works-heading">
            <div>
              <span class="eyebrow">PUBLIC WORKS</span>
              <h2>公开作业</h2>
            </div>
            <p>当前后端暂不提供搜索、筛选或自定义排序。</p>
          </div>

          <div class="works-live" aria-live="polite" aria-atomic="true">
            <div v-if="loading" class="works-state" aria-busy="true">
              <span class="loading-mark" aria-hidden="true"></span>
              <strong>正在加载作业</strong>
              <span>请稍候，正在读取公开 Work API。</span>
            </div>

            <div v-else-if="error" class="works-state error" role="alert">
              <strong>作业列表加载失败</strong>
              <span>{{ error }}</span>
              <button type="button" @click="loadWorks">重新加载</button>
            </div>

            <div v-else-if="items.length === 0" class="works-state">
              <strong>暂时没有公开作业</strong>
              <span>这里不会使用演示数据填充空列表。</span>
            </div>

            <template v-else>
              <div class="list">
                <WorkCard
                  v-for="(work, index) in items"
                  :key="work.id"
                  :work="work"
                  :page="page"
                  :rank="String((page - 1) * limit + index + 1).padStart(2, '0')"
                />
              </div>
              <nav class="works-pagination" aria-label="作业列表分页">
                <button type="button" :disabled="page <= 1 || loading" @click="goToPage(page - 1)">← 上一页</button>
                <span>第 {{ page }} 页，共 {{ totalPages }} 页</span>
                <button type="button" :disabled="!hasNext || loading" @click="goToPage(page + 1)">下一页 →</button>
              </nav>
            </template>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>YuanHub<br><span>公开作业与兼容性</span></template>
        <template #fine>本阶段仅提供读取与展示，不提供上传、编辑或导出执行。</template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listWorks } from '@/api/work.js'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import WorkCard from '@/components/WorkCard.vue'

const PAGE_SIZE = 20
const route = useRoute()
const router = useRouter()
const items = ref([])
const page = ref(1)
const limit = ref(PAGE_SIZE)
const total = ref(0)
const hasNext = ref(false)
const loading = ref(true)
const error = ref('')
let requestVersion = 0

const totalPages = computed(function () {
  return Math.max(1, Math.ceil(total.value / limit.value))
})

function queryPage() {
  const value = Number(route.query.page || 1)
  return Number.isInteger(value) && value > 0 ? value : 1
}

async function loadWorks() {
  const version = ++requestVersion
  const requestedPage = queryPage()
  page.value = requestedPage
  loading.value = true
  error.value = ''
  try {
    const data = await listWorks({ page: requestedPage, limit: PAGE_SIZE })
    if (version !== requestVersion) return
    items.value = Array.isArray(data && data.items) ? data.items : []
    page.value = Number.isInteger(data && data.page) && data.page > 0 ? data.page : requestedPage
    limit.value = Number.isInteger(data && data.limit) && data.limit > 0 ? data.limit : PAGE_SIZE
    total.value = Number.isFinite(Number(data && data.total)) ? Number(data.total) : 0
    hasNext.value = data && data.has_next === true
  } catch (cause) {
    if (version !== requestVersion) return
    items.value = []
    error.value = cause instanceof Error ? cause.message : '网络错误，请稍后重试'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

function goToPage(nextPage) {
  if (!Number.isInteger(nextPage) || nextPage < 1) return
  void router.push({ path: '/works', query: { page: nextPage } })
}

watch(function () { return route.query.page }, function (value) {
  if (value != null && queryPage() === 1 && String(value) !== '1') {
    void router.replace({ path: '/works', query: { page: 1 } })
    return
  }
  void loadWorks()
}, { immediate: true })
</script>

<style scoped>
.works-content { padding: 48px 0 8px; }
.works-page .hero { --wm: '作业'; }
.works-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 2px solid var(--ink); }
.works-heading h2 { margin-top: 5px; font: 900 clamp(28px, 3vw, 40px) var(--font-s); letter-spacing: .06em; }
.works-heading p { color: var(--ink-60); font-size: 13px; }
.eyebrow { color: var(--accent-strong); font: 800 11px var(--font-d); letter-spacing: .18em; }
.source-value { font-size: 28px !important; }
.works-live { min-height: 300px; }
.list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.works-state { min-height: 300px; margin-top: 28px; display: grid; place-content: center; justify-items: center; gap: 10px; padding: 48px 24px; border: 1.5px dashed var(--line); border-radius: 22px; background: var(--surface); color: var(--ink-60); text-align: center; }
.works-state strong { color: var(--ink); font: 900 20px var(--font-s); }
.works-state span { max-width: 520px; font-size: 13px; line-height: 1.7; }
.works-state.error { border-color: rgba(166, 81, 74, .45); }
.works-state button, .works-pagination button { min-height: 44px; padding: 10px 18px; border: 1px solid var(--line); border-radius: 999px; background: var(--tea); color: var(--cream); font: 800 13px var(--font-b); cursor: pointer; }
.loading-mark { width: 34px; height: 34px; border: 3px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: works-spin .8s linear infinite; }
.works-pagination { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 30px; }
.works-pagination span { color: var(--ink-60); font: 700 12px var(--font-d); }
.works-pagination button:disabled { opacity: .45; cursor: default; }
@keyframes works-spin { to { transform: rotate(360deg); } }
@media (max-width: 767px) {
  .works-content { padding-top: 28px; }
  .works-heading { align-items: flex-start; flex-direction: column; gap: 8px; }
  .list { grid-template-columns: 1fr; gap: 12px; }
  .works-state { min-height: 240px; margin-top: 16px; border-radius: 16px; }
  .works-pagination { justify-content: space-between; gap: 8px; }
  .works-pagination span { text-align: center; }
  .works-pagination button { padding-inline: 13px; }
}
@media (prefers-reduced-motion: reduce) { .loading-mark { animation: none; } }
</style>
