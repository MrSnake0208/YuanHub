import { KeyRound, Link2, PackageOpen, ScanLine, ShieldCheck } from '@lucide/vue'
import {
  ADMIN_PERMISSIONS,
  canManageAnyFeedback,
  hasAnyAdminCapability,
  hasPermission
} from './authPermissions.js'

export const ADMIN_TOOL_GROUPS = Object.freeze([
  { key: 'feedback', label: '反馈工作区' },
  { key: 'content', label: '内容维护' },
  { key: 'platform', label: '平台设置' }
])

const ADMIN_TOOLS = Object.freeze([
  {
    key: 'feedback-manage',
    to: '/feedback/manage',
    label: '待处理反馈',
    description: '查看、回复和处理授权板块的反馈工单',
    group: 'feedback',
    icon: ShieldCheck,
    isVisible: canManageAnyFeedback
  },
  {
    key: 'feedback-access',
    to: '/feedback/admin',
    label: '反馈授权',
    description: '配置反馈通知接收人和工单处理范围',
    group: 'feedback',
    icon: Link2,
    isVisible: function (access) {
      return hasPermission(access, ADMIN_PERMISSIONS.FEEDBACK_ACCESS_MANAGE)
    }
  },
  {
    key: 'operator-catalog',
    to: '/operator/admin',
    label: '公共密探图鉴',
    description: '维护全站公共密探字典和导入校验数据',
    group: 'content',
    icon: ScanLine,
    isVisible: function (access) {
      return hasPermission(access, ADMIN_PERMISSIONS.OPERATOR_CATALOG_WRITE)
    }
  },
  {
    key: 'admin-roles',
    to: '/admin/roles',
    label: '角色管理',
    description: '管理平台管理员和超级管理员角色绑定',
    group: 'platform',
    icon: KeyRound,
    isVisible: function (access) {
      return hasPermission(access, ADMIN_PERMISSIONS.ROLE_MANAGE)
    }
  },
  {
    key: 'admin-audit',
    to: '/admin/audit',
    label: '审计记录',
    description: '查看角色和反馈授权的变更记录',
    group: 'platform',
    icon: PackageOpen,
    isVisible: function (access) {
      return hasPermission(access, ADMIN_PERMISSIONS.AUDIT_READ)
    }
  }
])

export function getVisibleAdminTools(access) {
  return ADMIN_TOOLS.filter(function (tool) { return tool.isVisible(access) })
}

export function getVisibleAdminToolGroups(access) {
  const visible = getVisibleAdminTools(access)
  return ADMIN_TOOL_GROUPS.map(function (group) {
    return {
      key: group.key,
      label: group.label,
      tools: visible.filter(function (tool) { return tool.group === group.key })
    }
  }).filter(function (group) { return group.tools.length > 0 })
}

export function hasManagementCapability(access) {
  return hasAnyAdminCapability(access)
}
