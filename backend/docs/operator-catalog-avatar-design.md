# 密探公共图鉴 · 头像上传设计

状态：设计中（未实现）
适用范围：`/v1/admin/operator-catalog/**`（管理员）、`/v1/operator/catalog`（公共图鉴）、
`YuanHub` 前端「密探公共图鉴管理端」页面
关联契约：`~/YuanHub/docs/api-contract.md`；管理员目录语义见
`docs/operator-subaccounts-implementation-plan.md` §6.5

## 1. 目标

1. 管理员（`status >= 2`）可在「密探公共图鉴管理端」为每条密探上传 / 替换 / 删除头像。
2. 头像以 **webp 文件** 形式持久化在磁盘上（对齐既有约定：老前端 `public/avatar/*.webp`，
   生产走 CDN），而不是外链、数据库 blob 或前端源码内嵌。
3. 公共图鉴 `GET /v1/operator/catalog`（无需登录，回答「有哪些密探、长什么样」）能按密探拿到
   头像地址，前端直接 `<img>` 渲染；养成页、管理页均能展示。
4. 改动即时生效、可幂等覆盖；删除密探目录时头像一并清理。
5. 老数据兼容：没有任何画像的密探维持现状（前端用首字占位图兜底），不强制迁移。

## 2. 现状盘点（本次改动起点）

| 层 | 现状 |
|---|---|
| 字典字段 | `OperatorCatalogEntity` 无 `avatar` 字段；`OperatorCatalogEntryResponse`、`OperatorCatalogWriteRequest` 同样没有 |
| 管理端 UI | `YuanHub/src/pages/operator/admin.vue` 列表/弹窗用首字占位图（`monogram`），无任何图片字段 |
| 养成页 UI | `YuanHub/src/pages/operator/index.vue` 密探卡为「密」字印章 + 首字占位 |
| 后端文件能力 | 无上传接口、无用户内容静态托管；但 `application.yml` 已开 `spring.servlet.multipart.max-file-size: 500KB` |
| 既有头像约定 | 老前端 `public/avatar/{name}.webp` 本地静态文件；生产 CDN `cos.yituliu.cn/image2/avatar/{charId}.png`；`YuanHub` 侧 `src/data/avatars.js` 仅 12 位密探映射到 BWiki 外链 PNG，且只用于作业卡静态样例数据，与公共图鉴无关联 |

结论：头像功能是全新铺设，文件摆放位置与数据契约由本设计一次性定死，不留后续改契约的余地。

## 3. 总体决策与领域边界

### 3.1 头像属于「公共图鉴 · 长什么样」，归属 `operator_catalog` 字典

README 将公共 API 定位为「有哪些密探、长什么样」，头像天然是这个「长什么样」的一部分，
因此：

- 头像挂在字典条目上，随公共图鉴对外发布，**上传后即对全站公开**（管理员上传即公布，文档明示此语义）；
- 不由个人子账号、个人养成数据写入/覆盖；
- 删除目录条目时头像随之清理。

### 3.2 文件放哪里：后端本地持久目录 + 静态映射（推荐）

```
文件落地：  <share.avatar.dir>/avatar/{operatorId}.webp
           例：./data/avatar/char_001_yangxiu.webp（Docker 下挂 volume 保持久）
对外 URL：  {share.info.public-base-url}/avatar/{operatorId}.webp
           例：https://hub.maayuan.fun:16666/avatar/char_001_yangxiu.webp
字典字段：  operator_catalog.avatar = "/avatar/char_001_yangxiu.webp"（相对路径，非完整 URL）
前端渲染：  <img :src="API_BASE + r.avatar">
```

为什么是「后端落盘」而不是别的方案：

