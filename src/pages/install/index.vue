<template>
  <div class="page-install">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero install-hero">
        <div class="wrap">
          <div class="crumb"><span class="pill fill">YuanHub</span><span class="pill">添加到桌面</span></div>
          <h1>添加到桌面<span class="small">Install YuanHub</span></h1>
          <p class="hero-sub">{{ TUTORIALS_ENABLED ? '跟着完成一次真实安装，或继续使用网页版。随时可以关闭教程。' : '添加 YuanHub 到桌面，或继续使用网页版。' }}</p>
        </div>
      </header>
      <section class="wrap install-content">
        <div v-if="TUTORIALS_ENABLED && pwaInstallState.guideActive" class="task-exit"><button ref="exitButton" class="install-secondary exit-guide" type="button" @click="exitGuide">关闭教程 / 退出引导</button></div>
        <article v-if="pwaInstallState.standalone || pwaInstallState.installed" class="guide-card">
          <div class="installed-banner" role="status">
            <CircleCheck :size="24" aria-hidden="true" />
            <div>
              <h2>{{ pwaInstallState.standalone ? '你现在正从桌面版 YuanHub 运行。' : '系统已确认 YuanHub 安装完成。' }}</h2>
              <p v-if="!pwaInstallState.standalone">当前仍在浏览器中，请从桌面图标打开 YuanHub。</p>
              <p v-if="TUTORIALS_ENABLED && pwaInstallState.tutorialCompleted">实操教程已完成。</p>
            </div>
          </div>
          <button v-if="TUTORIALS_ENABLED" ref="startButton" class="install-now" type="button" @click="beginGuide">使用教程（复用已安装成果）</button>
          <router-link ref="doneLink" class="install-secondary" to="/">继续使用 YuanHub</router-link>
        </article>

        <article v-else-if="TUTORIALS_ENABLED && pwaInstallState.guideActive" ref="taskPanel" class="guide-card" aria-labelledby="install-task-title">
          <header class="guide-head">
            <div><span class="eyebrow">{{ pwaInstallState.ios ? 'IPHONE / IPAD' : '安装任务' }}</span><h2 id="install-task-title" ref="taskHeading" tabindex="-1">{{ taskTitle }}</h2></div>
          </header>
          <div class="install-feedback" role="status" aria-live="polite">
            <p v-if="pwaInstallState.requesting">正在打开系统安装提示。你可以随时关闭教程。</p>
            <template v-else-if="pwaInstallState.phase === 'waiting-for-install'">
              <p>正在等待系统完成安装。请从桌面图标打开 YuanHub。</p>
              <p>同意安装不代表系统已完成安装；回到浏览器也不能确认安装成功。</p>
            </template>
            <template v-else>
              <p v-if="pwaInstallState.phase === 'dismissed'">本次安装已取消。可以重试，也可以继续使用网页版。</p>
              <p v-else-if="pwaInstallState.phase === 'failed'">系统安装调用失败，请按下方方法排查。</p>
              <p v-if="pwaInstallState.installable">点击“立即添加到桌面”，在真实系统提示中选择是否安装。</p>
              <p v-else>{{ getPwaInstallGuidance() }}</p>
            </template>
          </div>
          <div class="task-actions">
            <button v-if="pwaInstallState.installable || pwaInstallState.requesting" ref="installButton" class="install-now" type="button" :disabled="pwaInstallState.requesting" @click="requestPwaInstall">
              <Download :size="17" aria-hidden="true" />{{ pwaInstallState.requesting ? '正在打开…' : '立即添加到桌面' }}
            </button>
            <button v-else-if="!pwaInstallState.requesting && pwaInstallState.phase !== 'waiting-for-install'" class="install-now" type="button" @click="waitForInstall">查看从桌面打开后的状态</button>
            <button class="install-secondary" type="button" @click="refreshPwaInstallStatus">重新检测安装状态</button>
            <button v-if="pwaInstallState.phase === 'waiting-for-install'" class="install-secondary" type="button" @click="showMenu = !showMenu">{{ showMenu ? '收起菜单方法' : '返回查看菜单方法' }}</button>
          </div>
          <p v-if="showMenu && pwaInstallState.phase === 'waiting-for-install'" class="guide-intro">{{ getPwaInstallGuidance() }}</p>
          <p v-if="!pwaInstallState.installable" class="guide-intro">网页无法确认浏览器外的菜单操作，教程会等待真实安装证据。如果只创建了快捷方式，仍以浏览器窗口打开，就不能确认已安装为桌面应用。</p>
          <div v-if="pwaInstallState.phase === 'failed'" class="shortcut-permission-help">
            <Settings2 :size="22" aria-hidden="true" />
            <div>
              <h3>安装故障排查</h3>
              <p>先重新检测安装状态，或通过当前浏览器菜单重试。没有安装菜单时，可换用支持安装的浏览器。</p>
              <p v-if="pwaInstallState.android">部分 Android 系统限制浏览器的“添加桌面快捷方式 / 创建桌面快捷方式”权限。可检查：系统设置 → 应用 / 应用管理 → 当前浏览器 → 权限 / 其他权限。不同品牌名称可能不同；网页无法读取或替你开启权限。</p>
            </div>
          </div>
        </article>

        <article v-else-if="TUTORIALS_ENABLED" class="guide-card">
          <div class="install-overview">
            <img src="/pwa/icon-192.png" alt="YuanHub 应用图标" width="68" height="68" />
            <div><h2>{{ pwaInstallState.dismissedForNow ? '教程已暂停，网页版仍可照常使用' : '把 YuanHub 放到桌面' }}</h2><p>安装需要你亲自操作系统提示或浏览器菜单。阅读说明不会完成教程。</p></div>
          </div>
          <div class="task-actions">
            <button ref="startButton" class="install-now" type="button" @click="beginGuide">{{ pwaInstallState.tutorialStarted ? '继续实操教程' : '跟着做一次' }}</button>
            <router-link class="install-secondary" to="/" @click="closePwaInstallGuide()">直接使用网页版</router-link>
          </div>
        </article>
        <article v-else class="guide-card" aria-labelledby="install-direct-title">
          <h2 id="install-direct-title">把 YuanHub 放到桌面</h2>
          <p>{{ getPwaInstallGuidance() }}</p>
          <div class="install-feedback" role="status" aria-live="polite">
            <p v-if="pwaInstallState.requesting">正在打开系统安装提示…</p>
            <p v-else-if="pwaInstallState.phase === 'waiting-for-install'">正在等待系统完成安装。请从桌面图标打开 YuanHub。</p>
            <p v-else-if="pwaInstallState.phase === 'dismissed'">本次安装已取消，可以重试或继续使用网页版。</p>
            <p v-else-if="pwaInstallState.phase === 'failed'">系统安装调用失败，请查看下方安装故障排查。</p>
            <p v-else>支持安装的浏览器会提供安装按钮，也可以使用浏览器菜单。</p>
          </div>
          <div class="task-actions">
            <button v-if="pwaInstallState.installable || pwaInstallState.requesting" class="install-now" type="button" :disabled="pwaInstallState.requesting" @click="requestPwaInstall"><Download :size="17" aria-hidden="true" />{{ pwaInstallState.requesting ? '正在打开…' : '立即添加到桌面' }}</button>
            <button class="install-secondary" type="button" @click="refreshPwaInstallStatus">重新检测安装状态</button>
            <router-link class="install-secondary" to="/">直接使用网页版</router-link>
          </div>
        </article>
        <article v-if="!TUTORIALS_ENABLED" class="guide-card">
          <h2>安装方法</h2>
          <p>Android：在 Chrome 菜单中选择“安装并创建快捷方式”或“添加到主屏幕”，再确认安装。</p>
          <p>iPhone / iPad：在 Safari 中打开本站，点击“分享” → “添加到主屏幕”；如显示“作为 Web App 打开”，保持开启。</p>
          <p>电脑：使用支持安装的浏览器，点击地址栏安装图标或浏览器菜单中的安装选项。</p>
          <p>安装需要你确认系统提示；网页无法读取或替你开启系统权限。仅创建快捷方式不代表已作为桌面应用运行。</p>
          <details class="shortcut-permission-help" :open="pwaInstallState.phase === 'failed'">
            <summary>安装故障排查</summary>
            <p>重新检测安装状态，或通过当前浏览器菜单重试。没有安装菜单时，Android 可换用 Chrome，iPhone / iPad 可换用 Safari。</p>
            <p>部分 Android 系统限制浏览器的“添加桌面快捷方式 / 创建桌面快捷方式”权限。可检查：系统设置 → 应用 / 应用管理 → 当前浏览器 → 权限 / 其他权限。不同品牌名称可能不同。</p>
          </details>
        </article>
        <div v-if="TUTORIALS_ENABLED" class="guide-preference">
          <button v-if="!pwaInstallState.disableAutoGuide" class="install-secondary" type="button" @click="exitGuide(true)">以后不自动提示</button>
          <p v-else>已关闭自动提示，仍可随时从“安装到桌面”继续教程。</p>
        </div>
      </section>
      <SiteFooter>
        <template #big>放到桌面<br><span>需要时，一点就到</span></template>
        <template #fine><b>YuanHub</b> · 添加到桌面<br>Android / iPhone / iPad</template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CircleCheck, Download, Settings2 } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { modalFocusState } from '@/composables/useModalFocus.js'
