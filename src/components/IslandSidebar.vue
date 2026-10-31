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
          <section class="mobile-drawer-section" aria-label="首页">
            <router-link to="/" :class="{ active: $route.path === '/' || $route.path === '/today' }" :aria-current="($route.path === '/' || $route.path === '/today') ? 'page' : undefined">
              <House :size="20" aria-hidden="true" /><span>今日一览</span>
            </router-link>
          </section>
          <section class="mobile-drawer-section" aria-labelledby="mobile-player-tools">
            <h2 id="mobile-player-tools" class="nav-group-label">玩家工具</h2>
            <router-link
              to="/operator"
              :class="{ active: !managementActive && $route.path.startsWith('/operator') && !$route.path.startsWith('/operator/share') }"
              :aria-current="(!managementActive && $route.path.startsWith('/operator') && !$route.path.startsWith('/operator/share')) ? 'page' : undefined"
            >
              <BookUser :size="20" aria-hidden="true" /><span>密探名册</span>
            </router-link>
            <router-link v-if="showRecruitment" to="/recruitment" :class="{ active: $route.path === '/recruitment' }" :aria-current="($route.path === '/recruitment') ? 'page' : undefined">
              <ScrollText :size="20" aria-hidden="true" /><span>招募档案</span>
            </router-link>
            <router-link to="/inventory" :class="{ active: $route.path === '/inventory' }" :aria-current="($route.path === '/inventory') ? 'page' : undefined">
              <PackageOpen :size="20" aria-hidden="true" /><span>库存追踪</span>
            </router-link>
            <router-link to="/star" :class="{ active: $route.path === '/star' }" :aria-current="($route.path === '/star') ? 'page' : undefined">
              <Gem :size="20" aria-hidden="true" /><span>星石背包</span>
            </router-link>
            <router-link to="/cart" :class="{ active: $route.path === '/cart' }" :aria-current="($route.path === '/cart') ? 'page' : undefined">
              <ShoppingCart :size="20" aria-hidden="true" /><span>广陵账房</span>
            </router-link>
          </section>
          <section class="mobile-drawer-section" aria-labelledby="mobile-records">
            <h2 id="mobile-records" class="nav-group-label">资料与记录</h2>
            <router-link v-if="showCalendar" class="calendar-nav-link" to="/calendar" :class="{ active: !managementActive && $route.path.startsWith('/calendar') }" :aria-current="(!managementActive && $route.path.startsWith('/calendar')) ? 'page' : undefined">
              <CalendarDays :size="20" aria-hidden="true" /><span>活动日历</span>
            </router-link>
            <router-link v-if="showAchievement" to="/achievement" :class="{ active: $route.path === '/achievement' }" :aria-current="($route.path === '/achievement') ? 'page' : undefined">
              <BookCheck :size="20" aria-hidden="true" /><span>成就档案</span>
            </router-link>
            <router-link v-if="showBonds" to="/bonds" :class="{ active: $route.path === '/bonds' }" :aria-current="($route.path === '/bonds') ? 'page' : undefined">
              <Link2 :size="20" aria-hidden="true" /><span>羁绊图鉴</span>
            </router-link>
            <router-link v-if="isLoggedIn" to="/feedback" :class="{ active: !managementActive && $route.path.startsWith('/feedback') }" :aria-current="(!managementActive && $route.path.startsWith('/feedback')) ? 'page' : undefined">
              <MessageSquareText :size="20" aria-hidden="true" /><span>反馈中心</span>
            </router-link>
            <router-link v-else to="/feedback/plaza" :class="{ active: !managementActive && $route.path.startsWith('/feedback') }" :aria-current="(!managementActive && $route.path.startsWith('/feedback')) ? 'page' : undefined">
              <MessageSquareText :size="20" aria-hidden="true" /><span>反馈中心</span>
            </router-link>
          </section>

          <section v-if="showManagement" class="mobile-drawer-section mobile-management" aria-labelledby="mobile-management-label">
            <h2 id="mobile-management-label" class="nav-group-label">管理</h2>
            <router-link to="/manage" :class="{ active: workbenchActive }" :aria-current="workbenchActive ? 'page' : undefined">
              <LayoutDashboard :size="20" aria-hidden="true" /><span>管理工作台</span>
            </router-link>
            <template v-if="pinnedTools.length">
              <span class="admin-pins-label">常用管理</span>
              <router-link v-for="tool in pinnedTools" :key="tool.key" :to="tool.to"
                :class="{ active: pinnedActive(tool) }" :aria-current="pinnedActive(tool) ? 'page' : undefined">
                <component :is="tool.icon" :size="20" aria-hidden="true" /><span>{{ tool.label }}</span>
              </router-link>
            </template>
          </section>
          <details class="mobile-more" :open="moreActive">
            <summary class="mobile-drawer-link" :class="{ 'in-current-section': moreActive }" aria-controls="mobile-service-nav" aria-label="更多">
              <MoreHorizontal :size="20" aria-hidden="true" /><span>更多</span>
              <ChevronDown :size="16" class="more-chevron" aria-hidden="true" />
            </summary>
            <div id="mobile-service-nav" class="mobile-drawer-section" aria-label="YuanHub 服务">
              <router-link to="/developers" :class="{ active: $route.path.startsWith('/developers') }" :aria-current="($route.path.startsWith('/developers')) ? 'page' : undefined">
                <BookOpen :size="20" aria-hidden="true" /><span>开发者中心</span>
              </router-link>
              <router-link to="/changelog" :class="{ active: $route.path === '/changelog' }" :aria-current="($route.path === '/changelog') ? 'page' : undefined">
                <ScrollText :size="20" aria-hidden="true" /><span>更新日志</span>
              </router-link>
              <router-link to="/roadmap" :class="{ active: $route.path === '/roadmap' }" :aria-current="$route.path === '/roadmap' ? 'page' : undefined">
                <Map :size="20" aria-hidden="true" /><span>发展规划</span>
              </router-link>
              <router-link to="/beta" :class="{ active: $route.path === '/beta' }" :aria-current="($route.path === '/beta') ? 'page' : undefined">
                <Ticket :size="20" aria-hidden="true" /><span>参与内测</span>
              </router-link>
              <router-link to="/install" :class="{ active: $route.path === '/install' }" :aria-current="($route.path === '/install') ? 'page' : undefined">
                <Download :size="20" aria-hidden="true" /><span>安装到桌面</span>
              </router-link>
              <button v-if="showBetaCommunityEntry" type="button" class="mobile-drawer-link" @click="openBetaCommunity">
                <UsersRound :size="20" aria-hidden="true" /><span>内测交流群</span>
              </button>
            </div>
          </details>
        </nav>

        <ThemeSelector class="mobile-theme-selector" />
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
          <span class="foot-version" :title="buildInfoLine">YuanHub {{ productVersionLabel }}</span>
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
        <b>鸢鸢相抱 <Heart :size="12" aria-hidden="true" /></b>
      </div>
    </router-link>
    <nav class="nav" aria-label="全部导航">
      <router-link
        to="/"
        :class="{ active: $route.path === '/' || $route.path === '/today' }"
        :aria-current="($route.path === '/' || $route.path === '/today') ? 'page' : undefined"
      >
        <House :size="20" aria-hidden="true" /><span>今日一览</span>
      </router-link>
      <h2 class="nav-group-label">玩家工具</h2>
      <router-link
        to="/operator"
        :class="{ active: !managementActive && $route.path.startsWith('/operator') && !$route.path.startsWith('/operator/share') }"
        :aria-current="(!managementActive && $route.path.startsWith('/operator') && !$route.path.startsWith('/operator/share')) ? 'page' : undefined"
      >
        <BookUser :size="20" aria-hidden="true" /><span>密探名册</span>
      </router-link>
      <router-link v-if="showRecruitment" to="/recruitment" :class="{ active: $route.path === '/recruitment' }"
        :aria-current="($route.path === '/recruitment') ? 'page' : undefined">
        <ScrollText :size="20" aria-hidden="true" /><span>招募档案</span>
      </router-link>
      <router-link
        to="/inventory"
        :class="{ active: $route.path === '/inventory' }"
        :aria-current="($route.path === '/inventory') ? 'page' : undefined"
      >
        <PackageOpen :size="20" aria-hidden="true" /><span>库存追踪</span>
      </router-link>
      <router-link to="/star" :class="{ active: $route.path === '/star' }"
        :aria-current="($route.path === '/star') ? 'page' : undefined">
        <Gem :size="20" aria-hidden="true" /><span>星石背包</span>
      </router-link>
      <router-link to="/cart" :class="{ active: $route.path === '/cart' }"
        :aria-current="($route.path === '/cart') ? 'page' : undefined">
        <ShoppingCart :size="20" aria-hidden="true" /><span>广陵账房</span>
      </router-link>
      <h2 class="nav-group-label">资料与记录</h2>
      <router-link v-if="showCalendar" class="calendar-nav-link" to="/calendar" :class="{ active: !managementActive && $route.path.startsWith('/calendar') }" :aria-current="(!managementActive && $route.path.startsWith('/calendar')) ? 'page' : undefined">
        <CalendarDays :size="20" aria-hidden="true" /><span>活动日历</span>
      </router-link>
      <router-link v-if="showAchievement" to="/achievement" :class="{ active: $route.path === '/achievement' }" :aria-current="($route.path === '/achievement') ? 'page' : undefined">
        <BookCheck :size="20" aria-hidden="true" /><span>成就档案</span>
      </router-link>
      <router-link v-if="showBonds" to="/bonds" :class="{ active: $route.path === '/bonds' }" :aria-current="($route.path === '/bonds') ? 'page' : undefined">
        <Link2 :size="20" aria-hidden="true" /><span>羁绊图鉴</span>
      </router-link>
      <router-link v-if="isLoggedIn" to="/feedback" :class="{ active: !managementActive && $route.path.startsWith('/feedback') }" :aria-current="(!managementActive && $route.path.startsWith('/feedback')) ? 'page' : undefined">
        <MessageSquareText :size="20" aria-hidden="true" /><span>反馈中心</span>
      </router-link>
      <router-link v-else to="/feedback/plaza" :class="{ active: !managementActive && $route.path.startsWith('/feedback') }" :aria-current="(!managementActive && $route.path.startsWith('/feedback')) ? 'page' : undefined">
        <MessageSquareText :size="20" aria-hidden="true" /><span>反馈中心</span>
      </router-link>
      <h2 v-if="showManagement" class="nav-group-label">{{ pinnedTools.length ? '常用管理' : '管理' }}</h2>
      <template v-if="showManagement">
        <router-link v-for="tool in pinnedTools" :key="tool.key" :to="tool.to"
          :class="{ active: pinnedActive(tool) }" :aria-current="pinnedActive(tool) ? 'page' : undefined">
          <component :is="tool.icon" :size="20" aria-hidden="true" /><span>{{ tool.label }}</span>
        </router-link>
        <router-link class="management-nav-link" to="/manage" :class="{ active: workbenchActive }" :aria-current="workbenchActive ? 'page' : undefined"><LayoutDashboard :size="20" aria-hidden="true" /><span>管理工作台</span></router-link>
      </template>
      <details ref="desktopMore" class="sidebar-more" :open="moreActive" @keydown.esc.stop.prevent="closeDesktopMore(true)">
        <summary class="sidebar-more-trigger" :class="{ 'in-current-section': moreActive }" data-tour="replay-entry" aria-controls="desktop-service-nav" aria-label="更多">
          <MoreHorizontal :size="20" aria-hidden="true" /><span>更多</span>
          <ChevronDown :size="16" class="more-chevron" aria-hidden="true" />
        </summary>
        <div id="desktop-service-nav" class="sidebar-more-panel" role="group" aria-label="YuanHub 服务">
          <router-link to="/developers" :class="{ active: $route.path.startsWith('/developers') }" :aria-current="($route.path.startsWith('/developers')) ? 'page' : undefined">
            <BookOpen :size="20" aria-hidden="true" /><span>开发者中心</span>
          </router-link>
          <router-link to="/changelog" :class="{ active: $route.path === '/changelog' }" :aria-current="($route.path === '/changelog') ? 'page' : undefined">
            <ScrollText :size="20" aria-hidden="true" /><span>更新日志</span>
          </router-link>
          <router-link to="/roadmap" :class="{ active: $route.path === '/roadmap' }" :aria-current="$route.path === '/roadmap' ? 'page' : undefined">
            <Map :size="20" aria-hidden="true" /><span>发展规划</span>
          </router-link>
          <router-link to="/beta" :class="{ active: $route.path === '/beta' }" :aria-current="($route.path === '/beta') ? 'page' : undefined">
            <Ticket :size="20" aria-hidden="true" /><span>参与内测</span>
          </router-link>
          <router-link to="/install" :class="{ active: $route.path === '/install' }" :aria-current="($route.path === '/install') ? 'page' : undefined">
            <Download :size="20" aria-hidden="true" /><span>安装到桌面</span>
          </router-link>
          <button v-if="showBetaCommunityEntry" type="button" @click="openBetaCommunity">
            <UsersRound :size="20" aria-hidden="true" /><span>内测交流群</span>
          </button>
        </div>
      </details>
    </nav>
    <div class="island-foot">
      <div class="sidebar-utilities">
        <details ref="accountMenu" class="sidebar-account-menu" @keydown.esc.stop.prevent="closeAccountMenu(true)" @focusout="onAccountFocusOut">
          <summary class="sidebar-account" aria-label="账号与外观设置" aria-controls="sidebar-account-panel">
            <img src="/brand/yuanhub-logo.png" alt="" width="30" height="30" />
            <span class="sidebar-account-copy">
              <strong>{{ isLoggedIn ? userName : "登录 / 注册" }}</strong>
              <small>{{ isLoggedIn ? "账号与连接码" : "登录与外观设置" }}</small>
            </span>
            <ChevronDown :size="14" class="account-chevron" aria-hidden="true" />
          </summary>
          <div id="sidebar-account-panel" class="sidebar-account-panel">
            <router-link :to="isLoggedIn ? '/user/profile' : '/login'" @click="closeAccountMenu()">
              <UserRound :size="18" aria-hidden="true" />{{ isLoggedIn ? "账号与连接码" : "登录 / 注册" }}
            </router-link>
            <span class="account-appearance-label">外观</span>
            <ThemeSelector />
            <button v-if="isLoggedIn" class="foot-logout" type="button" @click="onLogout"><LogOut :size="18" aria-hidden="true" />退出登录</button>
            <span class="foot-version" :title="buildInfoLine">YuanHub {{ productVersionLabel }}</span>
          </div>
        </details>
        <router-link v-if="isLoggedIn" class="sidebar-notifications" to="/notifications" :class="{ active: $route.path === '/notifications' }" :aria-label="unreadCount > 0 ? `通知，${unreadCount > 99 ? '99+' : unreadCount} 条未读` : '通知'">
          <Bell :size="20" aria-hidden="true" />
          <span v-if="unreadCount > 0" class="sidebar-badge">{{ unreadCount > 99 ? "99+" : unreadCount }}</span>
        </router-link>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import MobileHeader from "./MobileHeader.vue";
