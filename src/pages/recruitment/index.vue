<template>
  <RecruitmentWorkspace v-if="enabled && hasAccess" />
  <div v-else class="page-recruitment">
    <IslandSidebar />
    <main id="main-content" class="recruitment-main" @keydown.esc="exitGuide">
      <CompactToolHeader title="招募档案" description="抽完卡，选对卡池，顺手记一笔。">
        <template v-if="enabled" #actions>
          <div class="guide-entry-wrap">
            <button ref="entry" type="button" :aria-expanded="picker" @click="picker = !picker">使用教程</button>
            <RecruitmentGuideChoice v-if="picker" @record="beginRecord" @practice="beginPractice" @close="closePicker" />
          </div>
        </template>
      </CompactToolHeader>
      <div class="wrap">
        <p v-if="!enabled">招募档案暂未开放。</p>
        <template v-else>
          <RecruitmentGuideHint v-if="recordGuide" target="access" :message="accessMessage" />
          <div data-guide-target="access" class="access-note">
            <p v-if="!identity">登录后可以记录自己的抽卡；也可以先练习，示例不会保存到账号。</p>
            <p v-else-if="recruitmentAccess.loading">正在确认招募档案权限…</p>
            <p v-else-if="recruitmentAccess.error" role="alert">权限读取失败：{{ recruitmentAccess.error }}</p>
            <p v-else>当前账号暂没有招募档案权限，可以先练习。</p>
            <router-link v-if="!identity" to="/login?redirect=/recruitment">登录并返回</router-link>
            <button v-else type="button" :disabled="recruitmentAccess.loading" @click="recruitmentAccess.refresh({ force: true })">重新确认权限</button>
            <button v-if="recordGuide" type="button" @click="beginPractice">先练习一下</button>
            <button v-if="recordGuide" type="button" @click="recordGuide = false">退出教程</button>
          </div>
        </template>
      </div>
      <SiteFooter />
    </main>
  </div>
  <RecruitmentPractice v-if="practice" @close="practice = false" />
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import CompactToolHeader from '../../components/CompactToolHeader.vue'
import RecruitmentWorkspace from './RecruitmentWorkspace.vue'
import RecruitmentGuideChoice from './RecruitmentGuideChoice.vue'
import RecruitmentGuideHint from './RecruitmentGuideHint.vue'
import RecruitmentPractice from './RecruitmentPractice.vue'
import { auth } from '../../store/auth.js'
import { recruitmentAccess } from '../../store/recruitmentAccess.js'
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
const enabled = isFeatureEnabled(FEATURE_KEYS.RECRUITMENT_ARCHIVE)
const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
const permissionChecked = ref(false)
const hasAccess = computed(() => permissionChecked.value && !!identity.value && recruitmentAccess.userId === identity.value && recruitmentAccess.canAccess)
const entry = ref(null), picker = ref(false), recordGuide = ref(false), practice = ref(false)
const accessMessage = computed(() => !identity.value ? '先登录，再使用自己的真实资料；不想登录可以先练习。' : recruitmentAccess.error ? '权限尚未确认，请重试；读取失败不代表没有记录。' : '真实记录需要招募权限；现在可以退出或先练习。')
function closePicker() { picker.value = false; nextTick(() => entry.value?.focus({ preventScroll: true })) }
function exitGuide(event) { if (picker.value || recordGuide.value) { event.preventDefault(); event.stopPropagation(); recordGuide.value = false; closePicker() } }
function beginRecord() { closePicker(); recordGuide.value = true }
function beginPractice() { closePicker(); recordGuide.value = false; practice.value = true }
watch(identity, owner => {
  picker.value = false; recordGuide.value = false; permissionChecked.value = false
  if (!enabled) return
  recruitmentAccess.setIdentity(owner)
  if (owner) void recruitmentAccess.refresh({ force: true })
}, { immediate: true, flush: 'sync' })
watch(() => recruitmentAccess.loading, loading => {
  if (!loading && recruitmentAccess.loaded && recruitmentAccess.userId === identity.value) permissionChecked.value = true
}, { immediate: true })
</script>
<style scoped>
.recruitment-main{min-width:0}.guide-entry-wrap{position:relative}.guide-entry-wrap>.guide-choice{position:absolute;right:0;top:100%;width:240px;z-index:var(--z-popover)}button,a{display:inline-flex;align-items:center;min-height:44px;padding:8px 12px;color:var(--ink);font:inherit}.guide-entry-wrap>button{border:0;background:transparent;cursor:pointer}.access-note{padding:16px 0;line-height:1.7}.access-note button{margin:8px 8px 0 0;border:1px solid var(--line);border-radius:10px;background:var(--surface);cursor:pointer}:deep([data-guide-active]){outline:2px solid var(--accent);outline-offset:4px}button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
</style>
