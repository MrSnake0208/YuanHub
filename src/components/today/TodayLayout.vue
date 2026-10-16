<template>
  <div class="today-page">
    <IslandSidebar />
    <main id="main-content" class="today-main">
      <slot name="lobby" />
      <section class="today-content" :data-tour="showOverview ? undefined : 'today-overview'">
        <div class="wrap today-wrap">
          <slot name="status" />
          <slot name="onboarding" />
          <div v-if="showOverview" class="today-overview" data-tour="today-overview">
            <div id="today-reminders" class="today-reminders-target"></div>
            <div class="today-workspace">
              <div class="today-column today-primary">
                <slot name="overview" />
                <div ref="mobileActivities" class="today-activities-target"></div>
                <slot name="training" />
              </div>
              <div class="today-column today-secondary">
                <Teleport :to="mobileActivities || 'body'" :disabled="desktop || !mobileActivities">
                  <slot name="activities" />
                </Teleport>
                <slot name="notes" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import IslandSidebar from '../IslandSidebar.vue'
defineProps({ showOverview: Boolean })
const mobileActivities = ref(null)
const media = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 768px)') : null
const desktop = ref(media?.matches ?? false)
function syncLayout() {
  const focused = document.activeElement
  desktop.value = media?.matches ?? false
  // 移动同一活动实例，让手机的阅读与 Tab 顺序一致，同时保留筛选和焦点。
  nextTick(() => {
    if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true })
  })
}
onMounted(() => { media?.addEventListener('change', syncLayout); syncLayout() })
onBeforeUnmount(() => media?.removeEventListener('change', syncLayout))
</script>

<style scoped>
.today-page { color: var(--ink); }
</style>
<style scoped src="./todayLayoutDesktop.css"></style>
<style scoped src="./todayLayoutMobile.css"></style>