| 方案 | 结论 | 理由 |
|---|---|---|
| 后端目录 + 静态映射 | ✅ 推荐 | 上传是写动作，后端天然可写；公开读走静态资源零业务代码；目录/接口都能挂操作者既有鉴权；`multipart` 已开可直接用 |
| 前端 `public/avatar/` | ❌ 不选 | 前端生产是构建产物只读部署，`public/` 会打进 `dist`、运行时写不进；适合只读静态资源，不适合上传落点 |
| COS / 对象存储 | 🔜 演进 | 与老项目 CDN 对齐、有边缘缓存；但需引入 COS SDK + 密钥，本地开发无 COS 测不了。对外契约固定为「字典里一个 avatar 路径」后，换成 COS 只改换出层，前端零改动 |

### 3.3 avatar 字段语义：存相对路径，不存完整 URL

理由：

- 部署环境可迁移：`share.info.public-base-url` 本地/生产不同，存相对路径由调用方拼，天然适配；
- CDN 演进时无需改库：换出层把 `/avatar/**` 背后换成 COS 回源或直接转发即可。

## 4. 数据模型

### 4.1 `OperatorCatalogEntity` 新增字段

```kotlin
// 密探头像 webp 相对路径（如 "/avatar/char_001_yangxiu.webp"）；未上传为 null。
val avatar: String? = null,
```

注意：`@JsonProperty("id")`、SNAKE_CASE 序列化等既有约定不变；`avatar` 本身无下划线，无需额外注解。

### 4.2 头像的写入入口受控，不进通用写请求

`OperatorCatalogWriteRequest` **不加 `avatar` 字段**。理由：

1. 头像只能由专用上传接口产生/替换、专用删除接口清除，避免出现「随意写任意 URL / 任意字符串」
   的宽口，保证 `avatar` 的来源有限且内容真实存在；
2. 管理端编辑表单无需处理 avatar 文本，交互上是「上传 / 删除头像」两个动作。

### 4.3 整条覆盖更新的坑（必须处理）

`OperatorCatalogService.update()` 当前用 `request.toEntity(...)` **整条覆盖**，只保留
`id / createdAt / catalogVersion`。若 avatar 不进写请求，**任一次普通编辑保存都会把已上传的
头像冲成 `null`**。因此：

- `update()` 映射时**显式保留 `existing.avatar`**（仅当请求不携带 avatar 语义时永远保留）；
- `create()` 初始为 `null`；
- `avatar` 只经下述专用接口被赋值/清除。

## 5. 后端设计

### 5.1 上传接口（新增）

```
PUT /v1/admin/operator-catalog/{operatorId}/avatar
Content-Type: multipart/form-data
字段: file   # 头像文件
```

- 鉴权：与现有管理端点一致（`requireAdmin()`，`status >= 2`），否则 403 `forbidden`；
- 校验（失败统一走 `OperatorErrorResponse`，沿用现错误语义）：
  - `operatorId` 不存在 → 404 `operator_not_found`；
  - 文件为空 / 非 `image/webp` → 422 `schema_validation_failed`（错误信息说明需 webp）；
  - 大小超过 `spring.servlet.multipart.max-file-size`（当前 500KB）→ 由 Spring 直接拒绝；
  - `operatorId` 后端侧同样用 `^char_[A-Za-z0-9_]+$` 校验（前端已有，后端 `PathVariable` 再验一遍，
    **文件名 = operatorId，服务端拼路径，客户端文件名一律忽略** → 路径穿越不可达）；
- 落盘：写到 `<avatar.dir>/avatar/{operatorId}.webp`；**先写 `.tmp` 再原子 `rename`**，
  避免半写文件被并发读到；
- 成功后：`entity.avatar = "/avatar/{operatorId}.webp"` 并保存（同时按现逻辑使 SP 反向索引、
  目录版本失效）；
- 返回：`ApiResult<OperatorCatalogEntity>`（或最小化的头像路径），前端回填列表；
- **幂等**：同 id 重传即覆盖，无需先删后传。

### 5.2 删除接口（新增）

