<template>
  <div class="today-page">
    <IslandSidebar />
    <main id="main-content" class="today-main">
      <slot name="lobby" />
      <section class="today-content" :data-tour="showOverview ? undefined : 'today-overview'">
        <div class="wrap today-wrap">
          <slot name="status" />
          <slot name="onboarding" />
          <div v-if="showOverview" class="today-overview" :class="{ 'has-sidebar': hasSidebar }" data-tour="today-overview">
            <div id="today-reminders" class="today-reminders-target"></div>
            <div class="today-workspace">
              <slot name="overview" />
            </div>
            <div v-if="hasSidebar" class="today-aside">
              <slot name="notes" />
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import IslandSidebar from '../IslandSidebar.vue'
defineProps({ showOverview: Boolean, hasSidebar: Boolean })
</script>

<style scoped>
.today-page { color: var(--ink); }
</style>
<style scoped src="./todayLayoutDesktop.css"></style>
<style scoped src="./todayLayoutMobile.css"></style>
