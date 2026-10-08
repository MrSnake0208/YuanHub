<template>
  <MobileHeader :pinned="menuOpen" @keydown.esc.prevent="closeMenu">
    <button
      ref="menuToggle"
      class="mobile-menu-button"
      type="button"
      data-tour="replay-menu"
      aria-controls="mobile-main-nav"
      :aria-expanded="menuOpen"
      :aria-label="menuOpen ? '关闭导航' : '打开导航'"
      @click="toggleMenu"
    >
      <Menu :size="21" aria-hidden="true" />
    </button>

    <div class="mobile-page-context" aria-live="polite">
      <span class="mobile-page-title">{{ mobileTitle }}</span>
    </div>

    <router-link
      v-if="isLoggedIn"
      class="mobile-header-action"
      :class="{ active: $route.path === '/notifications' }"
      to="/notifications"
      :aria-label="unreadCount > 0 ? `通知，${unreadCount > 99 ? '99+' : unreadCount} 条未读` : '通知'"
    >
      <Bell :size="20" aria-hidden="true" />
      <span v-if="unreadCount > 0" class="mobile-header-badge">{{
        unreadCount > 99 ? "99+" : unreadCount
      }}</span>
    </router-link>
    <router-link v-else class="mobile-header-action" to="/login" aria-label="登录">
      <LogIn :size="20" aria-hidden="true" />
    </router-link>
  </MobileHeader>

  <Transition name="mobile-drawer">
    <div
      v-if="menuOpen"
      class="mobile-drawer-layer"
      @keydown.esc.stop.prevent="closeMenu"
    >
      <div class="mobile-drawer-scrim" aria-hidden="true" @click="closeMenu"></div>
      <aside
        id="mobile-main-nav"
        ref="menuPanel"
        class="mobile-drawer"
        aria-label="YuanHub 导航"
        tabindex="-1"
      >
        <header class="mobile-drawer-head">
          <router-link class="mobile-drawer-brand" to="/" aria-label="返回 YuanHub 首页">
            <img class="brand-mark" src="/brand/yuanhub-logo.png" alt="" aria-hidden="true" />
            <span><strong>YuanHub</strong><small>鸢鸢相抱 · Beta</small></span>
          </router-link>
          <button class="mobile-drawer-close" type="button" aria-label="关闭导航" @click="closeMenu">
            <X :size="20" aria-hidden="true" />
          </button>
        </header>

        <nav class="mobile-drawer-nav" aria-label="全部导航">
          <section class="mobile-drawer-section">
            <router-link to="/" :class="{ active: $route.path === '/' || $route.path === '/today' }">
              <House :size="20" aria-hidden="true" /><span>今日一览</span>
            </router-link>
            <router-link
              to="/operator"
              :class="{ active: !managementActive && $route.path.startsWith('/operator') && !$route.path.startsWith('/operator/share') }"
            >
              <BookUser :size="20" aria-hidden="true" /><span>密探名册</span>
            </router-link>
            <router-link v-if="showRecruitment" to="/recruitment" :class="{ active: $route.path === '/recruitment' }">
              <ScrollText :size="20" aria-hidden="true" /><span>招募档案</span>
            </router-link>
            <router-link to="/inventory" :class="{ active: $route.path === '/inventory' }">
              <PackageOpen :size="20" aria-hidden="true" /><span>库存追踪</span>
            </router-link>
            <router-link to="/star" :class="{ active: $route.path === '/star' }">
              <Gem :size="20" aria-hidden="true" /><span>星石背包</span>
            </router-link>
            <router-link to="/cart" :class="{ active: $route.path === '/cart' }">
              <ShoppingCart :size="20" aria-hidden="true" /><span>广陵账房</span>
            </router-link>
            <router-link v-if="showCalendar" class="calendar-nav-link" to="/calendar" :class="{ active: !managementActive && $route.path.startsWith('/calendar') }">
              <CalendarDays :size="20" aria-hidden="true" /><span>活动日历</span>
            </router-link>
          </section>

          <details class="mobile-more">
            <summary class="mobile-drawer-link" :class="{ active: moreActive }" aria-controls="mobile-service-nav" :aria-label="moreLabel">
              <MoreHorizontal :size="20" aria-hidden="true" /><span>更多</span>
              <span v-if="isLoggedIn && feedbackUnreadState.count > 0" class="more-feedback-badge">{{ feedbackUnreadState.count > 99 ? "99+" : feedbackUnreadState.count }}</span>
              <ChevronDown :size="16" class="more-chevron" aria-hidden="true" />
            </summary>
            <div id="mobile-service-nav" class="mobile-drawer-section" aria-label="YuanHub 服务">
              <router-link v-if="isLoggedIn" to="/feedback" :class="{ active: !managementActive && $route.path.startsWith('/feedback') }">
                <MessageSquareText :size="20" aria-hidden="true" /><span>反馈中心</span>
                <span v-if="feedbackUnreadState.count > 0" class="more-feedback-badge">{{ feedbackUnreadState.count > 99 ? "99+" : feedbackUnreadState.count }}</span>
              </router-link>
              <router-link v-else to="/feedback/plaza" :class="{ active: !managementActive && $route.path.startsWith('/feedback') }">
                <MessageSquareText :size="20" aria-hidden="true" /><span>反馈中心</span>
              </router-link>
              <router-link to="/co-creation" :class="{ active: !managementActive && $route.path.startsWith('/co-creation') }">
                <Lightbulb :size="20" aria-hidden="true" /><span>大饼中心</span>
              </router-link>
              <router-link to="/changelog" :class="{ active: $route.path === '/changelog' }">
                <ScrollText :size="20" aria-hidden="true" /><span>更新日志</span>
              </router-link>
              <router-link to="/beta" :class="{ active: $route.path === '/beta' }">
                <Ticket :size="20" aria-hidden="true" /><span>参与内测</span>
              </router-link>
              <router-link to="/install" :class="{ active: $route.path === '/install' }">
                <Download :size="20" aria-hidden="true" /><span>安装到桌面</span>
              </router-link>
              <button v-if="showBetaCommunityEntry" type="button" class="mobile-drawer-link" @click="openBetaCommunity">
                <UsersRound :size="20" aria-hidden="true" /><span>内测交流群</span>
              </button>
              <button type="button" class="mobile-drawer-link" @click="restartTutorial">
                <CircleHelp :size="20" aria-hidden="true" /><span>实操教程</span>
              </button>
            </div>
          </details>
          <section v-if="showManagement" class="mobile-drawer-section mobile-management">
            <router-link to="/manage" :class="{ active: managementActive }" :aria-current="managementActive ? 'page' : undefined">
              <LayoutDashboard :size="20" aria-hidden="true" /><span>管理工作台</span>
            </router-link>
          </section>
        </nav>

        <footer class="mobile-drawer-foot">
          <router-link
            class="mobile-account-link"
            :to="isLoggedIn ? '/user/profile' : '/login'"
          >
            <component :is="isLoggedIn ? UserRound : LogIn" :size="20" aria-hidden="true" />
            <span>
              <strong>{{ isLoggedIn ? userName : "登录 / 注册" }}</strong>
              <small>{{ isLoggedIn ? "账号与连接码" : "同步并管理你的数据" }}</small>
            </span>
          </router-link>
          <button
            v-if="isLoggedIn"
            type="button"
            class="mobile-drawer-logout"
            @click="onLogout"
          >
            <LogOut :size="18" aria-hidden="true" /><span>退出</span>
          </button>
        </footer>
      </aside>
    </div>
  </Transition>

  <aside class="island" aria-label="主要导航">
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
        :class="{ active: !managementActive && $route.path.startsWith('/operator') && !$route.path.startsWith('/operator/share') }"
        ><span class="no">01</span>密探名册</router-link
      >
      <router-link v-if="showRecruitment" to="/recruitment" :class="{ active: $route.path === '/recruitment' }"
        ><span class="no">02</span>招募档案</router-link>
      <router-link
        to="/inventory"
        :class="{ active: $route.path === '/inventory' }"
        ><span class="no">{{ showRecruitment ? '03' : '02' }}</span>库存追踪</router-link
      >
      <router-link to="/star" :class="{ active: $route.path === '/star' }"
        ><span class="no">{{ showRecruitment ? '04' : '03' }}</span>星石背包</router-link
      >
      <router-link to="/cart" :class="{ active: $route.path === '/cart' }"
        ><span class="no">{{ showRecruitment ? '05' : '04' }}</span>广陵账房</router-link
      >
      <router-link v-if="showCalendar" class="calendar-nav-link" to="/calendar" :class="{ active: !managementActive && $route.path.startsWith('/calendar') }">
        <CalendarDays :size="18" aria-hidden="true" />活动日历
      </router-link>
      <router-link v-if="showManagement" class="management-nav-link" to="/manage" :class="{ active: managementActive }" :aria-current="managementActive ? 'page' : undefined">管理工作台</router-link>
    </nav>
    <div class="island-foot">
      <details ref="desktopMore" class="sidebar-more" @keydown.esc.stop.prevent="closeDesktopMore(true)" @focusout="onDesktopMoreFocusOut">
        <summary class="sidebar-more-trigger" :class="{ active: moreActive }" data-tour="replay-entry" aria-controls="desktop-service-nav" :aria-label="moreLabel">
          <MoreHorizontal :size="18" aria-hidden="true" /><span>更多</span>
          <span v-if="isLoggedIn && feedbackUnreadState.count > 0" class="more-feedback-badge">{{ feedbackUnreadState.count > 99 ? "99+" : feedbackUnreadState.count }}</span>
          <ChevronDown :size="16" class="more-chevron" aria-hidden="true" />
        </summary>
        <nav id="desktop-service-nav" class="sidebar-more-panel" aria-label="YuanHub 服务">
          <router-link v-if="isLoggedIn" to="/feedback" :class="{ active: !managementActive && $route.path.startsWith('/feedback') }">
            <MessageSquareText :size="18" aria-hidden="true" /><span>反馈中心</span>
            <span v-if="feedbackUnreadState.count > 0" class="more-feedback-badge">{{ feedbackUnreadState.count > 99 ? "99+" : feedbackUnreadState.count }}</span>
          </router-link>
          <router-link v-else to="/feedback/plaza" :class="{ active: !managementActive && $route.path.startsWith('/feedback') }">
            <MessageSquareText :size="18" aria-hidden="true" /><span>反馈中心</span>
          </router-link>
          <router-link to="/co-creation" :class="{ active: !managementActive && $route.path.startsWith('/co-creation') }">
            <Lightbulb :size="18" aria-hidden="true" /><span>大饼中心</span>
          </router-link>
          <router-link to="/changelog" :class="{ active: $route.path === '/changelog' }">
            <ScrollText :size="18" aria-hidden="true" /><span>更新日志</span>
          </router-link>
          <router-link to="/beta" :class="{ active: $route.path === '/beta' }">
            <Ticket :size="18" aria-hidden="true" /><span>参与内测</span>
          </router-link>
          <router-link to="/install" :class="{ active: $route.path === '/install' }">
            <Download :size="18" aria-hidden="true" /><span>安装到桌面</span>
          </router-link>
          <button v-if="showBetaCommunityEntry" type="button" @click="openBetaCommunity">
            <UsersRound :size="18" aria-hidden="true" /><span>内测交流群</span>
          </button>
          <button type="button" @click="restartTutorial">
            <CircleHelp :size="18" aria-hidden="true" /><span>实操教程</span>
          </button>
        </nav>
      </details>
      <div class="sidebar-utilities">
        <router-link class="sidebar-account" :to="isLoggedIn ? '/user/profile' : '/login'">
          <strong>{{ isLoggedIn ? userName : "登录 / 注册" }}</strong>
          <small>{{ isLoggedIn ? "账号与连接码" : "同步你的游戏数据" }}</small>
        </router-link>
        <router-link v-if="isLoggedIn" class="sidebar-notifications" to="/notifications" :class="{ active: $route.path === '/notifications' }" :aria-label="unreadCount > 0 ? `通知，${unreadCount > 99 ? '99+' : unreadCount} 条未读` : '通知'">
          <Bell :size="20" aria-hidden="true" />
          <span v-if="unreadCount > 0" class="sidebar-badge">{{ unreadCount > 99 ? "99+" : unreadCount }}</span>
        </router-link>
        <button v-if="isLoggedIn" class="foot-logout" type="button" @click="onLogout" aria-label="退出登录"><LogOut :size="18" aria-hidden="true" /></button>
      </div>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import MobileHeader from "./MobileHeader.vue";
