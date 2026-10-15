<template>
  <div class="operator-organization-card">
    <button type="button" class="organization-pin" :class="{ on: pinned }" :aria-pressed="pinned"
      :aria-label="(pinned ? '取消置顶' : '置顶') + name" :disabled="disabled" @click="$emit('pin')">
      <Pin :size="13" aria-hidden="true" />{{ pinned ? '已置顶' : '置顶' }}
    </button>
    <span v-for="tag in selectedTags" :key="tag.id" class="organization-tag">{{ tag.name }}</span>
    <details v-if="tags.length" class="organization-tag-menu">
      <summary :aria-label="name + '的自定义标签'">标签</summary>
      <div class="organization-tag-options">
        <label v-for="tag in tags" :key="tag.id"><input type="checkbox" :checked="tag.operator_ids.includes(operatorId)"
          :disabled="disabled" @change="changeTag(tag, $event)" />{{ tag.name }}</label>
      </div>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Pin } from '@lucide/vue'
const props = defineProps({ operatorId: { type: String, required: true }, name: { type: String, required: true },
  pinned: Boolean, disabled: Boolean, tags: { type: Array, default: () => [] } })
const emit = defineEmits(['pin', 'tag'])
const selectedTags = computed(() => props.tags.filter(tag => tag.operator_ids.includes(props.operatorId)))
function changeTag(tag, event) {
  emit('tag', tag.id, event.target.checked)
  event.target.checked = tag.operator_ids.includes(props.operatorId)
}
</script>

<style scoped>
.operator-organization-card { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0; min-width: 0; }
.organization-pin { display: inline-flex; align-items: center; gap: 3px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--tea); padding: 4px 7px; cursor: pointer; }
.organization-pin.on, .organization-tag { background: var(--cream); color: var(--ink); }
.organization-tag { border-radius: 5px; padding: 3px 6px; font-size: 12px; overflow-wrap: anywhere; }
.organization-tag-menu { color: var(--tea); font-size: 12px; }
.organization-tag-menu[open] { flex-basis: 100%; }
summary { cursor: pointer; padding: 4px; }
.organization-tag-options { display: grid; gap: 8px; max-height: 240px; overflow: auto; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); }
label { display: flex; gap: 7px; align-items: start; overflow-wrap: anywhere; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--tea); outline-offset: 2px; }
</style>
