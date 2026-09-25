<template>
  <Teleport to="body">
    <Transition name="beta-community">
      <div
        v-if="betaCommunity.visible"
        class="community-mask"
        role="presentation"
        @click.self="close"
      >
        <section
          ref="dialogEl"
          class="community-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="beta-community-title"
          aria-describedby="beta-community-description"
          @keydown.esc.prevent="close"
          @keydown.tab="trapFocus"
        >
          <header class="community-head">
            <div class="community-heading">
              <span class="community-icon" aria-hidden="true">
                <UsersRound :size="21" />
              </span>
              <div>
                <p>{{ autoOpened ? '测试资格已开通' : '内测交流' }}</p>
                <h2 id="beta-community-title">
                  {{ autoOpened ? '欢迎加入内测交流群' : 'YuanHub 内测交流群' }}
                </h2>
              </div>
            </div>
            <button
              type="button"
              class="community-close"
              aria-label="关闭内测交流群"
              @click="close"
            >
              <X :size="19" aria-hidden="true" />
            </button>
          </header>

          <div class="community-body">
            <p id="beta-community-description" class="community-intro">
              {{ autoOpened
                ? '你已经获得本轮测试资格。群内会同步测试提醒，也方便大家交流使用体验和临时问题。'
                : '群内会同步测试提醒，也方便大家交流使用体验和临时问题。' }}
            </p>

            <div class="community-main">
              <div class="community-details">
                <div>
                  <span class="detail-label">内测交流群号</span>
                  <div class="group-number-row">
                    <strong class="group-number">{{ BETA_COMMUNITY.groupNumber }}</strong>
                    <button type="button" class="copy-button" @click="copyGroupNumber">
                      <Copy :size="15" aria-hidden="true" />
                      {{ copyState }}
                    </button>
                  </div>
                </div>

                <div class="community-note">
                  <MessageSquareText :size="18" aria-hidden="true" />
                  <p>
                    群里适合快速交流；如果遇到需要跟踪处理的问题，仍建议使用
                    <router-link to="/feedback" @click="close">站内反馈中心</router-link>，
                    方便查看后续回复。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <footer class="community-foot">
            <button ref="primaryButton" type="button" class="community-primary" @click="close">
              知道了
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Copy, MessageSquareText, UsersRound, X } from '@lucide/vue'
import { BETA_COMMUNITY, betaCommunity } from '@/store/betaCommunity.js'

const copyState = ref('复制群号')
const dialogEl = ref(null)
const primaryButton = ref(null)
let opener = null

const autoOpened = computed(() => betaCommunity.source === 'auto')

function close() {
  betaCommunity.close()
}

function trapFocus(event) {
  const elements = Array.from(
    dialogEl.value?.querySelectorAll('button:not([disabled]), a[href]') || []
  )
  if (!elements.length) return
  const first = elements[0]
  const last = elements[elements.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

async function copyGroupNumber() {
  const value = BETA_COMMUNITY.groupNumber
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
    } else {
      const input = document.createElement('textarea')
      input.value = value
      input.setAttribute('readonly', '')
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    copyState.value = '已复制'
  } catch (_) {
    copyState.value = '请手动复制'
  }
}

watch(
  () => betaCommunity.visible,
  visible => {
    if (visible) {
      opener = document.activeElement
      copyState.value = '复制群号'
      nextTick(() => primaryButton.value?.focus())
      return
    }
    const target = opener
    opener = null
    nextTick(() => target?.focus?.())
  }
)
</script>

<style scoped>
.beta-community-enter-active,
.beta-community-leave-active {
  transition: opacity .24s var(--ease);
}
.beta-community-enter-active .community-dialog,
.beta-community-leave-active .community-dialog {
  transition: transform .24s var(--ease), opacity .24s var(--ease);
}
.beta-community-enter-from,
.beta-community-leave-to {
  opacity: 0;
}
.beta-community-enter-from .community-dialog,
.beta-community-leave-to .community-dialog {
  opacity: 0;
  transform: translateY(16px) scale(.98);
}

.community-mask {
  position: fixed;
  inset: 0;
  z-index: 230;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px;
  background: rgba(73, 59, 44, .52);
  backdrop-filter: blur(4px);
}

.community-dialog {
  width: min(560px, 100%);
  max-height: min(760px, calc(100vh - 44px));
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--surface);
  box-shadow: 0 42px 90px -34px rgba(73, 59, 44, .5);
  color: var(--ink);
}

