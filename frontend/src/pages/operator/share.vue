<template>
  <div class="page-operator-share">
    <IslandSidebar />
    <main id="main-content" class="share-main">
      <header class="page-header">
        <div class="wrap">
          <router-link class="page-header-back" to="/operator"><ArrowLeft :size="16" aria-hidden="true" /> 密探名册</router-link>
          <h1 class="page-header-title">密探 BOX</h1>
          <p class="page-header-description">通过分享码查看公开养成信息，无需登录。</p>
          <p v-if="share" class="page-header-context">{{ share.game || '游戏版本未知' }} · 只读分享</p>
        </div>
      </header>

      <section class="share-content">
        <div class="wrap">
          <OperatorShareContent :token="token" @submit="router.push(shareRoute($event))" @reset="router.push({ name: 'operator-share' })" @share-change="share = $event" />
        </div>
      </section>

      <SiteFooter>
        <template #big>密探 BOX<br /><span>只读分享</span></template>
        <template #fine><b>YuanHub</b> · 分享码查看<br />数据仅供参考，请以游戏内实际养成为准</template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import '@/styles/page-header.css'
import { computed, ref } from 'vue'
import { ArrowLeft } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import OperatorShareContent from '../../components/operator/OperatorShareContent.vue'
import { shareRoute } from '../../utils/shareLink.js'

const route = useRoute()
const router = useRouter()
const token = computed(() => String(route.params.token || ''))
const share = ref(null)
</script>
<style scoped>
.share-main { margin-left: 0; min-height: 100dvh; min-width: 0; padding-bottom: 0; }
.wrap { width: 100%; max-width: 1180px; margin: 0 auto; padding-inline: 16px; min-width: 0; }
.share-content { padding-top: 12px; }
@media (min-width: 768px) and (max-width: 1080px) { .wrap { padding-inline: 32px; } }
@media (min-width: 1081px) {
  .share-main { margin-left: 292px; }
  .wrap { padding-inline: 48px; }
}
</style>
