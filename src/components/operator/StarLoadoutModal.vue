<template>
  <Teleport to="body">
    <div v-if="open" ref="overlay" class="star-loadout-overlay" tabindex="-1" @click.self="$emit('request-close')" @keydown.esc.prevent="$emit('request-close')">
      <section class="star-loadout-modal" role="dialog" aria-modal="true" aria-label="星石装配">
        <header class="star-loadout-header"><div class="star-loadout-title-line"><h2>星石装配</h2><p>{{ targetOperator?.name || '密探' }}<span v-if="targetOperator?.prof"> · {{ targetOperator.prof }}</span><span v-if="operatorSubProf"> · {{ operatorSubProf }}</span></p></div><button type="button" class="star-loadout-close" :disabled="saving" aria-label="关闭星石装配" @click="$emit('request-close')"><X :size="16" aria-hidden="true" /></button></header>
        <p v-if="error" class="star-loadout-error" role="alert">{{ error }}</p>
        <p v-else-if="saving" class="star-loadout-saving" role="status">正在保存星石装配…</p>
        <StarLoadoutEditor :target-operator="targetOperator" :inventory-entries="inventoryEntries" :draft-loadouts="draftLoadouts" :initial-slot="initialSlot" initial-replacement :operator-display-name-map="operatorDisplayNameMap" @update:draft-loadouts="$emit('update:draftLoadouts', $event)" />
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { X } from '@lucide/vue'
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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.star-loadout-overlay{background:rgba(73,59,44,.42);backdrop-filter:blur(4px);outline:none}.star-loadout-modal{border:1px solid var(--line,#decdb8);border-radius:24px;background:var(--surface,#fffdf6);box-shadow:0 40px 100px -30px rgba(73,59,44,.5);color:var(--ink,#493b2c)}.star-loadout-header{border-bottom:1.5px dashed var(--line,#decdb8)}.star-loadout-header p{color:var(--ink-60,#897666)}.star-loadout-close{border:0;background:transparent;color:var(--ink,#493b2c);cursor:pointer}.star-loadout-close:disabled{opacity:.45;cursor:not-allowed}.star-loadout-error,.star-loadout-saving{color:var(--rouge,#a6514a)}.star-loadout-saving{color:var(--ink-60,#897666)}@media (max-width:600px){.star-loadout-modal{border-radius:0}}
</style>
<style scoped src="./starLoadoutModalDesktop.css"></style>
<style scoped src="./starLoadoutModalMobile.css"></style>
