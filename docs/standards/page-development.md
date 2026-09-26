# YuanHub 页面开发流程

本文是 YuanHub 新建页面时的权威开发流程。

## 1. 基本流程

新建页面只需要两个核心步骤：

1. 在 `YuanHub/src/pages/<模块>/` 下创建页面 `.vue` 文件。
2. 在 `YuanHub/src/router/routes.js` 中按照现有路由模板注册页面。

页面样式、配色和视觉元素同时必须遵守 [MaaYuan Share 设计规范](./design-system.md)，所有页面与组件的跨视口行为必须遵守 [YuanHub 响应式开发规范](./responsive-development.md)。

任何页面不得以桌面端完成作为交付标准。开发过程中至少同时维护 390px 手机主基准与 1440px 桌面主基准，完成前按响应式规范的完整视口矩阵验收。

## 2. 页面目录

页面统一放在：

```text
YuanHub/src/pages/<模块>/
```

现有示例包括：

- `YuanHub/src/pages/today/index.vue`
- `YuanHub/src/pages/work/index.vue`
- `YuanHub/src/pages/work/detail.vue`
- `YuanHub/src/pages/tools/cart.vue`

例如材料价值页可放在：

```text
YuanHub/src/pages/material/value.vue
```

## 3. 路由注册

路由结构保持现有拆分：

- `YuanHub/src/router/routes.js`：路由表与顶部注释模板。
- `YuanHub/src/router/index.js`：创建路由实例并导入 `routes`。

新增页面时，在 `routes.js` 中按现有模板填写需要的 `path`、`text`、`name`、`display`、`module`、`icon`、`component`、`meta` 等字段。

## 4. 页面文件示例

```vue
<template>
  <button class="page-demo-button" type="button" @click="data = '111111'">
    {{ data || '更新' }}
  </button>
</template>

<script setup>
import { ref } from 'vue'

const data = ref('')
</script>

<style scoped>
.page-demo-button {
  min-height: 44px;
  padding: 8px 14px;
}
</style>
```

示例只说明页面文件与 Vue 3 `<script setup>` 的基本形态；具体组件、样式和配色应优先遵循项目现有实现以及设计规范。

## 5. 变更检查

新增或调整页面前确认：

- 页面位于 `src/pages/<模块>/`。
- 路由已在 `src/router/routes.js` 注册。
- 页面视觉遵守 `design-system.md`。
- 页面响应式行为遵守 `responsive-development.md`，并为手机、平板、桌面设计同一核心任务的可用路径。
- 已检查 320 / 390 / 430 / 768 / 1024 / 1440px 视口；复杂移动交互额外检查手机横屏。
- 没有因为移动端与桌面端布局不同而复制第二套业务状态、权限或 API 逻辑。
- 没有为了新页面另建与现有路由体系重复的注册机制。
