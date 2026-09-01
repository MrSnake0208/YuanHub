<template>
  <div class="page-admin-workbench">
    <IslandSidebar />

    <main id="main-content">
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">管理</span>
            <span class="pill">工作台</span>
          </div>
          <h1>管理工作台<span class="small">平台工具</span></h1>
          <p class="hero-sub">从这里进入当前账号已获授权的反馈处理、公共内容维护和平台治理工具。</p>
        </div>
      </header>

      <section class="workbench-content">
        <div class="wrap">
          <div v-if="permissionLoading" class="workbench-state" role="status" aria-live="polite">
            <LoaderCircle :size="22" aria-hidden="true" />
            <strong>正在读取管理权限</strong>
            <span>权限确认完成后会显示可用工具。</span>
          </div>
          <div v-else-if="auth.adminAccessError" class="workbench-state error" role="alert">
            <ShieldAlert :size="22" aria-hidden="true" />
            <strong>管理权限读取失败</strong>
            <span>{{ auth.adminAccessError }}</span>
            <router-link class="command secondary" to="/user/profile">返回个人中心</router-link>
          </div>
          <div v-else-if="!canManage" class="workbench-state" role="alert">
            <ShieldAlert :size="22" aria-hidden="true" />
            <strong>当前账号没有可用的管理能力</strong>
            <span>仍可从个人中心管理账号与应用连接。</span>
            <router-link class="command secondary" to="/user/profile">返回个人中心</router-link>
          </div>

          <div v-else class="workbench-groups">
            <section v-for="group in toolGroups" :key="group.key" class="workbench-group" :aria-labelledby="'group-' + group.key">
              <header class="workbench-group-head">
                <span class="section-kicker">{{ group.key.toUpperCase() }}</span>
                <h2 :id="'group-' + group.key">{{ group.label }}</h2>
              </header>
              <div class="workbench-tools">
                <router-link
                  v-for="tool in group.tools"
                  :key="tool.key"
                  class="workbench-tool"
                  :to="tool.to"
                  :aria-label="tool.label + '：' + tool.description"
                >
                  <span class="workbench-tool-icon" aria-hidden="true">
                    <component :is="tool.icon" :size="21" />
                  </span>
                  <span class="workbench-tool-copy">
                    <strong>{{ tool.label }}</strong>
                    <small>{{ tool.description }}</small>
                  </span>
                  <ArrowUpRight :size="19" aria-hidden="true" />
                </router-link>
              </div>
            </section>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>管理工作台<br><span>反馈 · 内容 · 平台治理</span></template>
        <template #fine><b>YuanHub</b> · 管理工作台<br>仅显示当前账号已获授权的管理工具<br>账号与应用连接请前往个人中心</template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ArrowUpRight, LoaderCircle, ShieldAlert } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { auth } from '../../store/auth.js'
import { getVisibleAdminToolGroups, hasManagementCapability } from '../../utils/adminTools.js'

const permissionLoading = computed(function () {
  return auth.adminAccessLoading || !auth.adminAccessLoaded
})
const canManage = computed(function () {
  return hasManagementCapability(auth.adminAccess)
})
const toolGroups = computed(function () {
  return getVisibleAdminToolGroups(auth.adminAccess)
})
</script>

<style scoped>
.page-admin-workbench {
  min-height: 100vh;
}

.page-admin-workbench .hero {
  --wm: '管';
}

.workbench-content {
  padding-bottom: 16px;
}

.workbench-state {
  min-height: 240px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 9px;
  padding: 32px 20px;
  color: var(--ink-60);
  background: rgba(255, 253, 246, .68);
  border: 1px dashed var(--line);
  border-radius: 8px;
  text-align: center;
}

.workbench-state svg {
  color: var(--accent-strong);
}

.workbench-state strong {
  color: var(--ink);
  font-family: var(--font-s);
  font-size: 19px;
  font-weight: 900;
}

.workbench-state span {
  max-width: 42ch;
  font-size: 13px;
  line-height: 1.7;
}

.workbench-state.error svg {
  color: var(--rouge);
}

.workbench-state .command {
  margin-top: 7px;
}

.workbench-groups {
  display: grid;
  gap: 42px;
}

.workbench-group {
  border-top: 2px solid var(--ink);
}

.workbench-group-head {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 15px 0 13px;
}

.section-kicker {
  color: var(--accent-strong);
  font-family: var(--font-d);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .13em;
}

.workbench-group h2 {
  color: var(--ink);
  font-family: var(--font-s);
  font-size: 25px;
  font-weight: 900;
  letter-spacing: .04em;
}

.workbench-tools {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.workbench-tool {
  min-width: 0;
  min-height: 102px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 13px;
  padding: 18px;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  text-decoration: none;
  transition: border-color .25s var(--ease), box-shadow .25s var(--ease), transform .25s var(--ease);
}

.workbench-tool:hover {
  border-color: var(--accent);
  box-shadow: 0 16px 30px -24px rgba(73, 59, 44, .52);
  transform: translateY(-2px);
}

.workbench-tool:focus-visible,
.workbench-state .command:focus-visible {
  outline: 3px solid rgba(91, 106, 140, .38);
  outline-offset: 3px;
}

.workbench-tool-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: var(--cream);
  background: var(--tea);
  border-radius: 8px;
}

.workbench-tool-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workbench-tool-copy strong {
  overflow-wrap: anywhere;
  font-family: var(--font-s);
  font-size: 17px;
  font-weight: 900;
}

.workbench-tool-copy small {
  color: var(--ink-60);
  font-size: 12.5px;
  line-height: 1.65;
}

.workbench-tool > svg {
  color: var(--accent-strong);
}

@media (max-width: 767px) {
  .workbench-content {
    padding-bottom: 4px;
  }

  .workbench-groups {
    gap: 30px;
  }

  .workbench-group-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
    padding-top: 13px;
  }

  .workbench-group h2 {
    font-size: 23px;
  }

  .workbench-tools {
    grid-template-columns: 1fr;
  }

  .workbench-tool {
    min-height: 94px;
    padding: 15px;
  }
}
</style>
