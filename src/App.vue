<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <RouterView v-slot="{ Component }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
</template>