import { TUTORIALS_ENABLED } from '@/config/features.js'
import { closePwaInstallGuide, getPwaInstallGuidance, initPwaInstall, pwaInstallState, refreshPwaInstallStatus, requestPwaInstall, startPwaInstallGuide, waitForPwaInstall } from '@/utils/pwaInstall.js'

initPwaInstall()
refreshPwaInstallStatus()
const startButton = ref(null)
const taskHeading = ref(null)
const taskPanel = ref(null)
const doneLink = ref(null)
const installButton = ref(null)
const exitButton = ref(null)
const showMenu = ref(false)
const taskTitle = computed(() => {
  if (pwaInstallState.phase === 'waiting-for-install') return '等待真实安装结果'
  if (pwaInstallState.phase === 'failed') return '恢复安装任务'
  return pwaInstallState.installable ? '现在安装 YuanHub' : '打开浏览器安装菜单'
})
async function beginGuide() {
  if (!TUTORIALS_ENABLED) return
  startPwaInstallGuide()
  await nextTick()
  const target = installButton.value || taskHeading.value || doneLink.value?.$el || doneLink.value
  target?.focus()
}
function waitForInstall() {
  waitForPwaInstall()
  showMenu.value = true
}
async function exitGuide(disableAutoGuide = false) {
  closePwaInstallGuide({ disableAutoGuide: disableAutoGuide === true })
  showMenu.value = false
  await nextTick()
  startButton.value?.focus()
}
function onEscape(event) {
  if (event.key === 'Escape' && pwaInstallState.guideActive && !modalFocusState.active) exitGuide()
}
if (TUTORIALS_ENABLED) {
  watch(() => pwaInstallState.requesting, async requesting => {
    const moveFocus = !requesting && document.activeElement === installButton.value && pwaInstallState.guideActive
    if (!moveFocus) return
    await nextTick()
    exitButton.value?.focus()
  })
  watch(() => pwaInstallState.installed, async installed => {
    const restoreFocus = taskPanel.value?.contains(document.activeElement)
    if (!installed || !restoreFocus) return
    await nextTick()
    const link = doneLink.value?.$el || doneLink.value
    link?.focus()
  })
}
onMounted(() => { if (TUTORIALS_ENABLED) window.addEventListener('keydown', onEscape) })
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape)
  if (TUTORIALS_ENABLED && pwaInstallState.guideActive) closePwaInstallGuide()
})
</script>

