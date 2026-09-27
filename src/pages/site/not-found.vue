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
main { min-height:100dvh; display:grid; place-items:center; padding:24px; }
.not-found-panel { width:min(620px,100%); padding:clamp(24px,6vw,40px); border:1px solid var(--line); border-left:5px solid var(--accent); border-radius:8px; background:var(--surface); }
.eyebrow { color:var(--accent-strong); font-family:var(--font-d); font-size:11px; font-weight:800; letter-spacing:.12em; }
h1 { margin:12px 0 0; color:var(--ink); font-family:var(--font-s); font-size:clamp(26px,5vw,34px); font-weight:900; }
p { margin:12px 0 24px; color:var(--ink-60); line-height:1.8; }
.home-link { min-height:44px; display:inline-flex; align-items:center; padding:0 18px; border-radius:8px; background:var(--tea); color:var(--cream); font-weight:800; text-decoration:none; }
</style>
