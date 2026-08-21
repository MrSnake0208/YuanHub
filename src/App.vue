<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <RouterView v-slot="{ Component }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <AccountEventToasts />
  <!-- 全站自定义弹窗（alert / confirm / prompt），Teleport 到 body -->
  <AppDialog />
</template>

<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue'
import AppDialog from '@/components/AppDialog.vue'
import AccountEventToasts from '@/components/AccountEventToasts.vue'
import { auth } from '@/store/auth.js'
import { activeAccount } from '@/store/activeAccount.js'
import { stopAccountEventStream, syncAccountEventStream } from '@/store/accountEvents.js'

let stopWatch = null
onMounted(function () {
  stopWatch = watch(
    function () { return [auth.accessToken, activeAccount.id] },
    syncAccountEventStream,
    { immediate: true }
  )
})

onBeforeUnmount(function () {
  if (stopWatch) stopWatch()
  stopAccountEventStream()
})
</script>
