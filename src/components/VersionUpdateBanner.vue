<template>
  <div v-if="updateAvailable" class="version-update" role="status" aria-live="polite">
    <div class="version-update__inner">
      <span class="version-update__icon" aria-hidden="true"><RefreshCw :size="16" /></span>
      <p class="version-update__text">
        YuanHub 已发布新版本，为避免使用旧版资源导致异常，请刷新页面。
        <span v-if="versionLine" class="version-update__versions">{{ versionLine }}</span>
      </p>
      <button type="button" class="version-update__action" @click="reload">立即刷新</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RefreshCw } from '@lucide/vue'
import { useVersionUpdate } from '@/composables/useVersionUpdate.js'

const { currentVersion, latestVersion, updateAvailable, reload } = useVersionUpdate()

// 只有两端版本都存在时才展示对比，避免出现残缺的 “→” 文案。
const versionLine = computed(() =>
  currentVersion.value && latestVersion.value
    ? currentVersion.value + ' → ' + latestVersion.value
    : ''
)
</script>

<style scoped>
/* 顶部信息条：暖茶棕底 + 奶油字 + 蜜黄按钮，属“更新提示”而非错误告警。 */
.version-update {
  position: relative;
  z-index: 45;
  background: var(--tea);
  color: var(--cream);
  border-bottom: 1px solid rgba(255, 248, 236, 0.18);
}
.version-update__inner {
  display: flex;
  align-items: center;
  gap: 10px 16px;
  flex-wrap: wrap;
  max-width: 1180px;
  margin: 0 auto;
  padding: 9px 48px;
}
.version-update__icon {
  display: inline-flex;
  flex: none;
  color: var(--yellow);
}
.version-update__text {
  flex: 1 1 320px;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.6;
  color: var(--cream);
}
.version-update__versions {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  padding: 1px 8px;
  border: 1px solid rgba(255, 248, 236, 0.4);
  border-radius: 999px;
  font-family: var(--font-d);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.version-update__action {
  flex: none;
  border: 0;
  border-radius: 999px;
  padding: 8px 18px;
  background: var(--yellow);
  color: var(--ink);
  font-family: var(--font-b);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: background-color 0.25s var(--ease), transform 0.25s var(--ease);
}
.version-update__action:hover {
  background: var(--yellow-deep);
  transform: translateY(-1px);
}
.version-update__action:active {
  transform: none;
}
@media (min-width: 1081px) {
  /* 与 main 的左边距一致：桌面端横幅只占内容列，不压住悬浮侧边栏。 */
  .version-update {
    margin-left: 292px;
  }
}
@media (max-width: 767px) {
  .version-update__inner {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 16px;
  }
  .version-update__text {
    flex: none;
  }
  .version-update__action {
    align-self: flex-start;
  }
}
@media (prefers-reduced-motion: reduce) {
  .version-update__action {
    transition: none;
  }
  .version-update__action:hover {
    transform: none;
  }
}
</style>
