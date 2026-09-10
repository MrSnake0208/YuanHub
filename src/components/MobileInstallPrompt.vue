<template>
  <Transition name="pwa-install">
    <aside
      v-if="visible"
      class="pwa-install-prompt"
      role="region"
      aria-label="添加 YuanHub 到桌面"
    >
      <div class="pwa-install-card">
        <button
          class="pwa-install-close"
          type="button"
          aria-label="关闭添加到桌面提示，七天内不再显示"
          @click="closePrompt"
        >
          <X :size="18" aria-hidden="true" />
        </button>

        <div class="pwa-install-main">
          <img src="/pwa/icon-192.png" alt="" width="52" height="52" />
          <div>
            <p class="pwa-install-title">把 YuanHub 放到桌面</p>
            <p class="pwa-install-copy">添加后可从桌面直接打开 YuanHub，并以独立窗口使用。</p>
          </div>
        </div>

        <div v-if="showQuickGuide" class="pwa-install-guide" aria-live="polite">
          <template v-if="pwaInstallState.ios">
            <p v-if="!pwaInstallState.safari" class="pwa-install-note">建议先使用 Safari 打开 YuanHub。</p>
            <ol>
              <li><Share2 :size="15" aria-hidden="true" /><span>点击 Safari 的“分享”按钮</span></li>
              <li><SquarePlus :size="15" aria-hidden="true" /><span>选择“添加到主屏幕”</span></li>
              <li><Check :size="15" aria-hidden="true" /><span>点击“添加”完成</span></li>
            </ol>
          </template>
          <template v-else>
            <ol>
              <li><MoreVertical :size="15" aria-hidden="true" /><span>打开浏览器菜单</span></li>
              <li><Download :size="15" aria-hidden="true" /><span>选择“安装应用”或“添加到主屏幕”</span></li>
            </ol>
          </template>
        </div>

        <div class="pwa-install-actions">
          <button
            v-if="pwaInstallState.installable && !pwaInstallState.ios"
            class="pwa-install-primary"
            type="button"
            :disabled="installing"
            @click="installNow"
          >
            <Download :size="16" aria-hidden="true" />
            {{ installing ? '正在打开…' : '立即添加' }}
          </button>
          <button
            v-else
            class="pwa-install-primary"
            type="button"
            @click="showQuickGuide = !showQuickGuide"
          >
            <Share2 v-if="pwaInstallState.ios" :size="16" aria-hidden="true" />
            <Download v-else :size="16" aria-hidden="true" />
            {{ showQuickGuide ? '收起方法' : '查看添加方法' }}
          </button>
          <router-link class="pwa-install-secondary" to="/install">查看详细教程</router-link>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, Download, MoreVertical, Share2, SquarePlus, X } from '@lucide/vue'
import { dialog } from '@/utils/dialog.js'
import {
  dismissPwaInstallPrompt,
  pwaInstallState,
  requestPwaInstall,
  shouldShowPwaInstallPrompt
} from '@/utils/pwaInstall.js'

const ready = ref(false)
const showQuickGuide = ref(false)
const installing = ref(false)
let revealTimer = null

const visible = computed(function () {
  return ready.value && !dialog._state.visible && shouldShowPwaInstallPrompt()
})

function closePrompt() {
  dismissPwaInstallPrompt()
  ready.value = false
}

async function installNow() {
  if (installing.value) return
  installing.value = true
  try {
    const result = await requestPwaInstall()
    if (result.outcome === 'accepted') ready.value = false
    else if (result.outcome === 'unavailable') showQuickGuide.value = true
  } finally {
    installing.value = false
  }
}

onMounted(function () {
  revealTimer = window.setTimeout(function () {
    ready.value = true
  }, 1800)
})

onBeforeUnmount(function () {
  if (revealTimer) window.clearTimeout(revealTimer)
})
</script>

<style scoped>
.pwa-install-prompt {
  position: fixed;
  z-index: 150;
  right: 12px;
  bottom: max(12px, env(safe-area-inset-bottom));
  left: 12px;
  pointer-events: none;
}
.pwa-install-card {
  position: relative;
  width: min(520px, 100%);
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: rgba(255, 253, 246, .98);
  box-shadow: 0 18px 48px rgba(73, 59, 44, .22);
  pointer-events: auto;
  backdrop-filter: blur(14px);
}
.pwa-install-card::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--yellow-deep), var(--accent), transparent 82%);
  content: '';
}
.pwa-install-main {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 17px 48px 15px 17px;
}
.pwa-install-main img {
  width: 52px;
  height: 52px;
  flex: none;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--paper);
}
.pwa-install-title {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-s);
  font-size: 17px;
  font-weight: 900;
  letter-spacing: .035em;
}
.pwa-install-copy {
  margin: 5px 0 0;
  color: var(--ink-60);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
}
.pwa-install-close {
  position: absolute;
  z-index: 2;
  top: 10px;
  right: 10px;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ink-60);
  cursor: pointer;
}
.pwa-install-close:hover { background: var(--cream); color: var(--ink); }
.pwa-install-guide {
  margin: 0 16px 12px;
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--paper);
}
.pwa-install-guide ol { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
.pwa-install-guide li { display: flex; align-items: center; gap: 8px; color: var(--ink); font-size: 11.5px; font-weight: 700; line-height: 1.45; }
.pwa-install-guide li svg { flex: none; color: var(--accent-strong); }
.pwa-install-note { margin: 0 0 9px; color: var(--rouge); font-size: 11px; font-weight: 800; }
.pwa-install-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px 14px;
  border-top: 1px solid var(--line);
  background: rgba(246, 237, 208, .35);
}
.pwa-install-primary,
.pwa-install-secondary {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 14px;
  border-radius: 999px;
  font-family: var(--font-b);
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
}
.pwa-install-primary {
  border: 1px solid var(--tea);
  background: var(--tea);
  color: var(--cream);
}
.pwa-install-primary:hover:not(:disabled) { border-color: var(--accent); background: var(--accent); }
.pwa-install-primary:disabled { opacity: .55; cursor: wait; }
.pwa-install-secondary {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
}
.pwa-install-secondary:hover { border-color: var(--accent); color: var(--accent-strong); }
.pwa-install-enter-active,
.pwa-install-leave-active { transition: opacity .25s var(--ease), transform .25s var(--ease); }
.pwa-install-enter-from,
.pwa-install-leave-to { opacity: 0; transform: translateY(14px); }

@media (max-width: 420px) {
  .pwa-install-prompt { right: 8px; left: 8px; bottom: max(8px, env(safe-area-inset-bottom)); }
  .pwa-install-card { border-radius: 16px; }
  .pwa-install-main { padding: 15px 42px 13px 14px; }
  .pwa-install-main img { width: 48px; height: 48px; }
  .pwa-install-title { font-size: 15.5px; }
  .pwa-install-copy { font-size: 11.5px; }
  .pwa-install-actions { padding: 10px 13px 12px; }
  .pwa-install-primary,.pwa-install-secondary { min-height: 36px; padding-inline: 12px; font-size: 11.5px; }
}

@media (orientation: landscape) and (max-height: 520px) {
  .pwa-install-copy { display: none; }
  .pwa-install-main { padding-block: 11px; }
  .pwa-install-actions { padding-block: 8px; }
}
</style>
