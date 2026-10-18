<template>
  <Reference v-if="route.hash.startsWith('#doc-')" document-id="home" />
  <div v-else class="page-developers developer-product">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header"><div class="wrap">
        <h1 class="page-header-title">让你的工具连接 YuanHub</h1>
        <p class="page-header-description">选择你想使用的数据，获取接入步骤，也可以直接复制说明交给 AI 帮你完成。</p>
      </div></header>
      <div class="wrap developer-product-content">
        <section aria-labelledby="scenario-title">
          <h2 id="scenario-title">我想做什么</h2>
          <div class="developer-scenarios">
            <router-link v-for="scenario in developerUseCases" :key="scenario.id" :to="scenario.path" class="developer-scenario">
              <component :is="icons[scenario.icon]" :size="24" aria-hidden="true" />
              <div><h3>{{ scenario.title }}</h3><p>{{ scenario.summary }}</p>
                <span class="developer-scenario-action">{{ scenario.action }}<ArrowRight :size="16" aria-hidden="true" /></span>
              </div>
            </router-link>
          </div>
        </section>
        <section class="developer-connect" aria-labelledby="connect-title">
          <h2 id="connect-title">连接 YuanHub，只需三步</h2>
          <ol class="developer-connect-steps">
            <li><strong>选择数据</strong><p>从你想做的事情开始，找到对应的接入说明。</p></li>
            <li><strong>创建连接码</strong><p>选择游戏账号，只授权工具需要的数据。</p></li>
            <li><strong>交给 AI 接入</strong><p>复制说明给 AI，按它的指引在本地运行工具。</p></li>
          </ol>
        </section>
        <section class="developer-technical" aria-labelledby="reference-title">
          <h2 id="reference-title">技术参考</h2>
          <p>已经熟悉开发？从这里查阅接口与协议。</p>
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

<style src="@/pages/developers/developerProduct.css"></style>
<style src="@/pages/developers/developerProductMobile.css"></style>
<style src="@/pages/developers/developerProductDesktop.css"></style>