import {
  Bell,
  BookUser,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Download,
  Gem,
  House,
  LayoutDashboard,
  Lightbulb,
  LogIn,
  LogOut,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PackageOpen,
  ScrollText,
  ShoppingCart,
  Ticket,
  UsersRound,
  UserRound,
  X,
} from "@lucide/vue";
import { auth, logout as doLogout } from "@/store/auth.js";
import { hasManagementCapability, isManagementRoute } from "@/utils/adminTools.js";
import { beta } from "@/store/beta.js";
import { recruitmentAccess } from "@/store/recruitmentAccess.js";
import { FEATURE_KEYS, isFeatureEnabled } from "@/config/features.js";
import { betaCommunity } from "@/store/betaCommunity.js";
import { useRoute, useRouter } from "vue-router";
import { dialog } from "@/utils/dialog.js";
import { restartOnboardingTour } from "@/utils/onboardingTour.js";
import { useModalFocus } from "@/composables/useModalFocus.js";
import { formatBuildInfo, productVersionLabel } from "@/config/buildInfo.js";
import { notificationUnreadState } from "@/store/notificationUnread.js";
import {
  feedbackUnreadState,
  subscribeFeedbackUnread,
} from "@/store/feedbackUnread.js";

// 已登录状态（reactive，随 auth 变化）
const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : "");
const isLoggedIn = computed(() => (auth.accessToken && auth.userInfo) || false);
const showManagement = computed(() =>
  !!isLoggedIn.value &&
  auth.adminAccessLoaded &&
  !auth.adminAccessLoading &&
  !auth.adminAccessError &&
  hasManagementCapability(auth.adminAccess),
);
const showCalendar = computed(() =>
  isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR) && !!isLoggedIn.value && auth.isAdmin,
);
const showRecruitment = computed(() =>
  isFeatureEnabled(FEATURE_KEYS.RECRUITMENT_ARCHIVE) &&
  !!isLoggedIn.value &&
  recruitmentAccess.canAccess,
);
watch(identity, (userId) => {
  recruitmentAccess.setIdentity(userId);
  if (userId) void recruitmentAccess.refresh();
}, { immediate: true });
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
const unreadCount = computed(() => notificationUnreadState.count);
const router = useRouter();
const route = useRoute();
const managementActive = computed(() => isManagementRoute(route.path));
const moreActive = computed(() => !managementActive.value && (
  route.path.startsWith("/feedback") || route.path.startsWith("/co-creation") ||
  ["/beta", "/changelog", "/install"].includes(route.path)
));
const moreLabel = computed(() => isLoggedIn.value && feedbackUnreadState.count > 0
  ? `更多，${feedbackUnreadState.count > 99 ? "99+" : feedbackUnreadState.count} 条反馈未读` : "更多");
