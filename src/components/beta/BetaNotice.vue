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
.beta-notice { margin: 18px 0; padding: 15px 18px; border: 1px solid var(--line); border-left: 4px solid var(--tone, var(--yellow-deep)); border-radius: 14px; background: var(--cream); color: var(--ink); text-align: left; }
.beta-notice.tone-granted, .beta-notice.tone-open { --tone: var(--tea); }
.beta-notice.tone-error { --tone: var(--rouge); }
.beta-notice.tone-join, .beta-notice.tone-paused { --tone: var(--accent); }
.beta-notice.tone-closed, .beta-notice.tone-pending, .beta-notice.tone-full { --tone: var(--ink-35); }
.beta-notice strong { font-size: 14px; }
.beta-notice p { margin: 6px 0; font-size: 13px; line-height: 1.75; color: var(--ink-60); }
.beta-notice a { color: var(--tea); font-size: 13px; font-weight: 700; text-underline-offset: 4px; }
</style>
