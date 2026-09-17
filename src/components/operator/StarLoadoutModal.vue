<template>
  <Teleport to="body">
    <div v-if="open" ref="overlay" class="star-loadout-overlay" tabindex="-1" @click.self="$emit('request-close')" @keydown.esc.prevent="$emit('request-close')">
      <section class="star-loadout-modal" role="dialog" aria-modal="true" aria-label="星石装配">
        <header class="star-loadout-header"><div class="star-loadout-title-line"><h2>星石装配</h2><p>{{ targetOperator?.name || '密探' }}<span v-if="targetOperator?.prof"> · {{ targetOperator.prof }}</span><span v-if="operatorSubProf"> · {{ operatorSubProf }}</span></p></div><button type="button" class="star-loadout-close" :disabled="saving" aria-label="关闭星石装配" @click="$emit('request-close')">×</button></header>
        <p v-if="error" class="star-loadout-error" role="alert">{{ error }}</p>
        <p v-else-if="saving" class="star-loadout-saving" role="status">正在保存星石装配…</p>
        <StarLoadoutEditor :target-operator="targetOperator" :inventory-entries="inventoryEntries" :draft-loadouts="draftLoadouts" :initial-slot="initialSlot" initial-replacement :operator-display-name-map="operatorDisplayNameMap" @update:draft-loadouts="$emit('update:draftLoadouts', $event)" />
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import StarLoadoutEditor from './StarLoadoutEditor.vue'
const props = defineProps({ open: Boolean, targetOperator: Object, inventoryEntries: Array, draftLoadouts: Object, initialSlot: String, saving: Boolean, error: String, operatorDisplayNameMap: Object })
defineEmits(['request-close', 'update:draftLoadouts'])
const operatorSubProf = computed(function () { return Array.isArray(props.targetOperator?.subProf) ? props.targetOperator.subProf.join('/') : props.targetOperator?.subProf || '' })
const overlay = ref(null)
watch(function () { return props.open }, function (open) {
  if (open) nextTick(function () { overlay.value?.focus() })
})
</script>

<style scoped>
.star-loadout-overlay{position:fixed;inset:0;z-index:80;display:grid;place-items:center;overflow:hidden;padding:24px;background:rgba(73,59,44,.42);backdrop-filter:blur(4px);isolation:isolate;outline:none}.star-loadout-modal{display:flex;width:min(760px,100%);height:min(92dvh,820px);max-width:100%;max-height:calc(100dvh - 48px);min-height:0;flex-direction:column;overflow:hidden;border:1px solid var(--line,#decdb8);border-radius:24px;background:var(--surface,#fffdf6);box-shadow:0 40px 100px -30px rgba(73,59,44,.5);color:var(--ink,#493b2c);box-sizing:border-box}.star-loadout-header{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:14px;flex:0 0 auto;padding:15px 20px 12px;border-bottom:1.5px dashed var(--line,#decdb8)}.star-loadout-title-line{display:flex;min-width:0;align-items:baseline;gap:9px}.star-loadout-header h2{flex:0 0 auto;margin:0;font:900 21px var(--font-s,serif)}.star-loadout-header p{min-width:0;margin:0;overflow:hidden;color:var(--ink-60,#897666);font:700 12px var(--font-b,inherit);text-overflow:ellipsis;white-space:nowrap}.star-loadout-close{flex:0 0 auto;border:0;background:transparent;color:var(--ink,#493b2c);font-size:25px;line-height:1;cursor:pointer}.star-loadout-close:disabled{opacity:.45;cursor:not-allowed}.star-loadout-error,.star-loadout-saving{flex:0 0 auto;margin:8px 20px 0;color:var(--rouge,#a6514a);font:700 12px var(--font-b,inherit)}.star-loadout-saving{color:var(--ink-60,#897666)}.star-loadout-modal :deep(.star-loadout-editor){min-height:0;flex:1;padding:0 20px 16px;grid-template-rows:auto auto auto minmax(0,1fr)}.star-loadout-modal :deep(.star-candidate-scroll){min-height:0;max-height:none}@media (max-width:600px){.star-loadout-overlay{padding:0}.star-loadout-modal{width:100%;height:100dvh;max-height:none;border-radius:0}.star-loadout-header{align-items:flex-start;padding:14px 16px 11px}.star-loadout-title-line{align-items:baseline;flex-wrap:wrap;gap:2px 9px}.star-loadout-header p{overflow:visible;white-space:normal}.star-loadout-modal :deep(.star-loadout-editor){padding:0 16px 14px}}
</style>
