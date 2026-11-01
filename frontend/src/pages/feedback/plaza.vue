<template>
  <div class="feedback-page feedback-center feedback-plaza-page">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header"><div class="wrap"><div class="page-header-row">
        <div class="page-header-identity"><h1 class="page-header-title">反馈广场</h1><p class="page-header-description">浏览公开的问题与建议，查看处理进展。</p></div>
        <FeedbackSpaceSelector :model-value="spaceId" :spaces="spaceOptions" @change="changeSpace" />
        <router-link class="page-header-action plaza-submit" :to="feedbackLocation('/feedback', spaceId, { new: '1' })"><Plus :size="18" aria-hidden="true" />提交反馈</router-link>
      </div></div></header>
      <section class="feedback-content"><div class="wrap">
        <FeedbackWorkspaceNav active="plaza" />
        <p class="plaza-context">这里只展示管理员整理后的公开内容。</p>
        <div v-if="spaceError" class="feedback-form-error" role="alert">{{ spaceError }} <button class="feedback-button" type="button" @click="loadAttempt += 1">重试</button></div>
        <FeedbackPlaza v-else-if="spaceReady" :key="spaceId" :space-id="spaceId" :focus-id="focusId" />
        <p v-else role="status">正在加载专区…</p>
      </div></section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import FeedbackWorkspaceNav from '@/components/feedback/FeedbackWorkspaceNav.vue'
import FeedbackSpaceSelector from '@/components/feedback/FeedbackSpaceSelector.vue'
import { getFeedbackSpace, listFeedbackSpaces } from '@/api/feedback.js'
import { feedbackSpaceId, feedbackLocation } from '@/utils/feedbackSpaces.js'
import FeedbackPlaza from '@/components/co-creation/FeedbackPlaza.vue'
import '@/styles/page-header.css'

const route = useRoute()
const router = useRouter()
const spaceId = computed(() => feedbackSpaceId(route.query))
const spaceOptions = ref([])
const spaceReady = ref(false)
const spaceError = ref('')
const loadAttempt = ref(0)
const focusId = computed(() => String(route.query.feedback || ''))
function changeSpace(id) { router.push(feedbackLocation('/feedback/plaza', id)) }
watch([spaceId, loadAttempt], async ([id], _, onCleanup) => {
  let current = true
  onCleanup(() => { current = false })
  spaceReady.value = false
  spaceError.value = ''
  try {
    const [spaces, space] = await Promise.all([listFeedbackSpaces(), getFeedbackSpace(id)])
    if (!current) return
    spaceOptions.value = spaces.some(option => option.id === id) ? spaces : [...spaces, space]
    spaceReady.value = true
  } catch (e) { if (current) spaceError.value = e.message || '专区加载失败' }
}, { immediate: true })
</script>

<style src="../../styles/feedback-workspace.css"></style>
<style src="../../styles/feedback-workspaceDesktop.css"></style>
<style src="../../styles/feedback-workspaceMobile.css"></style>
<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.plaza-context { color: var(--feedback-text-muted); }
</style>
<style scoped src="./feedbackPlazaPageDesktop.css"></style>
<style scoped src="./feedbackPlazaPageMobile.css"></style>
