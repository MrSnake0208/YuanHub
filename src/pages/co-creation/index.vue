<template>
  <div class="feedback-page co-creation-page">
    <IslandSidebar />

    <main id="main-content">
      <header class="hero feedback-hero">
        <div class="wrap">
          <div class="feedback-hero-kicker">COMMUNITY / CO-CREATION</div>
          <div class="feedback-hero-layout">
            <div>
              <h1>共创中心</h1>
              <p class="hero-sub">看看大家最近遇到了什么，也可以支持你关心的问题和功能建议。</p>
            </div>
            <button class="feedback-primary-action feedback-hero-action" type="button" @click="goSubmit">
              <Plus :size="18" aria-hidden="true" />
              提交反馈
            </button>
          </div>
        </div>
      </header>

      <section class="feedback-content">
        <div class="wrap">
          <div class="co-creation-tabs" role="tablist" aria-label="共创中心">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              type="button"
              role="tab"
              :aria-selected="activeTab === tab.key"
              :class="{ on: activeTab === tab.key }"
              @click="activeTab = tab.key"
            >{{ tab.label }}</button>
          </div>

          <FeedbackPlaza v-if="activeTab === 'plaza'" :focus-id="focusId" />
          <FeatureWishPool v-else-if="activeTab === 'wish'" />
          <DevelopmentRoadmap v-else />
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import FeedbackPlaza from '@/components/co-creation/FeedbackPlaza.vue'
import FeatureWishPool from '@/components/co-creation/FeatureWishPool.vue'
import DevelopmentRoadmap from '@/components/co-creation/DevelopmentRoadmap.vue'
import '@/styles/feedback-workspace.css'

const tabs = [
  { key: 'plaza', label: '反馈广场' },
  { key: 'wish', label: '许愿池' },
  { key: 'roadmap', label: '开发进度' }
]

const route = useRoute()
const router = useRouter()
const activeTab = ref('plaza')
const focusId = computed(() => (route.query.feedback ? String(route.query.feedback) : ''))

watch(() => route.query.tab, tab => {
  if (tab === 'plaza' || tab === 'wish' || tab === 'roadmap') activeTab.value = tab
}, { immediate: true })

watch(focusId, id => {
  if (id) activeTab.value = 'plaza'
})

function goSubmit() {
  router.push('/feedback')
}
</script>

<style scoped>
.co-creation-page .feedback-hero { --wm: '共创'; }
.co-creation-tabs { display: inline-flex; align-items: center; margin-top: 18px; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel-deep); overflow: hidden; }
.co-creation-tabs button { min-height: 42px; padding: 0 18px; border: 0; border-right: 1px solid var(--feedback-line); background: transparent; color: var(--feedback-text-muted); font: 800 12px var(--font-b); cursor: pointer; }
.co-creation-tabs button:last-child { border-right: 0; }
.co-creation-tabs button:hover,
.co-creation-tabs button.on { background: var(--yellow); color: var(--ink); }
@media (max-width: 767px) {
  .co-creation-tabs { width: 100%; overflow-x: auto; }
  .co-creation-tabs button { flex: 1 0 auto; }
}
</style>
