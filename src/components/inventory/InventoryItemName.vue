<template>
  <span class="slot-name">
    <template v-if="elementLock">
      <span>{{ elementLock.before }}</span>
      <span
        class="element-seal"
        :class="{ 'dark-ink': elementLock.darkInk }"
        :style="{ '--element-color': elementLock.color }"
      >{{ elementLock.element }}</span>
      <span>{{ elementLock.after }}</span>
    </template>
    <template v-else>{{ displayName }}</template>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { ELEMENT_LOCKS } from '../../data/inventory/elementColors.js'

const props = defineProps({
  entry: { type: Object, required: true }
})

const displayName = computed(function () { return props.entry.name || props.entry.id })
const elementLock = computed(function () {
  const meta = ELEMENT_LOCKS[props.entry.id]
  if (!meta) return null
  const index = displayName.value.indexOf(meta.element)
  if (index < 0) return null
  return Object.assign({}, meta, {
    before: displayName.value.slice(0, index),
    after: displayName.value.slice(index + meta.element.length)
  })
})
</script>

<style scoped>
.element-seal {
  display: inline-grid;
  place-items: center;
  flex: 0 0 1.45em;
  width: 1.45em;
  height: 1.45em;
  margin: 0 1px;
  border-radius: 3px;
  background: var(--element-color);
  color: var(--cream);
  font-family: var(--font-b);
  font-size: .92em;
  font-weight: 900;
  line-height: 1;
  box-shadow: inset 0 0 0 1px rgba(73, 59, 44, .12);
}

.element-seal.dark-ink { color: var(--ink) }
</style>
