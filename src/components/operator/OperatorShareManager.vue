<template>
  <AccountShareManager ref="manager" :account-id="accountId" @status-change="$emit('status-change', $event)" @share-change="$emit('share-change', $event)" />
</template>
<script setup>
// Preserve the operator page's events and exposed copy action using the shared manager.
import { ref } from 'vue'
import AccountShareManager from '../AccountShareManager.vue'
defineProps({ accountId: { type: String, required: true } })
defineEmits(['status-change', 'share-change'])
const manager = ref(null)
defineExpose({ copyCurrentShare: () => manager.value?.copyCurrentShare() ?? false })
</script>
<style scoped src="./operatorShareManagerDesktop.css"></style>
<style scoped src="./operatorShareManagerMobile.css"></style>
