<template>
  <div v-if="items.length" class="changelog-related">
    <h3>本版本完成</h3>
    <ul>
      <li v-for="item in items" :key="item.id">
        <router-link :to="{ path: '/co-creation', query: { feedback: item.id } }">{{ item.publicTitle || '未命名反馈' }}</router-link>
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
.changelog-related { margin-top: 18px; padding-top: 14px; border-top: 1px dashed var(--line); }
.changelog-related h3 { margin-bottom: 9px; color: var(--ink-60); font-size: 12px; font-weight: 900; }
.changelog-related ul { display: grid; gap: 7px; list-style: none; }
.changelog-related li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.changelog-related a { color: var(--tea); font-size: 13px; font-weight: 800; text-decoration: none; }
.changelog-related a:hover { color: var(--accent-strong); text-decoration: underline; }
.changelog-related span { color: var(--ink-35); font: 11px var(--font-d); }
</style>