import ThemeSelector from "./ThemeSelector.vue";
import {
  Bell,
  BookUser,
  CalendarDays,
  BookOpen,
  ChevronDown,
  Download,
  Gem,
  House,
  LayoutDashboard,
  LogIn,
  LogOut,
  Map,
  Menu,
  BookCheck,
  Link2,
  MessageSquareText,
  MoreHorizontal,
  PackageOpen,
  ScrollText,
  ShoppingCart,
  Ticket,
  UsersRound,
  UserRound,
  X,
  Heart,
} from "@lucide/vue";
import { ADMIN_PERMISSIONS, hasPermission } from "@/utils/authPermissions.js";
import { auth, logout as doLogout } from "@/store/auth.js";
import { hasManagementCapability, isManagementRoute } from "@/utils/adminTools.js";
import { beta } from "@/store/beta.js";
import { FEATURE_KEYS, isFeatureEnabled } from "@/config/features.js";
import { betaCommunity } from "@/store/betaCommunity.js";
import { useRoute } from "vue-router";
import { dialog } from "@/utils/dialog.js";
import { modalFocusState, useModalFocus } from "@/composables/useModalFocus.js";
import { useAdminNavPins } from "@/composables/useAdminNavPins.js";
import { formatBuildInfo, productVersionLabel } from "@/config/buildInfo.js";
import { notificationUnreadState } from "@/store/notificationUnread.js";

