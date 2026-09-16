<template>
  <Transition name="promo-install">
    <aside
      v-if="visible"
      class="promo-install-prompt"
      role="region"
      aria-label="把 YuanHub 添加到桌面"
    >
      <div class="promo-install-card">
        <button
          class="promo-install-close"
          type="button"
          aria-label="关闭添加到桌面提示，七天内不再主动显示"
          @click="closePrompt"
        >
          ×
        </button>

        <div class="promo-install-main">
          <img src="/pwa/icon-192.png" alt="" width="52" height="52" />
          <div>
            <p class="promo-install-kicker">SAVE YUANHUB</p>
            <p class="promo-install-title">{{ installed ? 'YuanHub 已从桌面打开' : '先把 YuanHub 保存到桌面' }}</p>
            <p class="promo-install-copy">
              {{ installed
                ? '当前已经以独立窗口运行，无需再次添加。'
                : '现在保存好，之后可以直接从桌面进入；正式主站上线到同一域名后，这个入口仍会继续打开 YuanHub。' }}
            </p>
          </div>
        </div>

        <div v-if="showQuickGuide && !installed" class="promo-install-guide" aria-live="polite">
          <template v-if="pwaInstallState.ios">
            <ol>
              <li><b>01</b><span>打开当前浏览器的“分享”菜单</span></li>
              <li><b>02</b><span>选择“添加到主屏幕”</span></li>
              <li><b>03</b><span>如显示“作为 Web App 打开”，保持开启后点击“添加”</span></li>
            </ol>
          </template>
          <template v-else>
            <ol>
              <li><b>01</b><span>打开浏览器菜单</span></li>
              <li><b>02</b><span>选择“安装应用”或“添加到主屏幕”</span></li>
            </ol>
          </template>
        </div>

        <div class="promo-install-actions">
          <template v-if="!installed">
            <button
              v-if="pwaInstallState.installable && !pwaInstallState.ios"
              class="promo-install-primary"
              type="button"
              :disabled="installing"
              @click="installNow"
            >
              {{ installing ? '正在打开…' : '立即添加' }}
            </button>
            <button
              v-else
              class="promo-install-primary"
              type="button"
              @click="showQuickGuide = !showQuickGuide"
            >
              {{ showQuickGuide ? '收起方法' : '查看添加方法' }}
            </button>
            <span class="promo-install-note">无需应用商店</span>
          </template>
          <button v-else class="promo-install-primary" type="button" @click="closeWithoutCooldown">知道了</button>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  dismissPwaInstallPrompt,
  pwaInstallState,
  requestPwaInstall,
  shouldShowPwaInstallPrompt
} from './pwaInstall.js'

const props = defineProps({
  open: { type: Boolean, default: false }
})
const emit = defineEmits(['update:open'])

const autoReady = ref(false)
const showQuickGuide = ref(false)
const installing = ref(false)
let revealTimer = null

const installed = computed(() => pwaInstallState.installed || pwaInstallState.standalone)
const visible = computed(() => props.open || (autoReady.value && shouldShowPwaInstallPrompt()))

watch(() => props.open, (open) => {
  if (open && pwaInstallState.ios) showQuickGuide.value = true
})

function closePrompt() {
  dismissPwaInstallPrompt()
  autoReady.value = false
  showQuickGuide.value = false
  emit('update:open', false)
}

function closeWithoutCooldown() {
  autoReady.value = false
  showQuickGuide.value = false
  emit('update:open', false)
}

async function installNow() {
  if (installing.value) return
  installing.value = true
  try {
    const result = await requestPwaInstall()
    if (result.outcome === 'accepted') closeWithoutCooldown()
    else if (result.outcome === 'unavailable') showQuickGuide.value = true
  } finally {
    installing.value = false
  }
}

onMounted(() => {
  revealTimer = window.setTimeout(() => {
    autoReady.value = true
  }, 1800)
})

onBeforeUnmount(() => {
  if (revealTimer) window.clearTimeout(revealTimer)
})
</script>

<style scoped>
.promo-install-prompt {
  position: fixed;
  z-index: 180;
  right: 12px;
  bottom: max(12px, env(safe-area-inset-bottom));
  left: 12px;
  pointer-events: none;
}
.promo-install-card {
  position: relative;
  width: min(540px, 100%);
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid rgba(90, 70, 51, .22);
  border-radius: 20px;
  background: rgba(255, 253, 246, .98);
  box-shadow: 0 20px 55px rgba(73, 59, 44, .24);
  pointer-events: auto;
  backdrop-filter: blur(16px);
}
.promo-install-card::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, #dfb863, #d78935, transparent 84%);
  content: '';
}
.promo-install-main {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 18px 48px 15px 17px;
}
.promo-install-main img {
  width: 52px;
  height: 52px;
  flex: none;
  border: 1px solid rgba(90, 70, 51, .18);
  border-radius: 14px;
  background: #f6edd0;
}
.promo-install-kicker {
  margin: 0 0 4px;
  color: #8f5112;
  font: 800 9px/1.2 'Archivo', sans-serif;
  letter-spacing: .15em;
}
.promo-install-title {
  margin: 0;
  color: #493b2c;
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 17px;
  font-weight: 900;
}
.promo-install-copy {
  margin: 5px 0 0;
  color: rgba(73, 59, 44, .68);
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.6;
}
.promo-install-close {
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
  color: rgba(73, 59, 44, .65);
  background: transparent;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}
.promo-install-close:hover { background: #fff8ec; color: #493b2c; }
.promo-install-guide {
  margin: 0 16px 12px;
  padding: 11px 13px;
  border: 1px solid rgba(90, 70, 51, .18);
  border-radius: 12px;
  background: #f6edd0;
}
.promo-install-guide ol { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
.promo-install-guide li { display: grid; grid-template-columns: 24px 1fr; align-items: start; gap: 7px; color: #493b2c; font-size: 11.5px; font-weight: 700; line-height: 1.5; }
.promo-install-guide b { color: #8f5112; font: 900 10px/1.5 'Archivo', sans-serif; }
.promo-install-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  padding: 10px 16px 13px;
  border-top: 1px solid rgba(90, 70, 51, .16);
  background: rgba(246, 237, 208, .4);
}
.promo-install-primary {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border: 1px solid #5a4633;
  border-radius: 999px;
  color: #fff8ec;
  background: #5a4633;
  font: 800 12px/1.2 'PingFang SC', 'Microsoft YaHei', sans-serif;
  cursor: pointer;
}
.promo-install-primary:hover:not(:disabled) { border-color: #d78935; background: #d78935; }
.promo-install-primary:disabled { opacity: .58; cursor: wait; }
.promo-install-note { color: rgba(73, 59, 44, .58); font-size: 10.5px; font-weight: 700; }
.promo-install-enter-active,
.promo-install-leave-active { transition: opacity .22s ease, transform .22s ease; }
.promo-install-enter-from,
.promo-install-leave-to { opacity: 0; transform: translateY(16px); }
@media (max-width: 420px) {
  .promo-install-main { align-items: flex-start; padding-left: 14px; }
  .promo-install-main img { width: 46px; height: 46px; border-radius: 12px; }
  .promo-install-title { font-size: 15.5px; }
  .promo-install-copy { font-size: 11px; }
  .promo-install-actions { padding-inline: 14px; }
}
</style>
