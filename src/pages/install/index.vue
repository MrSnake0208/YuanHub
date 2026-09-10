<template>
  <div class="page-install">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero install-hero">
        <div class="wrap">
          <div class="crumb"><span class="pill fill">YuanHub</span><span class="pill">添加到桌面</span></div>
          <h1>添加到桌面<span class="small">Install YuanHub</span></h1>
          <p class="hero-sub">把 YuanHub 固定到手机桌面，下次无需再从浏览器里寻找。安装后可使用独立窗口打开，原有账号与登录方式不变。</p>
          <div v-if="pwaInstallState.standalone || pwaInstallState.installed" class="installed-banner" role="status">
            <CircleCheck :size="20" aria-hidden="true" />
            <span>YuanHub 当前已从桌面独立运行，无需再次添加。</span>
          </div>
        </div>
      </header>

      <section class="wrap install-content">
        <div class="install-overview">
          <img src="/pwa/icon-192.png" alt="YuanHub 临时应用图标" width="86" height="86" />
          <div>
            <span class="eyebrow">MOBILE · PWA</span>
            <h2>像 App 一样从桌面打开</h2>
            <p>无需应用商店。Android 支持时可以直接调用系统安装；iPhone / iPad 使用 Safari 的“添加到主屏幕”。</p>
          </div>
        </div>

        <div class="platform-tabs" role="tablist" aria-label="选择手机平台">
          <button type="button" role="tab" :aria-selected="activeTab === 'android'" :class="{ on: activeTab === 'android' }" @click="activeTab = 'android'">
            <Smartphone :size="17" aria-hidden="true" /> Android
          </button>
          <button type="button" role="tab" :aria-selected="activeTab === 'ios'" :class="{ on: activeTab === 'ios' }" @click="activeTab = 'ios'">
            <Apple :size="17" aria-hidden="true" /> iPhone / iPad
          </button>
        </div>

        <article v-if="activeTab === 'android'" class="guide-card" role="tabpanel">
          <header class="guide-head">
            <div><span class="eyebrow">ANDROID GUIDE</span><h2>Android 添加步骤</h2></div>
            <button v-if="pwaInstallState.installable && !pwaInstallState.ios && !pwaInstallState.installed" class="install-now" type="button" :disabled="installing" @click="installNow">
              <Download :size="17" aria-hidden="true" /> {{ installing ? '正在打开…' : '立即添加到桌面' }}
            </button>
          </header>
          <p class="guide-intro">推荐使用 Chrome、Edge 或支持 PWA 安装的 Android 浏览器。如果上方出现“立即添加到桌面”，可以直接使用，无需再打开浏览器菜单。</p>
          <ol class="steps">
            <li><span class="step-no">01</span><div><h3>打开 YuanHub</h3><p>使用 Chrome、Edge 或其他支持安装 Web App 的浏览器访问本站。</p></div><Globe2 :size="22" aria-hidden="true" /></li>
            <li><span class="step-no">02</span><div><h3>打开浏览器菜单</h3><p>点击浏览器右上角的 <b>⋮</b> 或菜单按钮。</p></div><MoreVertical :size="22" aria-hidden="true" /></li>
            <li><span class="step-no">03</span><div><h3>选择安装</h3><p>选择“安装应用”或“添加到主屏幕”。不同品牌浏览器的文字可能略有区别。</p></div><Download :size="22" aria-hidden="true" /></li>
            <li><span class="step-no">04</span><div><h3>确认添加</h3><p>在系统弹窗中确认安装。完成后桌面或应用列表会出现 YuanHub 图标。</p></div><CircleCheck :size="22" aria-hidden="true" /></li>
            <li><span class="step-no">05</span><div><h3>从桌面启动</h3><p>以后直接点击 YuanHub 图标即可，它会以独立窗口打开。</p></div><AppWindow :size="22" aria-hidden="true" /></li>
          </ol>
        </article>

        <article v-else class="guide-card" role="tabpanel">
          <header class="guide-head"><div><span class="eyebrow">IPHONE / IPAD GUIDE</span><h2>iPhone / iPad 添加步骤</h2></div></header>
          <p v-if="pwaInstallState.ios && !pwaInstallState.safari" class="browser-note"><Info :size="17" aria-hidden="true" /> 当前不是 Safari。建议复制或重新使用 Safari 打开 YuanHub，再按以下步骤操作。</p>
          <p class="guide-intro">iPhone / iPad 不提供网页内的一键安装按钮，需要通过 Safari 的系统分享菜单添加到主屏幕。</p>
          <ol class="steps">
            <li><span class="step-no">01</span><div><h3>使用 Safari 打开 YuanHub</h3><p>在 Safari 中访问本站，并保持当前页面打开。</p></div><Compass :size="22" aria-hidden="true" /></li>
            <li><span class="step-no">02</span><div><h3>点击“分享”</h3><p>点击 Safari 工具栏中的分享按钮。</p></div><Share2 :size="22" aria-hidden="true" /></li>
            <li><span class="step-no">03</span><div><h3>选择“添加到主屏幕”</h3><p>在分享菜单中向下查找“添加到主屏幕”。</p></div><SquarePlus :size="22" aria-hidden="true" /></li>
            <li><span class="step-no">04</span><div><h3>确认名称</h3><p>保留 YuanHub 名称，点击右上角“添加”。</p></div><CircleCheck :size="22" aria-hidden="true" /></li>
            <li><span class="step-no">05</span><div><h3>从桌面进入</h3><p>之后直接点击桌面的 YuanHub 图标即可。</p></div><AppWindow :size="22" aria-hidden="true" /></li>
          </ol>
        </article>

        <aside class="install-note">
          <ShieldCheck :size="20" aria-hidden="true" />
          <div><strong>这不是另一个账号或独立客户端</strong><p>“添加到桌面”只是让当前 YuanHub 网页获得更像 App 的启动方式；登录与站内数据仍使用现有 YuanHub 机制。</p></div>
        </aside>
      </section>

      <SiteFooter>
        <template #big>放到桌面<br><span>需要时，一点就到</span></template>
        <template #fine><b>YuanHub</b> · 添加到桌面<br>Android / iPhone / iPad</template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import {
  AppWindow,
  Apple,
  CircleCheck,
  Compass,
  Download,
  Globe2,
  Info,
  MoreVertical,
  Share2,
  ShieldCheck,
  Smartphone,
  SquarePlus
} from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { pwaInstallState, requestPwaInstall } from '@/utils/pwaInstall.js'

