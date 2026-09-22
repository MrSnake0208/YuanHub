<template>
  <aside class="beta-notice" aria-label="内测说明">
    <strong>{{ copy.title }}</strong>
    <p>注册统一账号不等于获得内测资格；名额已满时仍可登记候补。</p>
    <router-link to="/beta">查看开放状态与参与规则 →</router-link>
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
.beta-notice { margin: 18px 0; padding: 15px 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--cream); color: var(--ink); text-align: left; }
.beta-notice strong { font-size: 14px; }
.beta-notice p { margin: 6px 0; font-size: 13px; line-height: 1.75; }
.beta-notice a { color: var(--tea); font-size: 13px; font-weight: 700; text-underline-offset: 4px; }
</style>
