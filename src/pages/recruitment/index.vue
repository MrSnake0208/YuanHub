<template>
  <div class="recruitment-route">
    <!-- 与全站 RouterView 的 out-in 过渡保持兼容：路由页面必须只有一个元素根节点。 -->
    <RecruitmentWorkspace v-if="enabled && hasAccess" />
    <div v-else class="page-recruitment">
      <IslandSidebar />
      <main id="main-content" class="recruitment-main" @keydown.esc="exitGuide">
        <CompactToolHeader title="招募档案">
          <template v-if="enabled && TUTORIALS_ENABLED" #actions>
            <div class="guide-entry-wrap">
              <button ref="entry" type="button" :aria-expanded="picker" @click="picker = !picker">使用教程</button>
              <RecruitmentGuideChoice v-if="picker" @record="beginRecord" @practice="beginPractice" @close="closePicker" />
            </div>
          </template>
        </CompactToolHeader>
        <div class="wrap">
          <p v-if="!enabled">招募档案暂未开放。</p>
          <template v-else>
            <RecruitmentGuideHint v-if="TUTORIALS_ENABLED && recordGuide" target="access" :message="accessMessage" />
            <div data-guide-target="access" class="access-note">
              <p v-if="!identity">登录后可以记录自己的抽卡。<template v-if="TUTORIALS_ENABLED">也可以先练习，示例不会保存到账号。</template></p>
              <router-link v-if="!identity" to="/login?redirect=/recruitment">登录并返回</router-link>
              <button v-if="TUTORIALS_ENABLED && recordGuide" type="button" @click="beginPractice">先练习一下</button>
              <button v-if="TUTORIALS_ENABLED && recordGuide" type="button" @click="recordGuide = false">退出教程</button>
            </div>
          </template>
        </div>
        <SiteFooter />
      </main>
    </div>
    <RecruitmentPractice v-if="TUTORIALS_ENABLED && practice" @close="practice = false" />
  </div>
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
import { FEATURE_KEYS, isFeatureEnabled, TUTORIALS_ENABLED } from '../../config/features.js'
const enabled = isFeatureEnabled(FEATURE_KEYS.RECRUITMENT_ARCHIVE)
const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
const hasAccess = computed(() => !!identity.value)
const entry = ref(null), picker = ref(false), recordGuide = ref(false), practice = ref(false)
const accessMessage = '先登录并取得内测资格，再使用自己的真实资料；也可以先练习。'
function closePicker() { picker.value = false; nextTick(() => entry.value?.focus({ preventScroll: true })) }
function exitGuide(event) { if (picker.value || recordGuide.value) { event.preventDefault(); event.stopPropagation(); recordGuide.value = false; closePicker() } }
function beginRecord() { if (!TUTORIALS_ENABLED) return; closePicker(); recordGuide.value = true }
function beginPractice() { if (!TUTORIALS_ENABLED) return; closePicker(); recordGuide.value = false; practice.value = true }
watch(identity, () => { picker.value = false; recordGuide.value = false }, { flush: 'sync' })
</script>
<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
button,a{color:var(--ink)}.guide-entry-wrap>button{border:0;background:transparent;cursor:pointer}.access-note button{border:1px solid var(--line);border-radius:10px;background:var(--surface);cursor:pointer}:deep([data-guide-active]){outline:2px solid var(--theme-focus, var(--accent));outline-offset:4px}button:focus-visible,a:focus-visible{outline:2px solid var(--theme-focus, var(--accent));outline-offset:3px}
</style>
<style scoped src="./recruitmentRouteDesktop.css"></style>
<style scoped src="./recruitmentRouteMobile.css"></style>
