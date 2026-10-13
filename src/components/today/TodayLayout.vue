<template>
  <div class="today-page">
    <IslandSidebar />
    <main id="main-content" class="today-main">
      <slot name="lobby" />
      <section class="today-content" :data-tour="showOverview ? undefined : 'today-overview'">
        <div class="wrap today-wrap">
          <slot name="status" />
          <div v-if="showOverview" class="today-overview" :class="{ 'has-sidebar': hasSidebar }" data-tour="today-overview">
            <slot name="overview" />
          </div>
          <slot name="onboarding" />
        </div>
      </section>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import IslandSidebar from '../IslandSidebar.vue'
import SiteFooter from '../SiteFooter.vue'
defineProps({ showOverview: Boolean, hasSidebar: Boolean })
</script>

<style scoped>
.today-page { color: var(--ink); }
</style>
<style scoped src="./todayLayoutDesktop.css"></style>
<style scoped src="./todayLayoutMobile.css"></style>
