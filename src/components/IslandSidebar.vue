<template>
  <header class="mobile-shell">
    <router-link class="mobile-brand" to="/cart">
      <span class="brand-mark" aria-hidden="true">♥</span>
      <span>YuanHub</span>
    </router-link>
    <nav class="mobile-nav" aria-label="主要导航">
      <router-link to="/cart" :class="{ active: $route.path === '/cart' }">
        <ShoppingCart :size="19" aria-hidden="true" />
        <span>账房</span>
      </router-link>
      <router-link to="/inventory" :class="{ active: $route.path === '/inventory' }">
        <PackageOpen :size="19" aria-hidden="true" />
        <span>库存追踪</span>
      </router-link>
      <router-link to="/operator" :class="{ active: $route.path.startsWith('/operator') }">
        <BookUser :size="19" aria-hidden="true" />
        <span>我的密探</span>
      </router-link>
      <router-link v-if="isLoggedIn" to="/notifications" :class="{ active: $route.path === '/notifications' }">
        <Bell :size="19" aria-hidden="true" />
        <span>通知</span>
        <span v-if="unreadCount > 0" class="mobile-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
      </router-link>
      <router-link v-if="isLoggedIn" to="/feedback" :class="{ active: $route.path.startsWith('/feedback') }">
        <MessageSquareText :size="19" aria-hidden="true" />
        <span>反馈</span>
        <span v-if="feedbackUnreadCount > 0" class="mobile-badge">{{ feedbackUnreadCount > 99 ? '99+' : feedbackUnreadCount }}</span>
      </router-link>
      <router-link :to="isLoggedIn ? '/user/profile' : '/login'" :class="{ active: $route.path === '/user/profile' || $route.path === '/login' }">
        <component :is="isLoggedIn ? UserRound : LogIn" :size="19" aria-hidden="true" />
        <span>{{ isLoggedIn ? '我的' : '登录' }}</span>
      </router-link>
    </nav>
  </header>

  <aside class="island" aria-label="主要导航">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">H</div>
      <div class="brand-txt">
        <div class="brand-line"><span>YuanHub</span><span class="beta">Beta</span></div>
        <b>鸢鸢相抱♥️</b>
      </div>
    </div>
    <nav class="nav">
      <!-- 作业广场（暂时隐藏）：<router-link to="/" :class="{ active: $route.path === '/' }"><span class="no">01</span>作业广场</router-link> -->
      <router-link to="/operator" :class="{ active: $route.path.startsWith('/operator') }"><span class="no">01</span>我的密探</router-link>
      <router-link to="/inventory" :class="{ active: $route.path === '/inventory' }"><span class="no">02</span>库存追踪</router-link>
      <router-link to="/cart" :class="{ active: $route.path === '/cart' }"><span class="no">03</span>广陵账房</router-link>
      <div class="nav-separator" aria-hidden="true"></div>
      <template v-if="isLoggedIn">
        <router-link to="/notifications" :class="{ active: $route.path === '/notifications' }">
          通知中心
          <span v-if="unreadCount > 0" class="sidebar-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
        </router-link>
        <router-link to="/feedback" :class="{ active: $route.path.startsWith('/feedback') }">
          反馈中心
          <span v-if="feedbackUnreadCount > 0" class="sidebar-badge">{{ feedbackUnreadCount > 99 ? '99+' : feedbackUnreadCount }}</span>
        </router-link>
        <div class="nav-separator" aria-hidden="true"></div>
      </template>
      <router-link to="/user/profile" :class="{ active: $route.path === '/user/profile' }">个人中心</router-link>
      <!-- 协作看板（暂时隐藏）：
      <div class="nav-lb">协作看板 · 快捷跳转</div>
      <a class="ext" href="#" style="--cc:var(--tea)"><span class="dot"></span>出战阵容编辑器<span class="who">BWiki</span></a>
      <a class="ext" href="#" style="--cc:var(--accent)"><span class="dot"></span>操作记录仪<span class="who">辟雍学宫</span></a>
      <a class="ext" href="#" style="--cc:var(--rouge)"><span class="dot"></span>打关跟打<span class="who">YuanAssist</span></a>
      <a class="ext" href="#" style="--cc:var(--yellow-deep)"><span class="dot"></span>Box · 羁绊<span class="who">MAA</span></a>
      -->
      <!-- 站点（暂时隐藏）：
      <div class="nav-lb">站点</div>
      <a href="#"><span class="no">03</span>关于</a>
      -->
    </nav>
    <div class="island-foot">
      <template v-if="isLoggedIn">
        <router-link to="/user/profile" class="foot-user">{{ userName }}</router-link>
        <button class="foot-logout" type="button" @click="onLogout">退出</button>
      </template>
      <router-link v-else to="/login" class="foot-link">登录 / 注册</router-link><!-- · 简体中文<br>
      <a href="#">创建新作业</a><br>
      <div class="grp">作业制作者交流群<br>1055262891</div> -->
    </div>
  </aside>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Bell, BookUser, LogIn, MessageSquareText, PackageOpen, ShoppingCart, UserRound } from '@lucide/vue'