```
DELETE /v1/admin/operator-catalog/{operatorId}/avatar
```

- 鉴权同上；
- 清 `entity.avatar`（置 null）+ 删除磁盘文件（不存在则忽略）；
- 目录条目删除（现有 `DELETE .../operator-catalog/{operatorId}`）在 service 里**级联清理头像文件**，
  保证不留孤儿（清理失败仅遗留孤儿文件，无害，不为此建清扫任务）。

### 5.3 静态映射

在现有 `WebMvcConfigurer`（同 `CorsConfig` 位置）新增：

```
/avatar/**  →  file:{share.avatar.dir}/avatar/
```

- 头像路径是**公开读**：图鉴本来就无需登录，头像对全站公开（见 3.1）；
- 缓存：Spring 静态资源默认带 `Last-Modified` 协商缓存；由于文件名不含版本（覆盖式更新），
  浏览器本地强缓存可能短暂滞留旧图，可接受（下一次协商即刷新）。如需更强一致性，
  前端 `img src` 可拼 `?v=catalogVersion`——列为可选优化，不做默认要求。

### 5.4 配置

```
share:
  avatar:
    dir: ${SHARE_AVATAR_DIR:./data/avatar}   # application.yml（生产用环境变量/挂载卷）
```

- `application-local.yml` 同字段指向本机目录即可；
- Docker：该目录挂 named volume，重建容器不丢。

### 5.5 一致性

`GET /v1/operator/catalog` 直接查库（本模块未使用 `@Cacheable` 缓存层），因此上传/删除头像后
不存在需要逐出（evict）的目录缓存，改动即时反映到公共图鉴；静态资源侧由 Spring 的
`Last-Modified` 协商缓存兜底一致性。

### 5.6 存量头像回填（把已放入目录的文件关联到字段）

`avatar` 字段默认只由上传/删除接口维护，但允许运维**直接把 `{operatorId}.webp` 放进
`share.avatar.dir` 目录**。为让这类"现货文件"无需逐条上传即可发布，`OperatorCatalogService`
在播种初始化（`ensureSeeded`，进程内首次访问一次）时执行回填：

- 扫描目录中的 `*.webp`，按 `{operatorId}.webp` 提取 id；
- 仅回填字典中 `avatar == null` 的行（`/avatar/{id}.webp`）；
- 不覆盖已上传头像、不重插被删除的行；临时文件/非法命名忽略。

幂等：重启后端即完成一次关联；后续再放新文件，重启后自动补。设计文档第 3 节"文件即
真相"的头像数据源由此闭合。

## 6. 前端设计（YuanHub）

### 6.1 API 层

- `src/api/request.js`：导出 `API_BASE`（已有）与 `avatarUrl(path)` —— `path.startsWith('http') ? path : API_BASE + path`；
- `src/api/operator.js` 新增：
  - `uploadOperatorAvatar(operatorId, file)` → `PUT .../avatar`，`FormData`；
  - `deleteOperatorAvatar(operatorId)` → `DELETE .../avatar`。

### 6.2 管理端 `src/pages/operator/admin.vue`

- 列表「密探」列：`r.avatar` 存在时 `<img :src="avatarUrl(r.avatar)">` 渲染小图，否则保留首字占位；
- 编辑弹窗新增「头像」区：
  - 预览当前头像（无则占位）；
  - 文件选择（`accept="image/webp"`，前端提示 ≤500KB）；
  - 「上传」按钮（独立动作，上传即存、即时生效，不依赖表单「保存」）；上传成功回填 `rows`；
  - 「删除头像」按钮（同样独立动作）。
- 上传动作与表单保存**解耦**：避免把二进制上传并进整条覆盖的 JSON 保存流，天然规避 4.3 的坑。

### 6.3 渲染侧

- `src/pages/operator/index.vue` 密探卡：`avatar` 存在显示图片，否则维持「密」+ 首字占位；
  由前端在构成目录条目时透传 `avatar`。