const desktopMore = ref(null);
const menuOpen = ref(false);
const menuToggle = ref(null);
const menuPanel = ref(null);
useModalFocus(menuOpen, menuPanel, { initialFocus: () => menuPanel.value, onEscape: closeMenu });
const mobileTitle = computed(() => route.meta?.title?.split(" — ")[0] || "YuanHub");

watch(() => route.fullPath, () => {
  menuOpen.value = false;
  closeDesktopMore();
});
watch(menuOpen, (open) => {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("mobile-nav-open", open);
});
let stopFeedbackUnread = null;

async function onLogout() {
  const confirmed = await dialog.confirm({ title: '退出登录？', message: '退出后需要重新登录才能访问个人数据。', confirmText: '退出登录' });
  if (confirmed) await doLogout('/login?loggedOut=1');
}

function toggleMenu() {
  if (menuOpen.value) {
    menuOpen.value = false;
    return;
  }
  menuOpen.value = true;
  void nextTick(() => menuPanel.value?.focus());
}

function closeMenu() {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  void nextTick(() => menuToggle.value?.focus());
}

function closeDesktopMore(restoreFocus = false) {
  const details = desktopMore.value;
  if (!details?.open) return;
  details.open = false;
  if (restoreFocus) details.querySelector("summary")?.focus();
}