<style scoped>
.page-install { min-height: 100dvh; }
.install-hero { --wm: '桌'; }
.install-content { display: grid; gap: 20px; padding-block: 24px calc(24px + env(safe-area-inset-bottom)); }
.guide-card { min-width: 0; padding: clamp(18px, 4vw, 36px); border: 1px solid var(--line); border-radius: 22px; background: var(--surface); }
.guide-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
.guide-card h2 { margin: 5px 0; font-family: var(--font-s); font-size: clamp(21px, 3vw, 31px); }
.eyebrow { color: var(--accent-strong); font: 800 11px var(--font-d); letter-spacing: .1em; }
.install-overview { display: flex; align-items: flex-start; gap: 16px; }
.install-overview > div { min-width: 0; }
.install-overview img { flex: none; width: 68px; height: 68px; border-radius: 18px; }
.guide-card p,.guide-preference p { margin: 8px 0; color: var(--ink-60); font-size: 14px; line-height: 1.75; overflow-wrap: anywhere; }
.task-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
.install-now,.install-secondary { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 18px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: var(--ink); font: 800 13px var(--font-b); cursor: pointer; text-decoration: none; }
.install-now { border-color: var(--tea); background: var(--tea); color: var(--cream); }
.install-now:disabled { opacity: .55; cursor: wait; }
button:hover:not(:disabled),a:hover { border-color: var(--accent); }
button:focus-visible,a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.task-exit { position: sticky; top: calc(72px + env(safe-area-inset-top)); z-index: var(--z-sticky); width: fit-content; max-width: 100%; padding: 4px; border-radius: 20px; background: var(--surface); }
#install-task-title { scroll-margin-top: 150px; }
.install-feedback { margin-top: 20px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--paper); }
.install-feedback p { color: var(--ink); }
.installed-banner { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 20px; }
.installed-banner > svg,.shortcut-permission-help > svg { flex: none; margin-top: 5px; color: var(--accent-strong); }
.shortcut-permission-help { display: flex; align-items: flex-start; gap: 12px; margin-top: 20px; padding: 16px; border: 1px dashed var(--accent); border-radius: 16px; }
.shortcut-permission-help h3 { font-family: var(--font-s); }
details.shortcut-permission-help { display: block; }
details.shortcut-permission-help summary { min-height: 44px; cursor: pointer; }
@media (max-width: 640px) {
  .guide-card { border-radius: 16px; }
  .guide-head { align-items: flex-start; flex-direction: column; }
  .task-actions > *,.task-exit,.exit-guide { width: 100%; }
  .install-overview { flex-wrap: wrap; }
}
</style>
