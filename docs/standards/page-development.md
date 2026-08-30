# YuanHub 页面开发流程

本文是 YuanHub 新建页面时的权威开发流程。

## 1. 基本流程

新建页面只需要两个核心步骤：

1. 在 `YuanHub/src/pages/<模块>/` 下创建页面 `.vue` 文件。
2. 在 `YuanHub/src/router/routes.js` 中按照现有路由模板注册页面。

页面样式、配色和视觉元素同时必须遵守 [MaaYuan Share 设计规范](./design-system.md)。

## 2. 页面目录

页面统一放在：

```text
YuanHub/src/pages/<模块>/
```

现有示例包括：

- `YuanHub/src/pages/index.vue`
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
  <button style="width: 40px;height: 24px;line-height: 22px" @click="data = '111111'">
    {{ data }}
  </button>
</template>

<script setup>
import { ref } from 'vue'

const data = ref('')
</script>
```

示例只说明页面文件与 Vue 3 `<script setup>` 的基本形态；具体组件、样式和配色应优先遵循项目现有实现以及设计规范。

## 5. 变更检查

新增或调整页面前确认：

- 页面位于 `src/pages/<模块>/`。
- 路由已在 `src/router/routes.js` 注册。
- 页面视觉遵守 `design-system.md`。
- 没有为了新页面另建与现有路由体系重复的注册机制。