function onOutsideClick(event) {
  if (!desktopMore.value?.contains(event.target)) closeDesktopMore();
}

function onDesktopMoreFocusOut(event) {
  if (event.relatedTarget && !desktopMore.value?.contains(event.relatedTarget)) closeDesktopMore();
}

function restartTutorial() {
  closeDesktopMore();
  menuOpen.value = false;
  void restartOnboardingTour(router);
}

function openBetaCommunity() {
  closeDesktopMore();
  menuOpen.value = false;
  betaCommunity.open("manual");
}

onMounted(function () {
  stopFeedbackUnread = subscribeFeedbackUnread();
  document.addEventListener("click", onOutsideClick);
});

onBeforeUnmount(function () {
  if (stopFeedbackUnread) stopFeedbackUnread();
  document.removeEventListener("click", onOutsideClick);
  document.body.classList.remove("mobile-nav-open");
});
</script>

<style scoped>
.nav .calendar-nav-link { align-items: center; }
.nav > a { flex-shrink: 0; min-height: 44px; }
.management-nav-link { margin-top: 12px; }
.island-foot { position: relative; }
.sidebar-more-trigger {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
  border-radius: 10px;
  color: var(--ink-60);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  list-style: none;
}
summary::-webkit-details-marker { display: none; }
.more-chevron { margin-left: auto; flex: none; }
details[open] > summary .more-chevron { transform: rotate(180deg); }
.sidebar-more-trigger:hover,
.sidebar-more-trigger.active { background: var(--yellow); color: var(--ink); }
.sidebar-more-panel {
  position: absolute;
  bottom: calc(100% + 8px);
  left: -12px;
  right: -12px;
  display: grid;
  max-height: min(420px, calc(100dvh - 180px));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 12px 32px -12px rgba(73, 59, 44, .3);
}
.sidebar-more-panel > a,
.sidebar-more-panel > button {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--ink-60);
  font: 700 13px/1.3 var(--font-b);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.sidebar-more-panel svg { flex: none; }
