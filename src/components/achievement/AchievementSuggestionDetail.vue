<template>
  <section v-if="value" class="suggestion-detail" aria-label="投稿详情">
    <h2>{{ item.original.name }}</h2>
    <p>{{ suggestionStatus(item.status) }}</p>
    <p v-if="item.status === 'ACCEPTED'">{{ value.currently_published === true ? '当前已发布' : value.currently_published === false ? '当前尚未发布（可能已从草稿移除或发布后回滚）' : '当前发布状态未知' }}</p>
    <p>{{ item.original.game }} · {{ item.created_at }}</p>
    <p class="text">{{ item.original.condition || '未填写完成条件' }}</p>
    <p>原稿奖励：{{ rewardText(item.original) }}</p>
    <p>隐藏标记：{{ item.original.is_hidden == null ? '未知' : item.original.is_hidden ? '是' : '否' }} · 目标：{{ item.original.target ?? '未填写' }} · 联动：{{ item.original.linked_metric || '无' }}</p>
    <a v-if="source" :href="source" target="_blank" rel="noopener noreferrer">查看资料来源</a>
    <p class="text">补充说明：{{ item.submission_note || '无' }}</p>
    <p v-if="item.reviewed_at">审核人：{{ item.reviewed_by }} · {{ item.reviewed_at }}</p>
    <p v-if="item.review_note" class="text">审核说明：{{ item.review_note }}</p>
    <details v-if="item.accepted_snapshot"><summary>查看采纳时的资料</summary><p>{{ item.accepted_snapshot.name }}</p><p class="text">{{ item.accepted_snapshot.condition }}</p><p>{{ rewardText(item.accepted_snapshot) }}</p><p>目标：{{ item.accepted_snapshot.target ?? '未填写' }} · 联动：{{ item.accepted_snapshot.linked_metric || '无' }}</p></details>
    <slot />
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { safeSource, suggestionStatus } from '../../pages/achievement/suggestionRules.js'
import { rewardText } from '../../pages/achievement/rules.js'
const props = defineProps({ value: { type: Object, default: null } })
const item = computed(() => props.value.suggestion)
const source = computed(() => safeSource(item.value.source_url))
</script>
<style scoped>
.suggestion-detail { overflow-wrap: anywhere; }
.text { white-space: pre-wrap; }
</style>