const activeTab = ref('android')
const installing = ref(false)

async function installNow() {
  if (installing.value) return
  installing.value = true
  try { await requestPwaInstall() } finally { installing.value = false }
}

onMounted(function () {
  if (pwaInstallState.ios) activeTab.value = 'ios'
})
</script>

<style scoped>
.page-install { min-height: 100vh; }
.install-hero { --wm: '桌'; }
.installed-banner { width: fit-content; max-width: 100%; display: flex; align-items: center; gap: 9px; margin-top: 22px; padding: 10px 14px; border: 1px solid var(--yellow-deep); border-radius: 999px; background: var(--surface); color: var(--ink); font-size: 12.5px; font-weight: 800; }
.installed-banner svg { color: var(--accent-strong); flex: none; }
.install-content { display: grid; gap: 22px; padding-top: 34px; padding-bottom: 20px; }
.install-overview { display: flex; align-items: center; gap: 20px; padding: 24px 28px; border: 1px solid var(--line); border-radius: 22px; background: var(--surface); }
.install-overview img { width: 86px; height: 86px; flex: none; border: 1px solid var(--line); border-radius: 22px; background: var(--paper); }
.eyebrow { color: var(--accent-strong); font-family: var(--font-d); font-size: 10px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
.install-overview h2,.guide-head h2 { margin-top: 5px; font-family: var(--font-s); font-size: clamp(23px, 3vw, 31px); font-weight: 900; letter-spacing: .04em; }
.install-overview p,.guide-intro { margin-top: 8px; color: var(--ink-60); font-size: 13.5px; line-height: 1.75; }
.platform-tabs { display: flex; gap: 7px; width: fit-content; padding: 5px; border: 1px solid var(--line); border-radius: 999px; background: var(--cream); }
.platform-tabs button { min-height: 42px; display: inline-flex; align-items: center; gap: 7px; padding: 8px 17px; border: 0; border-radius: 999px; background: transparent; color: var(--ink-60); font: 800 12.5px var(--font-b); cursor: pointer; }
.platform-tabs button.on { background: var(--tea); color: var(--cream); }
.guide-card { padding: clamp(22px, 4vw, 36px); border: 1px solid var(--line); border-radius: 22px; background: var(--surface); box-shadow: 0 18px 38px -34px rgba(73,59,44,.45); }
.guide-head { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.install-now { min-height: 44px; display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; border: 1px solid var(--tea); border-radius: 999px; background: var(--tea); color: var(--cream); font: 800 12.5px var(--font-b); cursor: pointer; white-space: nowrap; }
.install-now:hover:not(:disabled) { border-color: var(--accent); background: var(--accent); }
.install-now:disabled { opacity: .55; cursor: wait; }
.browser-note { display: flex; align-items: flex-start; gap: 8px; margin: 18px 0 0; padding: 11px 13px; border: 1px solid rgba(166,81,74,.35); border-radius: 12px; background: rgba(240,207,200,.25); color: var(--rouge); font-size: 12px; font-weight: 800; line-height: 1.55; }
.browser-note svg { flex: none; margin-top: 1px; }
.steps { display: grid; gap: 10px; margin: 24px 0 0; padding: 0; list-style: none; }
.steps li { display: grid; grid-template-columns: 46px minmax(0, 1fr) 28px; align-items: center; gap: 13px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 15px; background: var(--paper); }
.step-no { color: var(--accent-strong); font: 900 18px var(--font-d); }
.steps h3 { font-family: var(--font-s); font-size: 16px; font-weight: 900; }
.steps p { margin-top: 4px; color: var(--ink-60); font-size: 12.5px; line-height: 1.65; }
.steps > li > svg { color: var(--accent-strong); }
.install-note { display: flex; align-items: flex-start; gap: 12px; padding: 18px 20px; border: 1px dashed var(--line); border-radius: 16px; background: rgba(255,248,236,.75); }
.install-note > svg { flex: none; color: var(--accent-strong); margin-top: 2px; }
.install-note strong { font-family: var(--font-s); font-size: 14px; }
.install-note p { margin-top: 4px; color: var(--ink-60); font-size: 12.5px; line-height: 1.7; }
@media (max-width: 640px) {
  .install-content { padding-top: 22px; }
  .install-overview { align-items: flex-start; padding: 18px; border-radius: 16px; }
  .install-overview img { width: 68px; height: 68px; border-radius: 17px; }
  .platform-tabs { width: 100%; }
  .platform-tabs button { flex: 1; padding-inline: 8px; }
  .guide-card { border-radius: 16px; }
  .guide-head { align-items: flex-start; flex-direction: column; }
  .install-now { width: 100%; justify-content: center; }
  .steps li { grid-template-columns: 38px minmax(0,1fr) 22px; gap: 9px; padding: 14px 13px; }
  .step-no { font-size: 15px; }
}
@media (max-width: 380px) {
  .install-overview { gap: 12px; }
  .install-overview img { width: 58px; height: 58px; }
  .platform-tabs button { font-size: 11.5px; }
  .steps li { grid-template-columns: 32px minmax(0,1fr); }
  .steps > li > svg { display: none; }
}
</style>
