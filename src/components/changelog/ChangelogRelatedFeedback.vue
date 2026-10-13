<template>
  <div v-if="items.length" class="changelog-related">
    <h3>本版本完成</h3>
    <ul>
      <li v-for="item in items" :key="item.id">
        <router-link :to="{ path: '/feedback/plaza', query: { feedback: item.id } }">{{ item.publicTitle || '未命名反馈' }}</router-link>
        <span>{{ typeLabel(item.type) }} · {{ item.supportCount }} 人支持</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { listPublicFeedback } from '@/api/coCreation.js'
import { publicTypeLabel } from '@/utils/feedbackPublic.js'

const props = defineProps({
  versionId: { type: String, required: true }
})

const items = ref([])
let isMounted = false

function typeLabel(type) {
  return publicTypeLabel(type)
}

onMounted(async () => {
  isMounted = true
  if (!props.versionId) return
  try {
    const data = await listPublicFeedback({ completedVersionId: props.versionId, pageSize: 6, sort: 'updated' })
    if (isMounted) items.value = data.items || []
  } catch (_) {
    // 反查失败不影响更新日志展示。
  }
})
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.changelog-related { border-top: 1px dashed var(--line); }
.changelog-related h3 { color: var(--ink-60); }
.changelog-related a { color: var(--tea); text-decoration: none; }
.changelog-related a:hover { color: var(--accent-strong); text-decoration: underline; }
.changelog-related span { color: var(--ink-35); }
</style>
<style scoped src="./changelogRelatedFeedbackDesktop.css"></style>
<style scoped src="./changelogRelatedFeedbackMobile.css"></style>
