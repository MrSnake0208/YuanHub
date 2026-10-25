<template>
  <div class="roadmap-page">
    <IslandSidebar />
    <main id="main-content" class="roadmap-main">
      <TodayLobby title="发展规划" status="" :owner-id="auth.isLoggedIn ? String(auth.userInfo?.id || '') : ''">
        <router-link class="roadmap-home" to="/today">返回今日一览 <ArrowUpRight :size="15" aria-hidden="true" /></router-link>
      </TodayLobby>

      <div class="wrap roadmap-wrap">
        <article class="roadmap-sheet" aria-labelledby="roadmap-title">
          <header class="roadmap-intro">
            <div>
              <h2 id="roadmap-title"><Sprout aria-hidden="true" />未来发展规划</h2>
              <p>和大家一起，把 YuanHub 慢慢变得更好。</p>
            </div>
            <p class="roadmap-timing"><Info :size="14" aria-hidden="true" />规划方向 · 上线时间待定</p>
          </header>

          <section class="roadmap-section" aria-labelledby="roadmap-companionship">
            <header class="roadmap-section-heading">
              <h3 id="roadmap-companionship"><Sprout :size="21" aria-hidden="true" />记录与陪伴</h3>
              <p>留下成长的足迹，也记录与密探的故事。</p>
            </header>
            <div class="roadmap-companionship">
              <article class="roadmap-feature">
                <span class="roadmap-art art-achievement" aria-hidden="true"></span>
                <h4>成就系统</h4>
              </article>
              <article class="roadmap-feature">
                <span class="roadmap-art art-bonds" aria-hidden="true"></span>
                <h4>羁绊系统</h4>
              </article>
              <article class="roadmap-feature">
                <span class="roadmap-art art-stories" aria-hidden="true"></span>
                <h4>信赖值 &amp; 传闻</h4>
              </article>
            </div>
          </section>

          <section class="roadmap-section" aria-labelledby="roadmap-calculation">
            <header class="roadmap-section-heading">
              <h3 id="roadmap-calculation"><ChartNoAxesColumnIncreasing :size="21" aria-hidden="true" />计算与规划</h3>
              <p>面板计算作为基础，入战规则与数据仍需确认。</p>
            </header>
            <div class="roadmap-calculation">
              <article class="roadmap-feature roadmap-feature-inline">
                <span class="roadmap-art art-panel" aria-hidden="true"></span>
                <h4>密探面板自动计算</h4>
              </article>
              <ArrowRight class="roadmap-dependency" :size="24" aria-hidden="true" />
              <article class="roadmap-feature roadmap-feature-inline">
                <span class="roadmap-art art-battle" aria-hidden="true"></span>
                <h4>入战数据计算</h4>
              </article>
            </div>
          </section>

          <section class="roadmap-section" aria-labelledby="roadmap-everyday">
            <header class="roadmap-section-heading">
              <h3 id="roadmap-everyday"><Smartphone :size="21" aria-hidden="true" />随时查看</h3>
            </header>
            <article class="roadmap-feature roadmap-widget">
              <span class="roadmap-art art-widget" aria-hidden="true"></span>
              <div>
                <h4>安卓端小组件</h4>
                <p>想把常用信息，放到离你更近的地方。</p>
                <p class="roadmap-widget-note">展示内容待确定。</p>
              </div>
            </article>
          </section>

          <footer class="roadmap-footer">
            <p><Info :size="15" aria-hidden="true" />规划会随实际进展调整，具体上线以<router-link to="/changelog">更新日志</router-link>为准。</p>
            <router-link class="roadmap-feedback" :to="{ path: '/feedback', query: { new: '1', type: 'FEATURE' } }">
              分享你的想法 <ArrowRight :size="17" aria-hidden="true" />
            </router-link>
          </footer>
        </article>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ArrowRight, ArrowUpRight, ChartNoAxesColumnIncreasing, Info, Smartphone, Sprout } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import TodayLobby from '@/components/today/TodayLobby.vue'
import { auth } from '@/store/auth.js'
</script>

<style scoped>
.roadmap-page { color: var(--ink); }
.roadmap-sheet { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
.roadmap-section, .roadmap-footer { border-top: 1px solid var(--line); }
.roadmap-intro h2, .roadmap-section-heading h3, .roadmap-feature h4 { font-family: var(--font-s); color: var(--theme-strong-text, var(--tea)); }
.roadmap-intro h2 > svg, .roadmap-section-heading h3 > svg { color: var(--theme-accent-text, var(--tea)); }
.roadmap-intro p, .roadmap-section-heading p, .roadmap-widget p, .roadmap-footer { color: var(--ink-60); }
.roadmap-home, .roadmap-footer a { color: var(--theme-accent-text, var(--tea)); }
.roadmap-home, .roadmap-feedback { text-decoration: none; }
.roadmap-footer p a { text-decoration: underline; text-underline-offset: 3px; }
.roadmap-home:hover, .roadmap-feedback:hover { text-decoration: underline; text-underline-offset: 4px; }
.roadmap-page a:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 4px; border-radius: 3px; }
.roadmap-dependency { color: var(--ink-60); }
.roadmap-art { background-image: url('/roadmap/illustrations.png'); background-size: 300% 200%; background-repeat: no-repeat; }
.art-achievement { background-position: 0 0; }
.art-bonds { background-position: 50% 0; }
.art-stories { background-position: 100% 0; }
.art-panel { background-position: 0 100%; }
.art-battle { background-position: 50% 100%; }
.art-widget { background-position: 100% 100%; }
</style>
<style scoped src="./roadmapMobile.css"></style>
<style scoped src="./roadmapDesktop.css"></style>