- `data/avatars.js`（BWiki 外链，静态样例）**不动**。

## 7. 与既有约束的对齐

- 响应字段遵循 SNAKE_CASE 全局约定（`avatar` 仅单字段，无影响）；
- 统一 `ApiResult<T>` 包装 + `OperatorErrorResponse` 错误语义；
- 权限沿用 `UserService.hasAdminPrivileges` + `OperatorAdminResponses` 文档注解覆盖新端点；
- 目录版本号 (`catalogVersion`)：上传/删除头像不算「目录内容」变更，**不 bump 版本号**，
  只做缓存 evict；只有增删改条目本身才走现有 `nextCatalogVersion()`。

## 8. 安全与限制（不扩大防御面）

- 仅接受指定 `operatorId` 的 multipart；文件名服务端生成 → 路径穿越不可达；
- 类型白名单 webp、大小上限 500KB（已由 multipart 配置约束）；
- 不做内容哈希/去重：跨密探头像去重无实际收益（AGENTS：避免无意义指纹）；
- 上传即公开（见 3.1），不额外加防盗链之类的防御（本仓库定位为合作运营者场景）。

## 9. 影响面与改动清单

后端（BackEndV3-Share）：
1. `OperatorCatalogEntity.kt`：新增 `avatar: String?`；
2. `OperatorCatalogService.kt`：`update()` 保留已有 avatar；新增 `setAvatar` / `clearAvatar`；
   `delete()` 级联清理头像文件；上传后 evict 目录缓存；
3. `AdminOperatorCatalogController.kt`：新增 `PUT /{operatorId}/avatar`、`DELETE /{operatorId}/avatar`；
4. 新增静态资源映射（`WebMvcConfigurer`）+ `share.avatar.dir` 配置 + `avatarUrl`/落盘工具；
5. `OperatorAdminResponses.kt`：新端点补 OpenAPI 文档注解；
6. `OperatorResponses.kt`：`OperatorCatalogEntryResponse.of()` 带上 `avatar`。

前端（YuanHub）：
1. `src/api/request.js`：导出 `avatarUrl`；
2. `src/api/operator.js`：上传/删除头像两个接口封装；
3. `src/pages/operator/admin.vue`：列表图 + 弹窗上传/预览/删除；
4. `src/pages/operator/index.vue`：展示头像（无则占位）。

测试：
- 后端单测：上传成功、非 webp 422、超大小拒绝、404、非管理员 403、同 id 覆盖幂等、
  普通编辑不冲掉头像（4.3 回归项）、删除目录清理文件、目录缓存 evict；
- 前端按现有项目风格做最小验证，不新增重型测试设施。

## 10. 演进：切 CDN

对外契约固定为「字典里一个 `/avatar/...` 相对路径 + `/avatar/**` 可公开 GET 的文件」。
将来要上 `cos.yituliu.cn` 等 CDN 时：

- 上传落点从本地目录换成 COS；`avatar` 字段改为完整 URL（或保留相对路径、由网关层转 CDN 域名）；
- 静态映射换成「CDN 域名直出 / 对象存储回源」；
- 前端契约不变，`avatarUrl(path)` 已兼容绝对 URL。

## 11. 验收标准

1. 管理员在管理页上传 webp → 公共图鉴 `GET /v1/operator/catalog` 返回该密探 `avatar` 路径 →
   匿名 `GET {public-base-url}/avatar/{operatorId}.webp` 返回 200 的 webp；
2. 同 id 重传覆盖生效；「删除头像」清字段且文件消失；
3. 普通编辑（改名称等）保存后头像**不被冲掉**；
4. 删除密探目录后，对应头像文件被清理；
5. 非管理员访问上传/删除接口 403；不存在的 operatorId 404；
6. 未上传头像的密探：`avatar` 为 null，管理页/养成页继续走首字占位，旧数据不破。
