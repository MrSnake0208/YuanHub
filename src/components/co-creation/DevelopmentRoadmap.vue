<template>
  <div class="development-roadmap">
    <div v-if="!emptyPublic" class="goal-toolbar">
      <label>功能进展<select v-model="stage" class="feedback-form-control" @change="changeStage"><option value="">全部目标</option><option v-for="option in DEVELOPMENT_STAGES" :key="option.key" :value="option.key">{{ option.label }}</option></select></label>
      <span>{{ total }} 个目标</span>
    </div>
    <p v-if="!emptyPublic" class="goal-notice">进度表示下方完成标准中已有多少项通过确认，不能代表剩余开发时间。目标版本和日期为计划，可能调整。</p>
    <div v-if="loading" class="goal-state" role="status">正在加载开发目标…</div>
    <div v-else-if="error" class="goal-state" role="alert">{{ error }}<button class="feedback-button" type="button" @click="load">重新加载</button></div>
    <div v-else-if="!items.length" class="goal-state">
      <p>{{ stage ? '当前阶段还没有开发目标。' : '暂时还没有公布开发目标。' }}</p>
      <button v-if="stage" class="feedback-button" type="button" @click="stage = ''; changeStage()">查看全部目标</button>
      <router-link v-else-if="!managed" :to="{ path: '/feedback', query: { new: '1', type: 'FEATURE' } }">提交你的功能建议</router-link>
    </div>
    <div v-else class="goal-grid">
      <article v-for="goal in items" :key="goal.id" class="goal-card">
        <header><span class="goal-stage">{{ stageLabel(goal.stage) }}</span><button v-if="managed" class="feedback-button" type="button" @click="$emit('edit', goal)">编辑目标</button></header>
        <h2>{{ goal.title }}</h2><p class="goal-description">{{ goal.description }}</p>
        <div v-if="goal.targetVersion || goal.targetDate" class="goal-target"><span v-if="goal.targetVersion">目标版本 {{ goal.targetVersion }}</span><span v-if="goal.targetDate">目标日期 <time :datetime="goal.targetDate">{{ goal.targetDate }}</time></span></div>
        <div class="goal-progress"><span>已确认的完成项</span><strong>{{ completedCount(goal) }} / {{ goal.criteria.length }}</strong><progress :value="completedCount(goal)" :max="goal.criteria.length || 1" :aria-label="goal.title + '完成标准进度'" /></div>
        <details class="goal-details" :open="!managed">
          <summary>完成标准与需求来源</summary>
          <ul class="goal-criteria"><li v-for="(criterion, index) in goal.criteria" :key="index"><CheckCircle2 v-if="criterion.completed" :size="17" aria-hidden="true" /><Circle v-else :size="17" aria-hidden="true" /><span>{{ criterion.title }}</span><small>{{ criterion.completed ? '已通过' : '待验收' }}</small></li></ul>
          <div class="goal-links"><h3>需求来源</h3><p v-if="!goal.linkedFeedback.length">该目标未关联公开反馈。</p><router-link v-for="feedback in goal.linkedFeedback" :key="feedback.id" :to="{ path: '/feedback/plaza', query: { feedback: feedback.id } }">{{ feedback.title }}</router-link></div>
        </details>
        <footer>更新于 {{ formatDate(goal.updatedAt) }}</footer>
      </article>
    </div>
    <nav v-if="!loading && !error && (page > 1 || hasNext)" class="goal-pagination" aria-label="开发目标分页"><button class="feedback-button" type="button" :disabled="page === 1" @click="changePage(page - 1)">上一页</button><span>第 {{ page }} 页</span><button class="feedback-button" type="button" :disabled="!hasNext" @click="changePage(page + 1)">下一页</button></nav>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Circle, CheckCircle2 } from '@lucide/vue'
import { DEVELOPMENT_STAGES, listDevelopmentGoals } from '@/api/developmentGoals.js'
const props = defineProps({ managed: { type: Boolean, default: false } })
defineEmits(['edit'])
const items = ref([]), loading = ref(false), error = ref(''), total = ref(0), stage = ref(''), page = ref(1), hasNext = ref(false)
const loaded = ref(false)
const emptyPublic = computed(() => loaded.value && !props.managed && !loading.value && !error.value && !stage.value && page.value === 1 && total.value === 0 && !items.value.length)
let requestId = 0, mounted = false
const stageLabel = value => DEVELOPMENT_STAGES.find(option => option.key === value)?.label || value
const completedCount = goal => goal.criteria.filter(item => item.completed).length
const formatDate = value => value ? new Date(value).toLocaleDateString('zh-CN') : '—'
async function load() {
  const current = ++requestId
  loading.value = true; error.value = ''
  try {
    const result = await listDevelopmentGoals({ page: page.value, stage: stage.value, admin: props.managed })
    if (!mounted || current !== requestId) return
    items.value = result.items; total.value = result.total; hasNext.value = result.hasNext
    loaded.value = true
  } catch (e) { if (mounted && current === requestId) error.value = e.message || '开发目标加载失败' }
  finally { if (mounted && current === requestId) loading.value = false }
}
function changeStage() { page.value = 1; load() }
function changePage(value) { if (loading.value) return; page.value = value; load() }
onMounted(() => { mounted = true; load() })
onBeforeUnmount(() => { mounted = false; requestId += 1 })
defineExpose({ reload: load })
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.goal-toolbar { color: var(--feedback-text-muted); }
.goal-notice { color: var(--feedback-text-muted); }
.goal-state { color: var(--feedback-text-muted); }
.goal-card { border: 1px solid var(--feedback-line); border-radius: 12px; background: var(--feedback-panel); }
.goal-stage { border: 1px solid var(--feedback-line-strong); border-radius: 6px; color: var(--feedback-accent); }
.goal-card h2 { color: var(--feedback-text); }
.goal-description { color: var(--feedback-text-muted); }
.goal-target { color: var(--feedback-text-muted); }
.goal-progress { color: var(--feedback-text); }
.goal-progress progress { accent-color: var(--accent); }
.goal-details { border-top: 1px solid var(--feedback-line); }
.goal-details summary { color: var(--feedback-text); cursor: pointer; }
.goal-criteria li { color: var(--feedback-text-muted); }
.goal-links h3 { color: var(--feedback-text); }
.goal-links p { color: var(--feedback-text-muted); }
.goal-links a { color: var(--accent-strong); text-decoration: underline; }
.goal-card footer { color: var(--feedback-text-dim); }
.goal-pagination { color: var(--feedback-text-muted); }
</style>
<style scoped src="./developmentRoadmapDesktop.css"></style>
<style scoped src="./developmentRoadmapMobile.css"></style>
