<template>
  <MobileHeader>
    <router-link class="mobile-brand" to="/" aria-label="返回首页">
      <img class="brand-mark" src="/brand/yuanhub-logo.png" alt="" aria-hidden="true" />
      <span>YuanHub</span>
    </router-link>
    <nav class="mobile-nav" aria-label="主要导航">
      <router-link to="/beta" :class="{ active: $route.path === '/beta' }"><span>内测</span></router-link>
      <router-link
        to="/"
        :class="{ active: $route.path === '/' || $route.path === '/today' }"
      >
        <House :size="19" aria-hidden="true" />
        <span>今日一览</span>
      </router-link>
      <router-link
        to="/operator"
        :class="{ active: $route.path.startsWith('/operator') && !$route.path.startsWith('/operator/share') }"
      >
        <BookUser :size="19" aria-hidden="true" />
        <span>密探</span>
      </router-link>
      <router-link
        to="/inventory"
        :class="{ active: $route.path === '/inventory' }"
      >
        <PackageOpen :size="19" aria-hidden="true" />
        <span>库存</span>
      </router-link>
      <router-link to="/star" :class="{ active: $route.path === '/star' }">
        <Gem :size="19" aria-hidden="true" />
        <span>星石</span>
      </router-link>
      <router-link
        :to="isLoggedIn ? '/user/profile' : '/login'"
        :class="{
          active: $route.path === '/user/profile' || $route.path === '/login',
        }"
      >
        <component
          :is="isLoggedIn ? UserRound : LogIn"
          :size="19"
          aria-hidden="true"
        />
        <span>{{ isLoggedIn ? "账号" : "登录" }}</span>
      </router-link>
      <router-link to="/cart" :class="{ active: $route.path === '/cart' }">
        <ShoppingCart :size="19" aria-hidden="true" />
        <span>账房</span>
      </router-link>
      <router-link to="/changelog" :class="{ active: $route.path === '/changelog' }">
        <ScrollText :size="19" aria-hidden="true" />
        <span>更新</span>
      </router-link>
      <router-link
        v-if="isLoggedIn"
        to="/notifications"
        :class="{ active: $route.path === '/notifications' }"
      >
        <Bell :size="19" aria-hidden="true" />
        <span>通知</span>
        <span v-if="unreadCount > 0" class="mobile-badge">{{
          unreadCount > 99 ? "99+" : unreadCount
        }}</span>
      </router-link>
      <router-link
        v-if="isLoggedIn"
        to="/feedback"
        :class="{ active: $route.path.startsWith('/feedback') }"
      >
        <MessageSquareText :size="19" aria-hidden="true" />
        <span>反馈</span>
        <span v-if="feedbackUnreadState.count > 0" class="mobile-badge">{{
          feedbackUnreadState.count > 99 ? "99+" : feedbackUnreadState.count
        }}</span>
      </router-link>
      <router-link
        to="/co-creation"
        :class="{ active: $route.path.startsWith('/co-creation') }"
      >
        <Lightbulb :size="19" aria-hidden="true" />
        <span>共创</span>
      </router-link>
      <button
        v-if="showBetaCommunityEntry"
        type="button"
        class="mobile-tour-trigger mobile-community-trigger"
        @click="openBetaCommunity"
      >
        <UsersRound :size="19" aria-hidden="true" />
        <span>交流群</span>
      </button>
      <router-link to="/install" :class="{ active: $route.path === '/install' }">
        <Download :size="19" aria-hidden="true" />
        <span>桌面</span>
      </router-link>
      <button
        type="button"
        class="mobile-tour-trigger"
        data-tour="replay-entry"
        @click="restartTutorial"
      >
        <CircleHelp :size="19" aria-hidden="true" />
        <span>教程</span>
      </button>
    </nav>
  </MobileHeader>

  <aside class="island" aria-label="主要导航">
    <router-link class="beta-entry" to="/beta">参与内测 / 查看资格 →</router-link>
    <router-link class="brand" to="/" aria-label="返回首页">
      <img class="brand-mark" src="/brand/yuanhub-logo.png" alt="" aria-hidden="true" />
      <div class="brand-txt">
        <div class="brand-line">
          <span>YuanHub</span><span class="beta">Beta</span>
        </div>
        <b>鸢鸢相抱♥️</b>
      </div>
    </router-link>
    <nav class="nav">
      <router-link
        to="/"
        :class="{ active: $route.path === '/' || $route.path === '/today' }"
        ><span class="no">00</span>今日一览</router-link
      >
      <router-link
        to="/operator"
        :class="{ active: $route.path.startsWith('/operator') && !$route.path.startsWith('/operator/share') }"
        ><span class="no">01</span>密探名册</router-link
      >
      <router-link
        to="/inventory"
        :class="{ active: $route.path === '/inventory' }"
        ><span class="no">02</span>库存追踪</router-link
      >
      <router-link to="/star" :class="{ active: $route.path === '/star' }"
        ><span class="no">03</span>星石背包</router-link
      >
      <router-link to="/cart" :class="{ active: $route.path === '/cart' }"
        ><span class="no">04</span>广陵账房</router-link
      >
      <div class="nav-separator" aria-hidden="true"></div>
      <template v-if="isLoggedIn">
        <router-link
          to="/notifications"
          :class="{ active: $route.path === '/notifications' }"
        >
          通知中心
          <span v-if="unreadCount > 0" class="sidebar-badge">{{
            unreadCount > 99 ? "99+" : unreadCount
          }}</span>
        </router-link>
        <router-link
          to="/feedback"
          :class="{ active: $route.path.startsWith('/feedback') }"
        >
          反馈中心
          <span v-if="feedbackUnreadState.count > 0" class="sidebar-badge">{{
            feedbackUnreadState.count > 99 ? "99+" : feedbackUnreadState.count
          }}</span>
        </router-link>
        <button
          v-if="showBetaCommunityEntry"
          type="button"
          class="nav-community"
          @click="openBetaCommunity"
        >
          <span>内测交流群</span>
          <UsersRound :size="16" aria-hidden="true" />
        </button>
        <div class="nav-separator" aria-hidden="true"></div>
      </template>

      <router-link
        to="/co-creation"
        :class="{ active: $route.path.startsWith('/co-creation') }"
        >共创中心</router-link
      >
      <router-link
        to="/user/profile"
        :class="{ active: $route.path === '/user/profile' }"
        >账号与连接码</router-link
      >
      <router-link to="/changelog" :class="{ active: $route.path === '/changelog' }"
        >YuanHub 更新日志</router-link
      >
      <!-- 协作看板（暂时隐藏）：
      <div class="nav-lb">协作看板 · 快捷跳转</div>
      <a class="ext" href="#" style="--cc:var(--tea)"><span class="dot"></span>出战阵容编辑器<span class="who">BWiki</span></a>
      <a class="ext" href="#" style="--cc:var(--accent)"><span class="dot"></span>操作记录仪<span class="who">辟雍学府</span></a>
      <a class="ext" href="#" style="--cc:var(--rouge)"><span class="dot"></span>打关跟打<span class="who">YuanAssist</span></a>
      <a class="ext" href="#" style="--cc:var(--yellow-deep)"><span class="dot"></span>Box · 羁绊<span class="who">MAA</span></a>
      -->
      <!-- 站点（暂时隐藏）：
      <div class="nav-lb">站点</div>
      <a href="#"><span class="no">03</span>关于</a>
      -->
    </nav>
    <div class="island-foot">
      <button
        type="button"
        class="foot-tour"
        data-tour="replay-entry"
        @click="restartTutorial"
      >
        <CircleHelp :size="14" aria-hidden="true" />重新查看新手教程
      </button>
      <template v-if="isLoggedIn">
        <router-link to="/user/profile" class="foot-user">{{
          userName
        }}</router-link>
        <button class="foot-logout" type="button" @click="onLogout">
          退出
        </button>
      </template>
      <router-link v-else to="/login" class="foot-link">登录 / 注册</router-link
      ><!-- · 简体中文<br>
      <a href="#">创建新作业</a><br>
      <div class="grp">作业制作者交流群<br>1055262891</div> -->
      <router-link
        to="/changelog"
        class="foot-version"
        :title="buildInfoLine"
        :aria-label="'YuanHub ' + productVersionLabel + '，查看更新日志'"
        >YuanHub {{ productVersionLabel }}</router-link
      >
    </div>
  </aside>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import MobileHeader from "./MobileHeader.vue";
