<template>
  <div class="page-plaza works-page">
    <IslandSidebar />

    <main id="main-content">
      <header class="page-header discovery-page-header">
        <div class="wrap">
          <div class="page-header-row">
            <div class="page-header-identity">
              <h1 class="page-header-title">作业广场</h1>
              <p class="page-header-description">浏览公开作业，查看阵容、回合步骤和适用平台。</p>
            </div>
            <div v-if="loading || error || items.length" class="page-header-actions">
              <router-link class="page-header-action" to="/work/new">创建作业</router-link>
            </div>
          </div>
        </div>
      </header>

      <section class="works-content">
        <div class="wrap">
          <p v-if="!loading && !error && items.length" class="works-summary">{{ total }} 份公开作业 · 第 {{ page }} / {{ totalPages }} 页</p>

          <div class="works-live" aria-live="polite" aria-atomic="true">
            <div v-if="loading" class="works-state" aria-busy="true">
              <span class="loading-mark" aria-hidden="true"></span>
              <strong>正在加载作业</strong>
              <span>请稍候，正在读取最新公开作业。</span>
            </div>

            <div v-else-if="error" class="works-state error" role="alert">
              <strong>作业列表加载失败</strong>
              <span>{{ error }}</span>
              <button type="button" @click="loadWorks">重新加载</button>
            </div>

            <div v-else-if="items.length === 0" class="works-state">
              <strong>暂时没有公开作业</strong>
              <span>你可以创建第一份作业，或稍后再来看看。</span>
              <router-link to="/work/new">创建第一份作业</router-link>
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
                <button type="button" :disabled="page <= 1 || loading" @click="goToPage(page - 1)"><ArrowLeft :size="16" aria-hidden="true" /> 上一页</button>
                <span>第 {{ page }} 页，共 {{ totalPages }} 页</span>
                <button type="button" :disabled="!hasNext || loading" @click="goToPage(page + 1)">下一页 <ArrowRight :size="16" aria-hidden="true" /></button>
              </nav>
            </template>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>YuanHub<br><span>公开作业与兼容性</span></template>
        <template #fine>按回合记录打法，并预览目标平台是否支持。</template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { ArrowLeft, ArrowRight } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import '../../styles/page-header.css'
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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.works-summary { color: var(--ink-60); }
.works-state { border: 1.5px dashed var(--line); border-radius: 22px; background: var(--surface); color: var(--ink-60); }
.works-state strong { color: var(--ink); }
.works-state.error { border-color: var(--theme-danger-line, rgba(166, 81, 74, .45)); }
.works-state button, .works-pagination button { border: 1px solid var(--line); border-radius: 999px; background: var(--tea); color: var(--on-strong); cursor: pointer; }
.works-state a {border-radius:999px;background:var(--tea);color:var(--on-strong);text-decoration:none; }
.loading-mark { border: 3px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: works-spin .8s linear infinite; }
.works-pagination span { color: var(--ink-60); }
.works-pagination button:disabled { opacity: .45; cursor: default; }
@keyframes works-spin { to { transform: rotate(360deg); } }
@media (max-width: 767px) {
  .works-state { border-radius: 16px; }
}
@media (prefers-reduced-motion: reduce) { .loading-mark { animation: none; } }
</style>
<style scoped src="./workIndexDesktop.css"></style>
<style scoped src="./workIndexMobile.css"></style>
