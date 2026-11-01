<template>
  <Reference v-if="route.hash.startsWith('#doc-')" document-id="home" />
  <div v-else class="page-developers developer-product">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header"><div class="wrap">
        <h1 class="page-header-title">将 YuanHub 数据接入你的应用</h1>
        <p class="page-header-description">为你的小程序、网站、App 或桌面软件接入 YuanHub 游戏数据。</p>
      </div></header>
      <div class="wrap developer-product-content">
        <section aria-labelledby="scenario-title">
          <h2 id="scenario-title">选择应用需要的数据</h2>
          <p>你负责开发应用，应用用户拥有并授权自己的数据，YuanHub 验证 Token、Scope 和账号边界。公开目录无需授权，个人数据必须由每位用户分别连接。</p>
          <div class="developer-scenarios">
            <router-link v-for="scenario in developerUseCases" :key="scenario.id" :to="scenario.path" class="developer-scenario">
              <component :is="icons[scenario.icon]" :size="24" aria-hidden="true" />
              <div><h3>{{ scenario.title }}</h3><p>{{ scenario.summary }}</p>
                <p class="developer-scenario-access">{{ scenario.access }}</p>
                <span class="developer-scenario-action">{{ scenario.action }}<ArrowRight :size="16" aria-hidden="true" /></span>
              </div>
            </router-link>
          </div>
          <p>尚未向第三方 Token 开放：完整密探 V5 备份、招募档案、结构化星石背包等。<router-link to="/developers/gaps">查看能力边界与后续建议</router-link>。</p>
        </section>
        <section class="developer-connect" aria-labelledby="connect-title">
          <h2 id="connect-title">从开发调试到用户接入</h2>
          <ol class="developer-connect-steps">
            <li><strong>选择能力与权限</strong><p>确认公开或私有接口，只申请应用需要的最小 Scope。</p></li>
            <li><strong>用测试账号调通</strong><p>使用开发者自己账号的测试 Token；它只能访问绑定的测试账号。</p></li>
            <li><strong>让每位用户单独连接</strong><p>用户自愿创建自己的 Token；应用按用户隔离凭据、数据和连接状态。</p></li>
          </ol>
          <p class="developer-security">例如为 500 名玩家开发微信小程序：每位玩家需要单独授权并满足当前 Beta 条件。开发者创建一个 Token，不能让所有玩家读取各自的数据。</p>
          <router-link class="developer-button" to="/developers/guide">阅读第三方接入指南<ArrowRight :size="16" aria-hidden="true" /></router-link>
        </section>
        <section class="developer-technical" aria-labelledby="reference-title">
          <h2 id="reference-title">技术参考</h2>
          <p>查阅接口、授权边界、协议与可下载的 Schema 和示例。</p>
          <nav class="developer-reference-links" aria-label="技术参考">
            <router-link v-for="reference in developerReferences" :key="reference.title" :to="reference.path">
              <strong>{{ reference.title }}<ArrowRight :size="15" aria-hidden="true" /></strong><span>{{ reference.summary }}</span>
            </router-link>
          </nav>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup>
import '@/styles/page-header.css'
import { defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRight, BookUser, CalendarDays, ListChecks, PackageOpen } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import { developerReferences, developerUseCases } from '../../data/developerUseCases.js'

const route = useRoute()
// Old homepage document anchors continue to use the original reader and assets.
const Reference = defineAsyncComponent(() => import('./reference.vue'))
const icons = { BookUser, CalendarDays, ListChecks, PackageOpen }
</script>

<style>
@import './developerProduct.css';
@import './developerProductMobile.css';
@import './developerProductDesktop.css';
</style>