import { auth, logout as doLogout } from '@/store/auth.js'
import { listManagedFeedback } from '@/api/feedback.js'
import { getUnreadNotificationCount, NOTIFICATION_STATE_EVENT } from '@/api/notifications.js'
import { countUnreadFeedback, FEEDBACK_READ_STATE_EVENT } from '@/utils/feedbackReadState.js'

// 已登录状态（reactive，随 auth 变化）
const isLoggedIn = computed(() => (auth.accessToken && auth.userInfo) || false)
const userName = computed(() => (auth.userInfo && auth.userInfo.user_name) ? auth.userInfo.user_name : '用户')
const unreadCount = ref(0)
const feedbackUnreadCount = ref(0)
let unreadPollTimer = null
let unreadCountRequestId = 0
let feedbackUnreadRequestId = 0
let stopFeedbackAccessWatch = null

function currentUserId() {
  const user = auth.userInfo
  return user && (user.id || user.userId || user.user_id) ? String(user.id || user.userId || user.user_id) : ''
}

const canReadManagedFeedback = computed(() => Boolean(
  isLoggedIn.value &&
  auth.adminAccessLoaded &&
  !auth.adminAccessLoading &&
  auth.adminAccess &&
  (auth.adminAccess.superAdmin || (Array.isArray(auth.adminAccess.manageAreas) && auth.adminAccess.manageAreas.length > 0))
))

function onLogout() {
  // store/auth.js 的 logout() 会清空登录态并跳转 /login
  doLogout()
}

async function fetchUnreadCount() {
  const requestId = ++unreadCountRequestId
  if (!isLoggedIn.value) {
    unreadCount.value = 0
    return
  }
  try {
    const data = await getUnreadNotificationCount()
    if (requestId === unreadCountRequestId) unreadCount.value = data.count
  } catch (_) {
    // 静默失败
  }
}

async function fetchFeedbackUnreadCount() {
  const requestId = ++feedbackUnreadRequestId
  if (!canReadManagedFeedback.value) {
    feedbackUnreadCount.value = 0
    return
  }

  try {
    const reports = []
    let page = 1
    let pageSize = 100
    let total = null
    while (page <= 100) {
      const data = await listManagedFeedback({ page, pageSize })
      const items = Array.isArray(data.items) ? data.items : []
      reports.push(...items)
      total = Number.isFinite(Number(data.total)) ? Number(data.total) : null
      const returnedPageSize = Number(data.pageSize) > 0 ? Number(data.pageSize) : pageSize
      if (!items.length || (total != null && reports.length >= total) || (total == null && items.length < returnedPageSize)) break
      page += 1
      pageSize = returnedPageSize
    }
    if (requestId !== feedbackUnreadRequestId || !canReadManagedFeedback.value) return
    feedbackUnreadCount.value = countUnreadFeedback(reports, currentUserId())
  } catch (_) {
    // 反馈角标不能阻断侧栏；保留上次成功的展示。
  }
}

function handleFeedbackReadStateChange(event) {
  if (!event || !event.detail || event.detail.userId !== currentUserId()) return
  fetchFeedbackUnreadCount()
}

function startPolling() {
  fetchUnreadCount()
  unreadPollTimer = setInterval(function () {
    fetchUnreadCount()
    fetchFeedbackUnreadCount()
  }, 30000)
}

function stopPolling() {
  if (unreadPollTimer) {
    clearInterval(unreadPollTimer)
    unreadPollTimer = null
  }
}

onMounted(function () {
  stopFeedbackAccessWatch = watch(canReadManagedFeedback, function (canRead) {
    if (canRead) fetchFeedbackUnreadCount()
    else {
      feedbackUnreadRequestId += 1
      feedbackUnreadCount.value = 0
    }
  }, { immediate: true })
  if (typeof window !== 'undefined') window.addEventListener(FEEDBACK_READ_STATE_EVENT, handleFeedbackReadStateChange)
  if (typeof window !== 'undefined') window.addEventListener(NOTIFICATION_STATE_EVENT, fetchUnreadCount)
  startPolling()
})

onBeforeUnmount(function () {
  stopPolling()
  feedbackUnreadRequestId += 1
  unreadCountRequestId += 1
  if (stopFeedbackAccessWatch) stopFeedbackAccessWatch()
  if (typeof window !== 'undefined') window.removeEventListener(FEEDBACK_READ_STATE_EVENT, handleFeedbackReadStateChange)
  if (typeof window !== 'undefined') window.removeEventListener(NOTIFICATION_STATE_EVENT, fetchUnreadCount)
})
</script>

<style scoped>
.foot-user {
  color: var(--ink);
  font-weight: 800;
  margin-right: 6px;
  text-decoration: none;
  border-bottom: 0;
  cursor: pointer;
  transition: color .25s;
}
.foot-user:hover {
  color: var(--accent);
}
.foot-logout {
  background: none;
  border: none;
  padding: 0;
  margin-left: 2px;
  font-family: var(--font-b, inherit);
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-60);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
  transition: color .25s;
}
.foot-logout:hover {
  color: var(--rouge);
}
.sidebar-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  margin-left: auto;
  padding: 0 6px;
  background: var(--rouge);
  color: #fff;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}
.nav-separator {
  height: 1px;
  margin: 12px 12px;
  background: var(--line);
}
.mobile-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: var(--rouge);
  color: #fff;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
}
.mobile-nav a {
  position: relative;
}
</style>
