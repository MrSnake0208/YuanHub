<template>
  <aside class="beta-notice" :class="'tone-' + copy.tone" aria-label="内测说明">
    <strong>{{ copy.title }}</strong>
    <p>注册账号不会自动获得体验资格，也不占名额；名额满了会自动进入候补。</p>
    <router-link to="/beta">查看开放状态与参与方式 →</router-link>
  </aside>
</template>
<script setup>
import { computed, onMounted } from 'vue'
import { beta } from '../../store/beta.js'
import { betaStatusCopy } from '../../utils/betaAccess.js'
const copy = computed(() => betaStatusCopy(beta.campaign, beta.mine, beta.publicError || beta.personalError))
onMounted(() => { void beta.loadPublic() })
</script>
<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.beta-notice { border: 1px solid var(--line); border-left: 4px solid var(--tone, var(--yellow-deep)); border-radius: 14px; background: var(--cream); color: var(--ink); }
.beta-notice p { color: var(--ink-60); }
.beta-notice a { color: var(--tea); text-underline-offset: 4px; }
</style>
<style scoped src="./betaNoticeDesktop.css"></style>
<style scoped src="./betaNoticeMobile.css"></style>