.community-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 24px 0;
}

.community-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.community-heading p {
  margin: 0 0 2px;
  color: var(--accent-strong);
  font: 800 11px/1.35 var(--font-b);
  letter-spacing: .12em;
}

.community-heading h2 {
  margin: 0;
  font: 900 21px/1.3 var(--font-s);
  letter-spacing: .03em;
}

.community-icon {
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: var(--yellow);
  color: var(--tea);
}

.community-close {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--ink-60);
  cursor: pointer;
}

.community-close:hover {
  background: var(--paper);
  color: var(--ink);
}

.community-body {
  padding: 18px 24px 8px;
}

.community-intro {
  max-width: 600px;
  margin: 0 0 18px;
  color: var(--ink-60);
  font: 650 13.5px/1.8 var(--font-b);
}

.community-main {
  min-width: 0;
}

.community-details {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  padding: 0;
}

.detail-label {
  display: block;
  margin-bottom: 8px;
  color: var(--ink-60);
  font: 750 12px/1.4 var(--font-b);
}

.group-number-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.group-number {
  min-width: 0;
  font: 900 clamp(26px, 5vw, 38px)/1.15 var(--font-s);
  letter-spacing: .04em;
  overflow-wrap: anywhere;
}

.copy-button,
.community-primary {
  min-height: 42px;
  border: 1px solid var(--line);
  border-radius: 12px;
  font-family: var(--font-b);
  font-weight: 800;
  cursor: pointer;
  transition: transform .16s var(--ease), border-color .2s ease, background-color .2s ease;
  touch-action: manipulation;
}

.copy-button {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  background: var(--paper);
  color: var(--tea);
  font-size: 12px;
}

.copy-button:hover {
  border-color: var(--accent);
  background: var(--surface);
}

.community-note {
  display: flex;
  gap: 9px;
  padding: 13px 14px;
  border-radius: 14px;
  background: var(--paper);
  color: var(--ink-60);
}

.community-note svg {
  flex: none;
  margin-top: 2px;
  color: var(--tea);
}

.community-note p {
  margin: 0;
  font: 650 12px/1.7 var(--font-b);
}

.community-note a {
  color: var(--tea);
  font-weight: 850;
  text-underline-offset: 3px;
}

.community-foot {
  display: flex;
  justify-content: flex-end;
  padding: 14px 24px 22px;
}

.community-primary {
  min-width: 112px;
  padding: 0 18px;
  border-color: var(--tea);
  background: var(--tea);
  color: var(--cream);
}

.copy-button:active,
.community-primary:active {
  transform: scale(.98);
  transition-duration: 0s;
}

.community-close:focus-visible,
.copy-button:focus-visible,
.community-primary:focus-visible,
.community-note a:focus-visible {
  outline: 2px solid var(--brand-blue);
  outline-offset: 2px;
}

@media (max-width: 600px) {
  .community-mask {
    align-items: flex-end;
    padding: 0;
  }

  .community-dialog {
    width: 100%;
    max-height: min(88vh, 760px);
    border-width: 1px 0 0;
    border-radius: 24px 24px 0 0;
  }

  .community-head {
    padding: 18px 18px 0;
  }

  .community-heading h2 {
    font-size: 19px;
  }

  .community-body {
    padding: 16px 18px 4px;
  }

  .community-intro {
    margin-bottom: 14px;
  }

  .community-details {
    gap: 14px;
    padding: 0;
  }

  .group-number-row {
    justify-content: space-between;
  }

  .group-number {
    font-size: 30px;
  }

  .community-foot {
    padding: 14px 18px max(18px, env(safe-area-inset-bottom));
  }

  .community-primary {
    width: 100%;
    min-height: 46px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .beta-community-enter-active,
  .beta-community-leave-active,
  .beta-community-enter-active .community-dialog,
  .beta-community-leave-active .community-dialog {
    transition: none;
  }
}
</style>