import {
  Bell,
  BookUser,
  CircleHelp,
  Download,
  Gem,
  House,
  Lightbulb,
  LogIn,
  MessageSquareText,
  PackageOpen,
  ScrollText,
  ShoppingCart,
  UsersRound,
  UserRound,
} from "@lucide/vue";
import { auth, logout as doLogout } from "@/store/auth.js";
import { beta } from "@/store/beta.js";
import { betaCommunity } from "@/store/betaCommunity.js";
import { useRouter } from "vue-router";
import { restartOnboardingTour } from "@/utils/onboardingTour.js";
import { formatBuildInfo, productVersionLabel } from "@/config/buildInfo.js";
import {
  getUnreadNotificationCount,
  NOTIFICATION_STATE_EVENT,
} from "@/api/notifications.js";
import {
  feedbackUnreadState,
  subscribeFeedbackUnread,
} from "@/store/feedbackUnread.js";

// 已登录状态（reactive，随 auth 变化）
const isLoggedIn = computed(() => (auth.accessToken && auth.userInfo) || false);
const showBetaCommunityEntry = computed(
  () =>
    !!isLoggedIn.value &&
    beta.campaign?.accessMode === "BETA" &&
    beta.mine?.canUseBetaFeatures === true &&
    (auth.isAdmin || beta.mine?.enrollmentStatus === "ACTIVE"),
);
const userName = computed(() =>
  auth.userInfo && auth.userInfo.user_name ? auth.userInfo.user_name : "用户",
);
// 次级区域的低干扰版本入口：完整诊断信息只放在 title 里，不占用主导航层级。
const buildInfoLine = computed(() => formatBuildInfo() + " · 查看更新日志");
const unreadCount = ref(0);
const router = useRouter();
let unreadPollTimer = null;
let unreadCountRequestId = 0;
let stopFeedbackUnread = null;

