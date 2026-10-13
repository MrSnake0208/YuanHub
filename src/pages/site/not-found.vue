<template>
  <div class="page-not-found">
    <IslandSidebar />
    <main id="main-content">
      <section class="not-found-panel" aria-labelledby="not-found-title">
        <span class="eyebrow">404 · PAGE NOT FOUND</span>
        <h1 id="not-found-title">这里没有你要找的页面</h1>
        <p>链接可能写错了，也可能已经失效。可以返回首页继续浏览。</p>
        <router-link class="home-link" to="/">返回首页</router-link>
      </section>
    </main>
  </div>
</template>

<script setup>
import IslandSidebar from '../../components/IslandSidebar.vue'
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.not-found-panel { border:1px solid var(--line); border-left:5px solid var(--accent); border-radius:8px; background:var(--surface); }
.eyebrow { color:var(--accent-strong); }
h1 { color:var(--ink); }
p { color:var(--ink-60); }
.home-link { border-radius:8px; background:var(--tea); color:var(--cream); text-decoration:none; }
</style>
<style scoped src="./notFoundPageDesktop.css"></style>
<style scoped src="./notFoundPageMobile.css"></style>