// 已登录状态（reactive，随 auth 变化）
const { pinnedTools } = useAdminNavPins();
const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : "");
const isLoggedIn = computed(() => (auth.accessToken && auth.userInfo) || false);
const showManagement = computed(() =>
  !!isLoggedIn.value &&
  auth.adminAccessLoaded &&
  !auth.adminAccessLoading &&
  !auth.adminAccessError &&
  hasManagementCapability(auth.adminAccess),
);
const showCalendar = computed(() => isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR));
const showRecruitment = computed(() => isFeatureEnabled(FEATURE_KEYS.RECRUITMENT_ARCHIVE));
const showAchievement = computed(() => isLoggedIn.value && isFeatureEnabled(FEATURE_KEYS.ACHIEVEMENT_ARCHIVE));
const showBonds = computed(() => isLoggedIn.value && hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.ARCHIVE_ACCESS) && isFeatureEnabled(FEATURE_KEYS.BOND_ARCHIVE));
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
// 版本仅作信息展示，完整诊断信息保留在 title 中。
const buildInfoLine = computed(() => formatBuildInfo());
const unreadCount = computed(() => notificationUnreadState.count);
const route = useRoute();
const managementActive = computed(() => isManagementRoute(route.path));
const pinnedActive = tool => route.path.replace(/\/+$/, '') === tool.to;
const workbenchActive = computed(() => managementActive.value && !pinnedTools.value.some(pinnedActive));
const moreActive = computed(() => !managementActive.value && (
  ["/beta", "/changelog", "/roadmap", "/install"].includes(route.path) || route.path.startsWith('/developers')
));
const desktopMore = ref(null);
const accountMenu = ref(null);
const menuOpen = ref(false);
const menuToggle = ref(null);
const menuPanel = ref(null);
useModalFocus(menuOpen, menuPanel, { initialFocus: () => menuPanel.value, onEscape: closeMenu });
const mobileTitle = computed(() => ({ '/star': '星石背包', '/cart': '礼包计算器', '/feedback': '我的反馈' }[route.path] || route.meta?.title?.split(" — ")[0] || "YuanHub"));

