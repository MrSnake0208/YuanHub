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
          tabindex="-1"
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
                  <span class="detail-label">QQ 内测交流群号</span>
                  <div class="group-number-row">
                    <strong class="group-number">{{ BETA_COMMUNITY.groupNumber }}</strong>
                  </div>
                  <p class="join-steps">复制群号 → 在 QQ 中搜索群 → 申请加入</p>
                  <p v-if="copyState !== '复制群号'" class="join-result" role="status">{{ copyState === '已复制' ? '群号已复制，接下来打开 QQ 搜索群。' : '复制失败，请选中上面的群号手动复制。' }}</p>
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
            <button type="button" class="copy-button" @click="close">稍后加入</button>
            <button ref="primaryButton" type="button" class="community-primary" @click="copyGroupNumber">
              <Copy :size="16" aria-hidden="true" />{{ copyState }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Copy, MessageSquareText, UsersRound, X } from '@lucide/vue'
import { BETA_COMMUNITY, betaCommunity } from '@/store/betaCommunity.js'
import { useModalFocus } from '@/composables/useModalFocus.js'

const copyState = ref('复制群号')
const dialogEl = ref(null)
const primaryButton = ref(null)

const autoOpened = computed(() => betaCommunity.source === 'auto')

function close() {
  betaCommunity.close()
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
      dialogEl.value.appendChild(input)
      try {
        input.select()
        if (!document.execCommand('copy')) throw new Error('复制失败')
      } finally {
        input.remove()
        primaryButton.value?.focus()
      }
    }
    copyState.value = '已复制'
  } catch (_) {
    copyState.value = '请手动复制'
  }
}

watch(() => betaCommunity.visible, visible => { if (visible) copyState.value = '复制群号' })
useModalFocus(() => betaCommunity.visible, dialogEl, {
  initialFocus: () => primaryButton.value,
  onEscape: close
})
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
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
}

.community-mask {
  background: rgba(73, 59, 44, .52);
  backdrop-filter: blur(4px);
}

.community-dialog {
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--surface);
  box-shadow: 0 42px 90px -34px rgba(73, 59, 44, .5);
  color: var(--ink);
}

.community-heading p {
  color: var(--accent-strong);
}

.community-icon {
  border-radius: 13px;
  background: var(--yellow);
  color: var(--tea);
}

.community-close {
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

.community-intro {
  color: var(--ink-60);
}

.detail-label {
  color: var(--ink-60);
}

.copy-button,
.community-primary {
  border: 1px solid var(--line);
  border-radius: 12px;
  cursor: pointer;
  transition: transform .16s var(--ease), border-color .2s ease, background-color .2s ease;
}

.copy-button {
  background: var(--paper);
  color: var(--tea);
}

.copy-button:hover {
  border-color: var(--accent);
  background: var(--surface);
}

.community-note {
  border-radius: 14px;
  background: var(--paper);
  color: var(--ink-60);
}

.community-note svg {
  color: var(--tea);
}

.community-note a {
  color: var(--tea);
  text-underline-offset: 3px;
}

.community-primary {
  border-color: var(--tea);
  background: var(--tea);
  color: var(--cream);
}
.join-steps, .join-result { color: var(--ink-60); }
.join-result { color: var(--tea); }

.copy-button:active,
.community-primary:active {
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

  .community-dialog {
    border-width: 1px 0 0;
    border-radius: 24px 24px 0 0;
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
<style scoped src="./betaCommunityDialogDesktop.css"></style>
<style scoped src="./betaCommunityDialogMobile.css"></style>
