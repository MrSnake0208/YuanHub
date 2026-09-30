<template>
  <MobileHeader :pinned="menuOpen" @keydown.esc.prevent="closeMenu">
    <button
      ref="menuToggle"
      class="mobile-menu-button"
      type="button"
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
        @keydown.tab="trapDrawerFocus"
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
            <p class="mobile-drawer-label">主要功能</p>
            <router-link to="/" :class="{ active: $route.path === '/' || $route.path === '/today' }">
              <House :size="20" aria-hidden="true" /><span>今日一览</span>
            </router-link>
            <router-link
              to="/operator"
              :class="{ active: $route.path.startsWith('/operator') && !$route.path.startsWith('/operator/share') }"
            >
              <BookUser :size="20" aria-hidden="true" /><span>密探名册</span>
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
          </section>

          <section class="mobile-drawer-section">
            <p class="mobile-drawer-label">消息与社区</p>
            <router-link
              v-if="isLoggedIn"
              to="/notifications"
              :class="{ active: $route.path === '/notifications' }"
            >
              <Bell :size="20" aria-hidden="true" /><span>通知中心</span>
              <span v-if="unreadCount > 0" class="mobile-drawer-badge">{{
                unreadCount > 99 ? "99+" : unreadCount
              }}</span>
            </router-link>
            <router-link
              :to="isLoggedIn ? '/feedback' : '/feedback/plaza'"
              :class="{ active: $route.path.startsWith('/feedback') }"
            >
              <MessageSquareText :size="20" aria-hidden="true" /><span>反馈中心</span>
              <span v-if="isLoggedIn && feedbackUnreadState.count > 0" class="mobile-drawer-badge">{{
                feedbackUnreadState.count > 99 ? "99+" : feedbackUnreadState.count
              }}</span>
            </router-link>
            <router-link to="/co-creation" :class="{ active: $route.path.startsWith('/co-creation') }">
              <Lightbulb :size="20" aria-hidden="true" /><span>大饼中心</span>
            </router-link>
            <button
              v-if="showBetaCommunityEntry"
              type="button"
              class="mobile-drawer-link"
              @click="openBetaCommunity"
            >
              <UsersRound :size="20" aria-hidden="true" /><span>内测交流群</span>
            </button>
          </section>

          <section class="mobile-drawer-section">
            <p class="mobile-drawer-label">YuanHub</p>
            <router-link to="/beta" :class="{ active: $route.path === '/beta' }">
              <Ticket :size="20" aria-hidden="true" /><span>参与内测</span>
            </router-link>
            <router-link to="/changelog" :class="{ active: $route.path === '/changelog' }">
              <ScrollText :size="20" aria-hidden="true" /><span>更新日志</span>
            </router-link>
            <router-link to="/install" :class="{ active: $route.path === '/install' }">
              <Download :size="20" aria-hidden="true" /><span>安装到桌面</span>
            </router-link>
            <button
              type="button"
              class="mobile-drawer-link"
              data-tour="replay-entry"
              @click="restartTutorial"
            >
              <CircleHelp :size="20" aria-hidden="true" /><span>新手教程</span>
            </button>
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
      <div class="nav-lb">消息与社区</div>
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
      </template>

      <router-link
        v-if="!isLoggedIn"
        to="/feedback/plaza"
        :class="{ active: $route.path.startsWith('/feedback') }"
      >反馈中心</router-link>
      <router-link
        to="/co-creation"
        :class="{ active: $route.path.startsWith('/co-creation') }"
        >大饼中心</router-link
      >
      <button v-if="showBetaCommunityEntry" type="button" class="nav-community" @click="openBetaCommunity">
        <span>内测交流群</span><UsersRound :size="16" aria-hidden="true" />
      </button>
      <div class="nav-lb">YuanHub</div>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
  LogOut,
  Menu,
  MessageSquareText,
  PackageOpen,
  ScrollText,
  ShoppingCart,
  Ticket,
  UsersRound,
  UserRound,
  X,
} from "@lucide/vue";
import { auth, logout as doLogout } from "@/store/auth.js";
import { beta } from "@/store/beta.js";
import { betaCommunity } from "@/store/betaCommunity.js";
import { useRoute, useRouter } from "vue-router";
import { dialog } from "@/utils/dialog.js";
import { restartOnboardingTour } from "@/utils/onboardingTour.js";
import { formatBuildInfo, productVersionLabel } from "@/config/buildInfo.js";
import { notificationUnreadState } from "@/store/notificationUnread.js";
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
const unreadCount = computed(() => notificationUnreadState.count);
const router = useRouter();
const route = useRoute();
const menuOpen = ref(false);
const menuToggle = ref(null);
const menuPanel = ref(null);
const mobileTitle = computed(() => route.meta?.title?.split(" — ")[0] || "YuanHub");

watch(() => route.fullPath, () => {
  menuOpen.value = false;
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

function trapDrawerFocus(event) {
  const panel = menuPanel.value;
  if (!panel) return;
  const focusable = Array.from(
    panel.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function restartTutorial() {
  menuOpen.value = false;
  void restartOnboardingTour(router);
}

function openBetaCommunity() {
  menuOpen.value = false;
  betaCommunity.open("manual");
}

onMounted(function () {
  stopFeedbackUnread = subscribeFeedbackUnread();
});

onBeforeUnmount(function () {
  if (stopFeedbackUnread) stopFeedbackUnread();
  document.body.classList.remove("mobile-nav-open");
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
  .mobile-drawer-section + .mobile-drawer-section {
    border-top: 1px solid var(--line);
  }
  .mobile-drawer-label {
    margin: 0;
    padding: 7px 10px 5px;
    color: var(--ink-35);
    font-family: var(--font-d);
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .14em;
    line-height: 1.2;
  }
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
  .mobile-drawer-link:hover {
    background: var(--yellow);
    color: var(--ink);
  }
  .mobile-drawer-badge {
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
    font-size: 9px;
    font-weight: 900;
    line-height: 1;
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
</style>