watch(() => route.fullPath, () => {
  cancelSwipe();
  closeAccountMenu();
  menuOpen.value = false;
  void nextTick(() => {
    if (desktopMore.value) desktopMore.value.open = moreActive.value;
  });
});
watch(menuOpen, (open) => {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("mobile-nav-open", open);
});

watch(identity, () => closeAccountMenu());

async function onLogout() {
  closeAccountMenu(true);
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

let swipeStart = null;

function cancelSwipe() {
  swipeStart = null;
}

function onTouchStart(event) {
  cancelSwipe();
  if (window.innerWidth > 1080 || menuOpen.value || modalFocusState.active || event.defaultPrevented || event.touches.length !== 1) return;
  const touch = event.touches[0];
  // 留出系统返回手势边缘，表单和横向滚动区保留自己的触控行为。
  if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24 || window.getSelection()?.isCollapsed === false) return;
  const target = event.target;
  if (!(target instanceof Element) || target.closest('input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="dialog"], [role="tablist"]')) return;
  for (let node = target; node && node !== document.body; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth && /auto|scroll/.test(getComputedStyle(node).overflowX)) return;
  }
  swipeStart = { x: touch.clientX, y: touch.clientY, id: touch.identifier, time: Date.now() };
}

function onTouchMove(event) {
  if (!swipeStart) return;
  const touch = event.touches[0];
  if (event.touches.length !== 1 || touch.identifier !== swipeStart.id || Math.abs(touch.clientY - swipeStart.y) > 24 || touch.clientX < swipeStart.x - 24) cancelSwipe();
}

