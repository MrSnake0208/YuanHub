<template>
  <div class="page-forbidden">
    <IslandSidebar />
    <main id="main-content">
      <section class="forbidden-band">
        <div class="forbidden-panel">
          <ShieldCheck :size="32" aria-hidden="true" />
          <span class="eyebrow">ACCESS CHANGED</span>
          <h1>当前账号没有此权限</h1>
          <p>你的管理权限可能已更新。可返回个人中心，继续使用当前仍可访问的功能。</p>
          <div class="actions">
            <router-link class="command primary" to="/user/profile">返回个人中心</router-link>
            <router-link class="command secondary" to="/feedback">查看我的反馈</router-link>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ShieldCheck } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
</script>

<style scoped>
.forbidden-band { min-height: 100vh; display: grid; place-items: center; padding: 48px }
.forbidden-panel { width: min(620px, 100%); padding: 40px; background: var(--surface); border: 1px solid var(--line); border-left: 5px solid var(--rouge); border-radius: 8px }
.forbidden-panel>svg { color: var(--rouge) }
.eyebrow { display: block; margin-top: 20px; color: var(--accent-strong); font-family: var(--font-d); font-size: 11px; font-weight: 800; letter-spacing: .12em }
h1 { margin-top: 8px; color: var(--ink); font-family: var(--font-s); font-size: 32px; font-weight: 900; letter-spacing: 0 }
p { margin-top: 12px; color: var(--ink-60); line-height: 1.8 }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px }
.command { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; padding: 0 18px; border: 1px solid var(--line); border-radius: 8px; color: var(--ink); font-weight: 800; text-decoration: none }
.command.primary { background: var(--tea); border-color: var(--tea); color: var(--cream) }
.command.secondary { background: var(--surface) }
@media (max-width: 640px) {
  .forbidden-band { padding: 24px 16px }
  .forbidden-panel { padding: 28px 20px }
  h1 { font-size: 26px }
  .command { width: 100% }
}
</style>
