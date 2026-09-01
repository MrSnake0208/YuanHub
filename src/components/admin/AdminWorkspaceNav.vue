<template>
  <nav class="admin-workspace-nav" aria-label="管理工作区导航">
    <router-link
      v-if="canManage"
      class="workspace-home"
      to="/manage"
      :class="{ active: active === 'workbench' }"
    >
      <LayoutDashboard :size="17" aria-hidden="true" />
      <span>管理工作台</span>
    </router-link>

    <div v-for="group in visibleGroups" :key="group.key" class="workspace-group">
      <span class="workspace-group-label">{{ group.label }}</span>
      <router-link
        v-for="tool in group.tools"
        :key="tool.key"
        class="workspace-link"
        :to="tool.to"
        :class="{ active: active === tool.key }"
        :aria-label="tool.label + '：' + tool.description"
      >
        <component :is="tool.icon" :size="16" aria-hidden="true" />
        <span>{{ tool.label }}</span>
      </router-link>
    </div>

    <router-link class="workspace-account" to="/user/profile">
      <UserRound :size="16" aria-hidden="true" />
      <span>个人中心</span>
    </router-link>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { LayoutDashboard, UserRound } from '@lucide/vue'
import { auth } from '@/store/auth.js'
import { getVisibleAdminToolGroups, hasManagementCapability } from '@/utils/adminTools.js'

defineProps({
  active: { type: String, default: '' }
})

const canManage = computed(function () {
  return hasManagementCapability(auth.adminAccess)
})
const visibleGroups = computed(function () {
  return getVisibleAdminToolGroups(auth.adminAccess)
})
</script>

<style scoped>
.admin-workspace-nav {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 1px;
  margin: 24px 0 38px;
  overflow: hidden;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 8px;
}

.admin-workspace-nav a,
.workspace-group-label {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 13px;
  color: var(--ink-60);
  background: var(--surface);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.3;
  text-decoration: none;
  transition: color .25s var(--ease), background-color .25s var(--ease);
}

.admin-workspace-nav a:hover,
.admin-workspace-nav a.active,
.admin-workspace-nav a.router-link-active {
  color: var(--ink);
  background: var(--yellow);
}

.workspace-home {
  color: var(--cream) !important;
  background: var(--tea) !important;
}

.workspace-home:hover,
.workspace-home.active,
.workspace-home.router-link-active {
  color: var(--cream) !important;
  background: var(--accent) !important;
}

.workspace-group {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  background: var(--surface);
}

.workspace-group-label {
  color: var(--accent-strong);
  background: var(--cream);
  font-size: 11px;
  letter-spacing: .08em;
  white-space: nowrap;
}

.workspace-link {
  border-left: 1px solid var(--line);
}

.workspace-account {
  margin-left: auto;
  border-left: 1px solid var(--line);
}

@media (max-width: 767px) {
  .admin-workspace-nav {
    align-items: stretch;
    flex-direction: column;
    margin: 12px 0 28px;
  }

  .admin-workspace-nav a,
  .workspace-group-label {
    min-height: 46px;
  }

  .workspace-group {
    display: flex;
    flex-direction: column;
  }

  .workspace-group-label {
    justify-content: flex-start;
  }

  .workspace-link {
    border-top: 1px solid var(--line);
    border-left: 0;
  }

  .workspace-account {
    margin-left: 0;
    border-left: 0;
  }
}

</style>
