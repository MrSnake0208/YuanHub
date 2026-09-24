<template>
  <span
    class="operator-rarity-badge"
    :class="['rarity-r' + normalizedRarity, { compact }]"
    :title="label + ' · ' + normalizedRarity + '★'"
    :aria-label="'稀有度：' + label + '，' + normalizedRarity + '星'"
  >{{ label }}</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  rarity: { type: Number, default: 3 },
  compact: Boolean,
})

const normalizedRarity = computed(function () {
  const value = Number(props.rarity)
  return value === 4 || value === 5 ? value : 3
})

const label = computed(function () {
  if (normalizedRarity.value === 5) return '绝密'
  if (normalizedRarity.value === 4) return '机密'
  return '隐密'
})
</script>

<style scoped>
.operator-rarity-badge {
  --rarity-accent: #99b5cf;
  --rarity-ink: #47647d;
  display: inline-flex;
  min-width: 0;
  height: 20px;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--rarity-accent) 72%, var(--line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--rarity-accent) 18%, var(--surface));
  color: var(--rarity-ink);
  font-size: 10px;
  font-weight: 850;
  line-height: 1;
  letter-spacing: .04em;
  white-space: nowrap;
}
.operator-rarity-badge.rarity-r4 {
  --rarity-accent: #8672b2;
  --rarity-ink: #62508b;
}
.operator-rarity-badge.rarity-r5 {
  --rarity-accent: var(--accent);
  --rarity-ink: var(--accent-strong);
  background: color-mix(in srgb, var(--yellow) 52%, var(--surface));
}
.operator-rarity-badge.compact {
  height: 17px;
  padding-inline: 5px;
  font-size: 9px;
  letter-spacing: .03em;
}
</style>
