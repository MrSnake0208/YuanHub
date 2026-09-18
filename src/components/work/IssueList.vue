<template>
  <p v-if="!issues.length" class="issue-empty">{{ emptyText }}</p>
  <ul v-else class="issue-list">
    <li v-for="(issue, index) in issues" :key="issue && issue.code || index">
      <div class="issue-head">
        <span class="severity" :class="'severity-' + (issue && issue.severity)">{{ issue && issue.severity || 'unknown' }}</span>
        <strong>{{ issue && issue.message || '未提供问题说明' }}</strong>
      </div>
      <dl>
        <div><dt>feature</dt><dd>{{ issue && issue.feature || '未提供' }}</dd></div>
        <div><dt>path</dt><dd>{{ issue && issue.path || '未提供' }}</dd></div>
        <div><dt>code</dt><dd>{{ issue && issue.code || '未提供' }}</dd></div>
      </dl>
    </li>
  </ul>
</template>

<script setup>
defineProps({
  issues: { type: Array, default: function () { return [] } },
  emptyText: { type: String, required: true }
})
</script>

<style scoped>
.issue-empty { margin-top: 12px; color: var(--ink-60); font-size: 13px; }
.issue-list { margin-top: 14px; display: grid; gap: 10px; list-style: none; }
.issue-list li { padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.issue-head { display: flex; align-items: flex-start; gap: 10px; }
.issue-head strong { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.severity { flex: none; padding: 3px 7px; border: 1px solid currentColor; border-radius: 6px; font: 800 10px var(--font-d); }
.severity-partial { color: var(--accent-strong); }
.severity-unsupported { color: var(--rouge); }
dl { margin-top: 10px; display: grid; gap: 6px; }
dl div { min-width: 0; display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 8px; font: 11px/1.6 var(--font-d); }
dt { color: var(--ink-35); }
dd { color: var(--ink-60); overflow-wrap: anywhere; }
</style>