function onTouchEnd(event) {
  const start = swipeStart;
  cancelSwipe();
  const touch = event.changedTouches[0];
  if (!start || !touch || event.touches.length || touch.identifier !== start.id || event.defaultPrevented || window.innerWidth > 1080 || menuOpen.value || modalFocusState.active) return;
  const dx = touch.clientX - start.x;
  const dy = Math.abs(touch.clientY - start.y);
  if (Date.now() - start.time <= 600 && dx >= 80 && dy <= 24) toggleMenu();
}

function closeDesktopMore(restoreFocus = false) {
  const details = desktopMore.value;
  if (!details?.open) return;
  details.open = false;
  if (restoreFocus) details.querySelector("summary")?.focus();
}

function closeAccountMenu(restoreFocus = false) {
  if (!accountMenu.value?.open) return;
  accountMenu.value.open = false;
  if (restoreFocus) accountMenu.value.querySelector("summary")?.focus();
}

function onAccountPointerDown(event) {
  if (!accountMenu.value?.contains(event.target)) closeAccountMenu();
}

function onAccountFocusOut(event) {
  if (!accountMenu.value?.contains(event.relatedTarget)) closeAccountMenu();
}

function openBetaCommunity() {
  closeDesktopMore();
  menuOpen.value = false;
  betaCommunity.open("manual");
}

