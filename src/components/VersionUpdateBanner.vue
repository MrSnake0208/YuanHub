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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
/* 顶部信息条：暖茶棕底 + 奶油字 + 蜜黄按钮，属“更新提示”而非错误告警。 */
.version-update {
  background: var(--tea);
  color: var(--cream);
  border-bottom: 1px solid rgba(255, 248, 236, 0.18);
}
.version-update__icon {
  color: var(--yellow);
}
.version-update__text {
  color: var(--cream);
}
.version-update__versions {
  border: 1px solid rgba(255, 248, 236, 0.4);
  border-radius: 999px;
}
.version-update__action {
  border: 0;
  border-radius: 999px;
  background: var(--yellow);
  color: var(--ink);
  cursor: pointer;
  transition: background-color 0.25s var(--ease), transform 0.25s var(--ease);
}
.version-update__action:hover {
  background: var(--yellow-deep);
}
@media (prefers-reduced-motion: reduce) {
  .version-update__action {
    transition: none;
  }
}
</style>
<style scoped src="./versionUpdateBannerDesktop.css"></style>
<style scoped src="./versionUpdateBannerMobile.css"></style>
