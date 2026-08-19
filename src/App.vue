<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <RouterView v-slot="{ Component }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <!-- 全站自定义弹窗（alert / confirm / prompt），Teleport 到 body -->
  <AppDialog />
</template>

<script setup>
import AppDialog from '@/components/AppDialog.vue'
</script>
