<template>
  <div class="page-inventory">
    <IslandSidebar />
    <main id="main-content" class="inventory-main">
      <slot />
      <slot name="footer" />
    </main>
  </div>
</template>

<script setup>
import IslandSidebar from '../IslandSidebar.vue'
</script>

<style scoped src="./inventoryLayoutDesktop.css"></style>
<style scoped src="./inventoryLayoutMobile.css"></style>
