<template>
  <div class="calendar-filters">
    <fieldset>
      <legend>游戏</legend>
      <div class="calendar-chips">
        <button v-for="game in ['', ...games]" :key="game" type="button" :aria-pressed="filters.game === game" @click="emit('change', { game })">{{ game || '全部游戏' }}</button>
      </div>
    </fieldset>
    <fieldset>
      <legend>类型</legend>
      <div class="calendar-chips">
        <button type="button" :aria-pressed="!filters.category" @click="emit('change', { category: '' })">全部类型</button>
        <button v-for="(label, category) in categories" :key="category" type="button" :aria-pressed="filters.category === category" @click="emit('change', { category })">{{ label }}</button>
      </div>
    </fieldset>
  </div>
</template>

<script setup>
defineProps({
  filters: { type: Object, required: true },
  games: { type: Array, required: true },
  categories: { type: Object, required: true },
})
const emit = defineEmits(['change'])
</script>