.sidebar-more-panel > a:hover,
.sidebar-more-panel > a.active,
.sidebar-more-panel > button:hover { background: var(--yellow); color: var(--ink); }
.more-feedback-badge {
  display: inline-flex;
  min-width: 21px;
  height: 21px;
  margin-left: auto;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--rouge);
  color: #fff;
  font: 900 10px/1 var(--font-b);
}
.sidebar-utilities { display: flex; align-items: center; gap: 4px; }
.sidebar-utilities .sidebar-account {
  display: flex;
  min-width: 0;
  min-height: 44px;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  border: 0;
  line-height: 1.35;
}
.sidebar-account strong,
.sidebar-account small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-account strong { font-size: 12px; }
.sidebar-account small { color: var(--ink-60); font-size: 10px; }
.sidebar-utilities .sidebar-notifications {
  position: relative;
  display: inline-flex;
  width: 44px;
  height: 44px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
}
.sidebar-notifications.active,
.sidebar-notifications:hover { background: var(--yellow); }
.sidebar-notifications .sidebar-badge { position: absolute; top: 0; right: 0; margin: 0; }
:where(.sidebar-more-trigger, .sidebar-more-panel > a, .sidebar-more-panel > button, .sidebar-account, .sidebar-notifications, .foot-logout, .mobile-more > summary):focus-visible {
  outline: 2px solid var(--brand-blue);
  outline-offset: 2px;
}
.foot-logout {
  background: none;
  border: none;
  display: inline-flex;
  width: 44px;
  min-height: 44px;
  flex: none;
  align-items: center;
  justify-content: center;
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
.mobile-menu-button,
.mobile-header-action,
.mobile-drawer-layer {
  display: none;
}

@media (max-width: 1080px) {
  .mobile-menu-button,
  .mobile-header-action {
    position: relative;
    display: inline-flex;
    width: 44px;
    min-width: 44px;
    height: 44px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 12px;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    text-decoration: none;
  }
  .mobile-menu-button:hover,
  .mobile-header-action:hover,
  .mobile-header-action.active {
    border-color: var(--line);
    background: var(--surface);
    color: var(--accent-strong);
  }
  .mobile-page-context {
    min-width: 0;
    flex: 1;
    padding: 0 6px;
    text-align: center;
  }
  .mobile-page-title {
    display: block;
    overflow: hidden;
    color: var(--ink);
    font-family: var(--font-s);
    font-size: 15px;
    font-weight: 900;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-header-badge {
    position: absolute;
    top: 3px;
    right: 1px;
    display: inline-flex;
    min-width: 17px;
    height: 17px;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    border: 2px solid var(--cream);
    border-radius: 999px;
    background: var(--rouge);
    color: #fff;
    font-size: 8px;
    font-weight: 900;
    line-height: 1;
  }
  .mobile-drawer-layer {
    position: fixed;
    z-index: var(--z-overlay);
    inset: 0;
    display: block;
  }
  .mobile-drawer-scrim {
    position: absolute;
    inset: 0;
    background: rgba(73, 59, 44, .34);
    backdrop-filter: blur(2px);
  }
  .mobile-drawer {
    position: absolute;
    z-index: 1;
    top: 0;
    bottom: 0;
    left: 0;
    display: flex;
    width: min(348px, 90vw);
    min-width: 0;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--line);
    background: var(--surface);
    box-shadow: 22px 0 58px -30px rgba(73, 59, 44, .52);
    outline: 0;
  }
  .mobile-drawer-head {
    display: flex;
    flex: none;
    align-items: center;
    gap: 10px;
    padding:
      calc(12px + env(safe-area-inset-top))
      max(12px, env(safe-area-inset-right))
      12px
      max(16px, env(safe-area-inset-left));
    border-bottom: 1px solid var(--line);
    background: color-mix(in srgb, var(--cream) 72%, var(--surface));
  }
  .mobile-drawer-brand {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 10px;
    color: var(--ink);
    text-decoration: none;
  }
  .mobile-drawer-brand .brand-mark {
    width: 38px;
    height: 38px;
    flex: none;
    border-radius: 11px;
  }
  .mobile-drawer-brand > span {
    display: grid;
    min-width: 0;
    gap: 1px;
  }
  .mobile-drawer-brand strong {
    font-family: var(--font-s);
    font-size: 15px;
    font-weight: 900;
  }
  .mobile-drawer-brand small {
    overflow: hidden;
    color: var(--ink-60);
    font-size: 10px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-drawer-close {
    display: inline-flex;
    width: 44px;
    height: 44px;
    flex: none;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink-60);
    cursor: pointer;
  }
  .mobile-drawer-nav {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 10px max(12px, env(safe-area-inset-right)) 18px max(12px, env(safe-area-inset-left));
  }
  .mobile-drawer-section {
    display: grid;
    gap: 3px;
    padding: 8px 0;
  }
  .mobile-drawer-section + .mobile-drawer-section,
  .mobile-more,
  .mobile-management {
    border-top: 1px solid var(--line);
  }
  .mobile-more { padding: 8px 0; }
  .mobile-drawer-section > a,
  .mobile-drawer-link {
    position: relative;
    display: flex;
    width: 100%;
    min-height: 48px;
    align-items: center;
    gap: 12px;
    padding: 9px 11px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--ink-60);
    font-family: var(--font-b);
    font-size: 13px;
    font-weight: 800;
    line-height: 1.25;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .mobile-drawer-section > a svg,
  .mobile-drawer-link svg {
    flex: none;
    color: var(--tea);
  }
  .mobile-drawer-section > a:hover,
  .mobile-drawer-section > a.active,
  .mobile-drawer-section > a.router-link-active,
  .mobile-drawer-link.active,
  .mobile-drawer-link:hover {
    background: var(--yellow);
    color: var(--ink);
  }
  .mobile-drawer-foot {
    display: grid;
    flex: none;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding:
      10px
      max(12px, env(safe-area-inset-right))
      calc(10px + env(safe-area-inset-bottom))
      max(12px, env(safe-area-inset-left));
    border-top: 1px solid var(--line);
    background: var(--cream);
  }
  .mobile-account-link {
    display: flex;
    min-width: 0;
    min-height: 48px;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 12px;
    color: var(--ink);
    text-decoration: none;
  }
  .mobile-account-link > span {
    display: grid;
    min-width: 0;
    gap: 1px;
  }
  .mobile-account-link strong,
  .mobile-account-link small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-account-link strong {
    font-size: 12px;
    font-weight: 900;
  }
  .mobile-account-link small {
    color: var(--ink-60);
    font-size: 9.5px;
    font-weight: 700;
  }
  .mobile-drawer-logout {
    display: inline-flex;
    min-width: 58px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 7px 9px;
    border: 0;
    border-radius: 11px;
    background: transparent;
    color: var(--rouge);
    font-family: var(--font-b);
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
  }
  .mobile-drawer-enter-active,
  .mobile-drawer-leave-active {
    transition: opacity .18s ease;
  }
  .mobile-drawer-enter-active .mobile-drawer,
  .mobile-drawer-leave-active .mobile-drawer {
    transition: transform .22s cubic-bezier(.25, 1, .5, 1);
  }
  .mobile-drawer-enter-from,
  .mobile-drawer-leave-to {
    opacity: 0;
  }
  .mobile-drawer-enter-from .mobile-drawer,
  .mobile-drawer-leave-to .mobile-drawer {
    transform: translateX(-100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-drawer-enter-active,
  .mobile-drawer-leave-active,
  .mobile-drawer-enter-active .mobile-drawer,
  .mobile-drawer-leave-active .mobile-drawer {
    transition: none;
  }
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
</style>
