<template>
  <aside class="island">
    <div class="brand">
      <div class="brand-mark">Y</div>
      <div class="brand-txt">YuanHub<span class="beta">Beta</span><b>栖鸢阁</b></div>
    </div>
    <nav class="nav">
      <!-- 作业广场（暂时隐藏）：<router-link to="/" :class="{ active: $route.path === '/' }"><span class="no">01</span>作业广场</router-link> -->
      <router-link to="/cart" :class="{ active: $route.path === '/cart' }"><span class="no">01</span>广陵账房</router-link>
      <router-link to="/inventory" :class="{ active: $route.path === '/inventory' }"><span class="no">02</span>库存</router-link>
      <router-link to="/operator" :class="{ active: $route.path === '/operator' }"><span class="no">03</span>密探</router-link>
      <router-link to="/user/profile" :class="{ active: $route.path === '/user/profile' }"><span class="no">04</span>个人中心</router-link>
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
import { computed } from 'vue'
import { auth, logout as doLogout } from '@/store/auth.js'

// 已登录状态（reactive，随 auth 变化）
const isLoggedIn = computed(() => (auth.accessToken && auth.userInfo) || false)
const userName = computed(() => (auth.userInfo && auth.userInfo.user_name) ? auth.userInfo.user_name : '用户')

function onLogout() {
  // store/auth.js 的 logout() 会清空登录态并跳转 /login
  doLogout()
}
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
</style>
