<template>
  <p v-if="!issues.length" class="issue-empty">{{ emptyText }}</p>
  <ul v-else class="issue-list">
    <li v-for="(issue, index) in issues" :key="issue && issue.code || index">
      <div class="issue-head">
        <span class="severity" :class="'severity-' + (issue && issue.severity)">{{ issue && issue.severity || 'unknown' }}</span>
        <strong>{{ issue && issue.message || '未提供问题说明' }}</strong>
      </div>
      <details class="issue-tech">
        <summary>查看技术细节</summary>
        <dl>
          <div><dt>涉及功能</dt><dd>{{ issue && issue.feature || '未提供' }}</dd></div>
          <div><dt>位置</dt><dd>{{ issue && issue.path || '未提供' }}</dd></div>
          <div><dt>编号</dt><dd>{{ issue && issue.code || '未提供' }}</dd></div>
        </dl>
      </details>
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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.issue-empty { color: var(--ink-60); }
.issue-list li { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.severity { border: 1px solid currentColor; border-radius: 6px; }
.severity-partial { color: var(--theme-accent-text, var(--accent-strong)); }
.severity-unsupported { color: var(--theme-danger-text, var(--rouge)); }
.issue-tech summary {color:var(--ink-60);cursor:pointer; }
dt { color: var(--ink-35); }
dd { color: var(--ink-60); }
</style>
<style scoped src="./workIssueListDesktop.css"></style>
<style scoped src="./workIssueListMobile.css"></style>