onMounted(function () {
  document.addEventListener("pointerdown", onAccountPointerDown);
  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("touchend", onTouchEnd, { passive: true });
  document.addEventListener("touchcancel", cancelSwipe, { passive: true });
});

onBeforeUnmount(function () {
  document.removeEventListener("pointerdown", onAccountPointerDown);
  document.removeEventListener("touchstart", onTouchStart);
  document.removeEventListener("touchmove", onTouchMove);
  document.removeEventListener("touchend", onTouchEnd);
  document.removeEventListener("touchcancel", cancelSwipe);
  document.body.classList.remove("mobile-nav-open");
});
</script>

<style scoped>
.admin-pins-label { color: var(--ink-60); }
.nav-group-label { color: var(--ink-60); }
.nav-group-label::after { content: ''; background: var(--line); }
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.sidebar-more-trigger {
  border-radius: 10px;
  color: var(--ink-60);
  cursor: pointer;
}
.sidebar-more-trigger:hover { background: var(--theme-wash-strong, rgba(232,193,91,.22)); color: var(--ink); }
.sidebar-more-trigger.in-current-section { color: var(--ink); }
.sidebar-more-panel {
  border-left: 1px solid var(--line);
}
.sidebar-more-panel > a,
.sidebar-more-panel > button {
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--ink-60);
  text-decoration: none;
  cursor: pointer;
}
.sidebar-more-panel > a:hover,
.sidebar-more-panel > button:hover { background: var(--theme-wash-strong, rgba(232,193,91,.22)); color: var(--ink); }
.sidebar-more-panel > a.active { background: var(--yellow); color: var(--ink); }
.more-feedback-badge {
  border-radius: 999px;
  background: var(--rouge);
  color: #fff;
}
.sidebar-utilities .sidebar-account {
  border: 0;
}
.sidebar-account small { color: var(--ink-60); }
.sidebar-utilities .sidebar-notifications {
  border: 0;
  border-radius: 10px;
}
.sidebar-notifications.active,
.sidebar-notifications:hover { background: var(--yellow); }
:where(.nav a, .sidebar-more-trigger, .sidebar-more-panel > a, .sidebar-more-panel > button, .sidebar-account, .sidebar-notifications, .foot-logout, .mobile-drawer-section > a, .mobile-drawer-link, .mobile-account-link, .mobile-drawer-close, .mobile-drawer-logout):focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.foot-logout {
  background: none;
  border: none;
  color: var(--ink-60);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
  transition: color 0.25s;
}
.foot-logout:hover {
  color: var(--theme-danger-text, var(--rouge));
}
.sidebar-badge {
  background: var(--rouge);
  color: #fff;
  border-radius: 999px;
}