function onLogout() {
  // store/auth.js 的 logout() 会清空登录态并跳转 /login
  doLogout();
}

function restartTutorial() {
  void restartOnboardingTour(router);
}

function openBetaCommunity() {
  betaCommunity.open("manual");
}

async function fetchUnreadCount() {
  const requestId = ++unreadCountRequestId;
  if (!isLoggedIn.value) {
    unreadCount.value = 0;
    return;
  }
  try {
    const data = await getUnreadNotificationCount();
    if (requestId === unreadCountRequestId) unreadCount.value = data.count;
  } catch (_) {
    // 静默失败
  }
}

function startPolling() {
  fetchUnreadCount();
  unreadPollTimer = setInterval(function () {
    fetchUnreadCount();
  }, 30000);
}

function stopPolling() {
  if (unreadPollTimer) {
    clearInterval(unreadPollTimer);
    unreadPollTimer = null;
  }
}

onMounted(function () {
  stopFeedbackUnread = subscribeFeedbackUnread();
  if (typeof window !== "undefined")
    window.addEventListener(NOTIFICATION_STATE_EVENT, fetchUnreadCount);
  startPolling();
});

onBeforeUnmount(function () {
  stopPolling();
  unreadCountRequestId += 1;
  if (stopFeedbackUnread) stopFeedbackUnread();
  if (typeof window !== "undefined")
    window.removeEventListener(NOTIFICATION_STATE_EVENT, fetchUnreadCount);
});
</script>

<style scoped>
.beta-entry { display: block; margin: 4px 10px 12px; font-size: 12px; color: var(--tea); text-underline-offset: 4px; }
.foot-user {
  color: var(--ink);
  font-weight: 800;
  margin-right: 6px;
  text-decoration: none;
  border-bottom: 0;
  cursor: pointer;
  transition: color 0.25s;
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
  transition: color 0.25s;
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
.nav-community {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--ink-60);
  font-family: var(--font-b);
  font-size: 14px;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
  transition: color .35s var(--ease), background-color .35s var(--ease);
}
.nav-community svg {
  margin-left: auto;
  color: var(--tea);
}
.nav-community::before {
  content: "";
  position: absolute;
  left: -14px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--yellow-deep);
  transform: translateY(-50%) scale(0);
  transition: transform .4s var(--ease);
}
.nav-community:hover {
  color: var(--ink);
  background: rgba(232, 193, 91, .22);
}
.nav-community:hover::before {
  transform: translateY(-50%) scale(1);
}
.nav-community:focus-visible {
  outline: 2px solid var(--brand-blue);
  outline-offset: 2px;
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
.mobile-tour-trigger {
  position: relative;
  flex: 0 0 68px;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px 6px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--ink-60);
  font-family: var(--font-b);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.1;
  cursor: pointer;
}
.mobile-tour-trigger:hover {
  background: var(--yellow);
  color: var(--ink);
}
.foot-tour {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 9px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink-60);
  font-family: var(--font-b);
  font-size: 11px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.foot-tour:hover {
  color: var(--accent);
}
/* 次级区域版本入口：低干扰、单行、可聚焦；移动端侧栏本身不渲染。 */
.foot-version {
  display: block;
  margin-top: 10px;
  color: var(--ink-60);
  font-family: var(--font-d);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .02em;
  line-height: 1.6;
  white-space: nowrap;
  border-bottom: 0;
  transition: color .25s var(--ease);
}
.foot-version:hover {
  color: var(--accent);
}
.foot-version:focus-visible {
  outline: 2px solid var(--brand-blue);
  outline-offset: 2px;
  border-radius: 4px;
}
@media (max-width: 480px) {
  .mobile-tour-trigger {
    flex-basis: 62px;
    min-width: 0;
    padding-inline: 2px;
  }
}
</style>
