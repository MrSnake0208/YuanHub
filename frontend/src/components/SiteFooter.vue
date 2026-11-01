<template>
  <footer class="footer" :class="tone === 'slate' ? 'tone-slate' : 'tone-tea'">
    <div class="wrap">
      <div class="big"><slot name="big"></slot></div>
      <div class="fine"><slot name="fine"></slot></div>
    </div>
  </footer>
</template>

<script setup>
defineProps({
  tone: { type: String, default: 'tea' }
})
</script>