@media (max-width: 1080px) {
  .mobile-menu-button,
  .mobile-header-action {
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
    color: var(--theme-accent-text, var(--accent-strong));
  }
  .mobile-page-title {
    color: var(--ink);
  }
  .mobile-header-badge {
    border: 2px solid var(--cream);
    border-radius: 999px;
    background: var(--rouge);
    color: #fff;
  }
  .mobile-drawer-scrim {
    background: var(--theme-overlay, rgba(73, 59, 44, .34));
    backdrop-filter: blur(2px);
  }
  .mobile-drawer {
    border-right: 1px solid var(--line);
    background: var(--surface);
    box-shadow: 22px 0 58px -30px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.52);
    outline: 0;
  }
  .mobile-drawer-head {
    border-bottom: 1px solid var(--line);
    background: color-mix(in srgb, var(--cream) 72%, var(--surface));
  }
  .mobile-drawer-brand {
    color: var(--ink);
    text-decoration: none;
  }
  .mobile-drawer-brand .brand-mark {
    border-radius: 11px;
  }
  .mobile-drawer-brand small {
    color: var(--ink-60);
  }
  .mobile-drawer-close {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink-60);
    cursor: pointer;
  }
  .mobile-more {
    border-top: 1px solid var(--line);
  }
  .mobile-drawer-section > a,
  .mobile-drawer-link {
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--ink-60);
    text-decoration: none;
    cursor: pointer;
  }
  .mobile-drawer-section > a svg,
  .mobile-drawer-link svg {
    color: var(--theme-strong-text, var(--tea));
  }
  .mobile-drawer-section > a:hover,
  .mobile-drawer-link:hover {
    background: var(--theme-wash-strong, rgba(232,193,91,.22));
    color: var(--ink);
  }
  .mobile-drawer-section > a.active {
    background: var(--yellow);
    color: var(--ink);
  }
  .mobile-drawer-link.in-current-section { color: var(--ink); }
  .mobile-drawer-foot {
    border-top: 1px solid var(--line);
    background: var(--cream);
  }
  .mobile-account-link {
    border-radius: 12px;
    color: var(--ink);
    text-decoration: none;
  }
  .mobile-account-link small {
    color: var(--ink-60);
  }
  .mobile-drawer-logout {
    border: 0;
    border-radius: 11px;
    background: transparent;
    color: var(--theme-danger-text, var(--rouge));
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
}

@media (prefers-reduced-motion: reduce) {
  .mobile-drawer-enter-active,
  .mobile-drawer-leave-active,
  .mobile-drawer-enter-active .mobile-drawer,
  .mobile-drawer-leave-active .mobile-drawer {
    transition: none;
  }
}
/* 版本信息不再重复跳转至更新日志。 */
.foot-version {
  color: var(--ink-60);
}
</style>
<style scoped src="./islandSidebarDesktop.css"></style>
<style scoped src="./islandSidebarMobile.css"></style>
