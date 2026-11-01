# YuanHub 反馈系统“上传截图”功能规划

> 当前规则（2026-10-15）：每条消息最多 10 个附件，图片与普通文件合计。下文的“3 张/3 个”为历史方案；当前接口说明见 `feedback-workflow-api.md`。

> 状态：前期规划完成，待实现
>
> 规划日期：2026-08-30
>
> 目标后端：`BackEndV3-Share`
>
> 关联前端：`YuanHub`
>
> 本文只定义实现方案和验收边界，本轮不修改业务代码。

## 1. 结论

当前代码已经具备截图上传的后端主链路，不需要新建 `screenshot` 集合或另一套附件模型：

- `POST /v1/media/upload` 已提供登录用户上传图片的能力。
- `MediaAsset` 已在 `HubBackend.hub_media` 保存上传者、MIME、大小和存储路径。
- `POST /v1/reports` 和 `POST /v1/reports/{id}/messages` 已接受 `media_ids`，并校验媒体属于当前用户且未删除。
- `FeedbackMessage.images` 已保存图片引用，详情接口也已经返回图片数组。
- YuanHub 已有媒体 API 封装和详情图片渲染，但新建反馈和回复表单还没有文件选择、预览和上传调用。

因此，本需求应按“补齐现有纵向链路”实施：后端做必要的完整性和错误处理加固，前端接入两步上传流程，最后做接口和页面联调。

### 1.1 目标流程

```text
选择图片
  -> 前端本地校验并预览
  -> POST /v1/media/upload（每个文件一次请求）
  -> 收集返回的 data.id
  -> POST /v1/reports 或 POST /v1/reports/{id}/messages（提交 media_ids）
  -> 详情接口返回 messages[].images，页面展示图片
```

上传接口和工单接口分离，工单正文仍使用 JSON；前端不能把文件内容、客户端文件名或 URL 直接写入工单请求来替代 `media_ids`。

## 2. 当前实现基线

| 能力 | 当前实现 | 证据与缺口 |
| --- | --- | --- |
| 上传入口 | JWT 用户调用 `POST /v1/media/upload`，multipart 字段为 `file` | `src/main/kotlin/com/lhs/share/hub/controller/media/MediaController.kt:25-46`；缺少专门的 multipart 错误响应测试 |
| 文件存储 | 写入 `${share.media.dir}/{medId}.{ext}`，元数据写入 `hub_media` | `src/main/kotlin/com/lhs/share/hub/service/media/MediaStorageService.kt:48-105`；当前是直接写正式文件，Mongo 保存失败时可能留下孤儿文件 |
| 类型与大小 | 白名单为 JPEG/PNG/WebP；服务层默认 10 MiB | `MediaStorageService.kt:30-38,54-70`；类型校验只信任 `MultipartFile.contentType` |
| 工单引用 | 创建和追加均最多 3 个媒体 ID，校验存在、上传者和 `deletedAt` | `src/main/kotlin/com/lhs/share/hub/service/report/FeedbackReportService.kt:342-353,475-501`；应补充顺序和重复 ID 规则 |
| 数据模型 | `FeedbackTicket.messages[].images[]` 保存 `id` 和 `url`；`MediaAsset` 保存文件元数据 | `src/main/kotlin/com/lhs/share/hub/repository/entity/FeedbackMessage.kt:15-33`、`MediaAsset.kt:16-56`；无需新建截图字段 |
| 静态访问 | `/media/**` 映射本地目录，并在 Security 中 `permitAll` | `src/main/kotlin/com/lhs/share/config/MediaStaticResourceConfig.kt:15-21`、`SecurityConfig.kt:97-117`；当前 URL 可被匿名访问 |
| URL 响应 | 上传响应返回 `publicBaseUrl + /media/...`；消息实体保存 `/media/...` 相对路径 | `src/main/kotlin/com/lhs/share/hub/controller/media/response/MediaUploadResponse.kt:29-35`、`FeedbackReportService.kt:174-180,347-353`；跨域部署时消息图片可能解析到前端域名 |
| 全局上传限制 | Spring multipart 配置为 12 MB，业务服务限制为 10 MiB | `src/main/resources/application.yml:4-9`、`src/main/kotlin/com/lhs/share/config/external/ShareProperties.kt:135-144`；两层限制语义需要写清并测试 |
| YuanHub API | 已有 `uploadMedia()`，并能发送 `media_ids` | `YuanHub/src/api/media.js:5-13`、`YuanHub/src/api/feedback.js:8-25,169-179` |
| YuanHub 页面 | 详情已渲染 `messages[].images`；新建和回复表单仍只提交文本 | `YuanHub/src/components/feedback/FeedbackTicketDetail.vue:17-30`、`YuanHub/src/pages/feedback/index.vue:142-174,376-423`、`YuanHub/src/pages/feedback/manage.vue:114-124` |
| 后端测试 | 反馈测试主要覆盖类型/板块规范化；未找到媒体服务、媒体 Controller 或静态资源测试 | `src/test/kotlin/com/lhs/share/hub/service/report/FeedbackReportServiceTest.kt:19-105` |

## 3. 目标与非目标

### 3.1 本期目标（P0）

1. 登录用户可以在新建反馈时附带 0 至 3 张截图。
2. 反馈提交人和有权限的管理员可以在追加消息时附带 0 至 3 张截图。
3. 后端只接受 JPEG、PNG、WebP，单文件业务上限为 10 MiB。
4. 每个媒体只能由上传者绑定到工单消息；不能通过篡改 `media_ids` 跨用户引用。
5. 图片引用顺序与用户选择顺序一致，失败时返回稳定的 `ApiResult` 错误响应。
6. 已有纯文本反馈、权限、状态流转、通知和旧工单数据不回归。

### 3.2 本期不做

- 不增加视频、GIF、压缩包或其他文件类型。
- 不增加独立的截图表、消息附件表或新的工单接口。
- 不引入 OSS/S3/COS；本期继续使用 `share.media.dir` 本地持久化目录。
- 不做 OCR、图片裁剪、缩略图、内容安全审核或敏感信息识别。
- 不在本期实现孤儿媒体定时回收和用户侧媒体历史管理；上传失败的即时补偿见第 5 节，完整生命周期列为 P1。

## 4. 冻结的接口与数据契约

### 4.1 `POST /v1/media/upload`

- 认证：必须携带 JWT；上传者从认证上下文取得，前端不能提交 `owner_user_id`。
- Content-Type：`multipart/form-data`。
- 文件字段：`file`。
- 支持格式：`image/jpeg`、`image/png`、`image/webp`。
- 单文件业务大小：`<= 10 MiB`，以服务层读取的字节数为准。
- 成功响应：继续使用 `ApiResult<MediaUploadResponse>`，实际 JSON 字段为 `status_code`、`message`、`data`。
- `data` 字段：

  ```json
  {
    "id": "med_xxx",
    "url": "https://api.example.test/media/med_xxx.webp",
    "mime": "image/webp",
    "size": 12345,
    "created_at": "2026-08-30T00:00:00Z"
  }
  ```

- `url` 使用 `share.info.public-base-url` 生成绝对 URL；文件名始终由服务端生成，不能使用客户端文件名。
- P0 的“内容真实性”边界定义为**文件签名（magic bytes）与声明 MIME 一致性校验**：JPEG、PNG、WebP 必须命中对应文件签名；本期不额外承诺完整图片解码、像素级合法性或内容安全检查。
- 空文件、无法识别类型、文件签名与声明 MIME 不匹配时返回 400；超过 multipart 框架上限时 HTTP 状态必须为 413，错误体仍使用现有 `ApiResult`，不能降级成 500。

### 4.2 工单创建与消息追加

`POST /v1/reports` 和 `POST /v1/reports/{id}/messages` 保持现有 JSON 契约：

```json
{
  "content": "问题描述或补充说明",
  "media_ids": ["med_xxx", "med_yyy"]
}
```

创建接口还包含现有的 `type`、`category` 和 `client_info_consent` 字段；追加接口的权限和状态规则不变。

后端必须在创建和追加两条路径复用同一套媒体校验：

- P0 保持现有正文语义：`content` 仍按当前业务规则要求为非空有效文本，图片只是正文附件，不能通过仅提交 `media_ids` 创建“纯图片消息”。
- `media_ids` 数量为 0 至 3。
- 同一请求中的 ID 不重复；重复 ID 返回明确的 400。
- 每个 ID 都存在、`deleted_at` 为空，且 `owner_user_id` 等于当前认证用户。
- 按 `media_ids` 输入顺序构造 `messages[].images`，不能依赖 Mongo `findAllById` 的返回顺序。
- 工单仍只保存媒体引用和访问 URL，不把图片二进制嵌入 `feedback_tickets`。

### 4.3 图片 URL 兼容决策

P0 统一对外返回可直接使用的绝对 URL：

- `MediaAsset.storagePath` 继续保存相对路径 `/media/...`，不写入环境相关的域名，因此不需要 Mongo 数据迁移。
- `MediaUploadResponse.url` 保持现有绝对 URL 行为。
- `FeedbackMessageResponse.ImageInfo.url` 改为使用同一个 `public-base-url` 拼成绝对 URL。
- YuanHub 将图片 URL 当作不透明 URL 使用，不自行重复拼接 API 地址；旧客户端仍可使用绝对 URL。

这样可以覆盖 `VITE_API_BASE` 指向独立后端域名的部署方式，同时不改变数据库中的历史路径。若未来需要私有图片，再单独设计鉴权下载接口，不能在本需求中仅修改 `permitAll` 而破坏现有页面。

### 4.4 图片访问边界

> **产品边界确认（P0）：反馈截图不具备访问权限隔离能力。** 工单详情本身仍受 JWT 和工单权限保护，但一旦图片 URL 被获得，`/media/**` 当前不会再次校验工单可见权限。

P0 保留现有 `GET /media/**` 匿名可读行为，原因是当前前端直接使用图片 URL，且这属于已有公开静态资源契约。需要在 API 文档和部署说明中明确：

- 上传接口和反馈接口仍然必须 JWT。
- 图片 URL 一旦被获得即可访问，不把它当作工单权限控制。
- `med_<16 hex>` 只作为不可读文件名和降低偶然碰撞的标识，不是授权凭证。

如果产品要求截图只对提交人和获授权管理员可见，应另立 P1：增加受保护的媒体读取 Controller，按工单可见权限检查后返回文件或短期 URL，并移除该路径的 `permitAll`；在此之前不宣称截图具备私密性。

## 5. 后端实施计划（P0）

### 5.1 媒体存储完整性

修改 `MediaStorageService`，但保持现有服务边界和返回模型：

1. 保留空文件、MIME 白名单和 10 MiB 字节数校验。
2. 增加文件签名校验：验证 JPEG、PNG、WebP 的 magic bytes 与声明 MIME 匹配；拒绝仅通过伪造 `Content-Type` 的明显非图片文件。校验逻辑不使用客户端扩展名决定类型。本期不把“文件签名正确”表述为“图片一定可完整解码”，也不为此额外引入完整解码链路。
3. 使用临时文件写入，成功后移动到服务端生成的正式文件名；Mongo `save` 失败时删除本次产生的临时/正式文件并保留原始异常语义。
4. 保留原始文件名仅作元数据，不参与路径拼接；不增加无实际消费方的 checksum 或 hash 字段。
5. 明确 Spring multipart 的 12 MB 是请求封套上限，业务文件上限仍为 10 MiB；保证 10 MiB 文件加 multipart 开销不会被框架提前拒绝。若实际运行验证证明 `server.tomcat.max-http-form-post-size=30KB` 影响 multipart，再只调整相关配置，不扩大业务文件限制。

### 5.2 统一错误响应

在 `GlobalExceptionHandler` 增加 multipart 超限/解析失败的专门处理，至少覆盖 Spring 的 `MaxUploadSizeExceededException` 或其实际包装异常：

- 文件超过 multipart 框架限制：**HTTP 413 Payload Too Large**；响应体仍为现有 `ApiResult`，其中 `status_code` 按项目现有 HTTP 状态映射规则与该 413 响应保持一致，并由契约测试固定。
- multipart 请求本身格式错误、缺少必要文件字段或解析失败但并非大小超限：400。
- 空文件、类型不支持、文件签名与声明 MIME 不匹配：400。
- 磁盘或元数据写入失败：500，不能把内部堆栈返回给前端。

错误仍使用现有 `ApiResult`，不新增一套错误 JSON。实现时以运行时抛出的实际异常类型为准，先区分“大小超限”和“普通 multipart 解析失败”，避免把所有 multipart 异常统一映射成 413，也避免仅添加永远不会命中的处理器。

### 5.3 媒体引用与响应

修改 `FeedbackReportService` 和相关响应转换：

- 抽出共享的媒体 ID 校验结果使用方式，保证创建/追加规则一致。
- 按请求 ID 顺序重排 `MediaAsset`，拒绝重复 ID。
- 保持 `FeedbackMessageImage` 的持久化结构不变。
- 在详情响应中统一图片 URL：`/media/...` 使用 `public-base-url` 转换为绝对 URL；已经是 `http://` 或 `https://` 的绝对 URL 原样返回，禁止重复拼接；空值或历史异常值不得导致整个工单响应失败，应按现有响应模型过滤或保留为不可加载图片。
- 不改变工单权限：普通用户只能看自己的工单；管理员仍按解析后的 `category` 管理范围查看和操作。

### 5.4 配置与部署

- 继续支持 `SHARE_MEDIA_DIR`，生产环境必须把该目录挂载到持久卷，不能依赖容器可写层。
- 校准 `share.media.max-size` 的注释、配置文档和 Spring multipart 配置，统一使用 MiB/MB 的表述。
- 校准 `SHARE_PUBLIC_BASE_URL`，确保它是浏览器可以访问的后端基地址，且不会带重复 `/`。
- 不把用户上传文件放入 Git、classpath 或前端构建产物。
- OpenAPI 以运行时 Controller 为准生成；不手工伪造整份过期的静态 `backend-openapi.json`。

## 6. YuanHub 接入计划

后端契约稳定后，前端按现有 API 封装接入，不改变反馈业务接口的语义。

### 6.1 新建反馈

修改 `YuanHub/src/pages/feedback/index.vue`：

- 增加图片选择控件，`accept` 限定 JPEG/PNG/WebP，最多 3 张。
- 选择后只保存浏览器内的 `File` 和预览 URL；支持预览、移除和重新选择。若使用 `URL.createObjectURL()`，移除图片、重新选择以及组件卸载时必须调用 `URL.revokeObjectURL()` 释放旧预览 URL。
- P0 按用户选择顺序**串行**调用 `uploadMedia()`：前一张成功后再上传下一张，收集每个响应的 `data.id`，全部成功后再调用 `createFeedback({ ..., mediaIds })`。最多仅 3 张图片，优先减少部分失败时产生的孤儿媒体，不在本期使用并发上传优化。
- 前端可提前检查类型和 10 MiB 大小，但后端校验是最终边界。
- 上传中和创建中锁定提交操作；任一上传失败时停止创建并展示错误。

### 6.2 追加消息

修改 `YuanHub/src/pages/feedback/index.vue` 和 `manage.vue` 的回复编辑区：

- 用户追加和管理员回复共用同一套图片选择/预览/上传逻辑。
- `appendFeedbackMessage()` 只传 `content` 和 `media_ids`。
- 已解决或已驳回工单沿用现有禁用规则，不允许仅通过上传图片绕过状态校验。

### 6.3 图片展示

- `FeedbackTicketDetail.vue` 继续渲染 `messages[].images`，将后端返回的 `url` 视为完整地址。
- 图片加载失败要有可理解的占位/错误状态，不影响文字时间线和回复操作。
- 前端不显示或提交 `owner_user_id`、存储路径等内部字段。

### 6.4 两步上传的失败边界

本期前端只在用户点击提交/发送时上传，取消表单不会产生远程媒体。上传采用顺序串行策略，因此某张失败后后续图片不再上传，以尽量减少孤儿媒体。仍可能出现“前面部分媒体已上传、后续上传或工单创建失败”的孤儿媒体：

- P0 后端保证 Mongo 保存失败时尽力删除当前上传产生的文件。
- P0 不承诺跨进程崩溃、网络断开或用户关闭页面后的回收。
- P1 增加仅上传者可用的未绑定媒体删除/清理方案，并为已绑定媒体保留引用保护；在此之前不要让前端依赖不存在的删除接口。

## 7. 代码与测试清单

### 7.1 后端文件

预计修改或新增：

```text
src/main/kotlin/com/lhs/share/hub/service/media/MediaStorageService.kt
src/main/kotlin/com/lhs/share/hub/controller/media/MediaController.kt
src/main/kotlin/com/lhs/share/hub/service/report/FeedbackReportService.kt
src/main/kotlin/com/lhs/share/hub/controller/report/response/FeedbackReportResponse.kt
src/main/kotlin/com/lhs/share/handler/GlobalExceptionHandler.kt
src/main/kotlin/com/lhs/share/config/external/ShareProperties.kt
src/main/resources/application.yml

src/test/kotlin/com/lhs/share/hub/service/media/MediaStorageServiceTest.kt
src/test/kotlin/com/lhs/share/hub/service/report/FeedbackReportServiceTest.kt
src/test/kotlin/com/lhs/share/openapi/MediaControllerContractTest.kt
```

`MediaAsset`、`FeedbackMessage`、`MediaAssetRepository` 和静态资源映射原则上复用现有实现；只有在测试证明需要时才改动，避免无关重构。

### 7.2 最小后端测试集

媒体存储：

- 合法 JPEG、PNG、WebP 上传成功，保存正确 MIME、大小、路径和 owner。
- 空文件、未允许 MIME、伪造 `Content-Type`、文件头与 MIME 不匹配、超过 10 MiB 被拒。
- Mongo 保存抛错时临时文件和正式文件不会被本次上传遗留。
- 客户端文件名包含路径字符时，落盘路径仍只使用服务端生成 ID。

工单引用：

- 创建反馈附带 1 至 3 个媒体后，首条消息按请求顺序保存图片。
- 追加消息附带媒体后，管理员和提交人都能按既有权限完成操作。
- 第 4 张、重复 ID、缺失 ID、已删除媒体和其他用户媒体分别被拒。
- `RESOLVED`/`DISMISSED` 工单不能通过附图追加消息。
- 详情响应的图片 URL 是绝对 URL，历史存储的相对 `storagePath` 不变。

Controller/配置：

- 未认证用户不能上传；上传成功响应包含 `ApiResult.data.id/url`。
- multipart 超限返回 413，错误结构仍为 `ApiResult`。
- `/media/**` 的既有公开访问行为有明确契约测试或集成验收；上传 API 本身仍受 JWT 保护。

### 7.3 前后端联调验收

1. 普通用户选择 1 至 3 张图片，提交反馈后，列表、详情时间线和图片 URL 均可用。
2. 普通用户在 `OPEN` 工单追加文字和图片；超过连续补充次数时，文字和图片一起被拒。
3. 被授权管理员回复并附图，提交人能在同一工单看到管理员图片和通知。
4. 其他用户的 `media_id`、伪造的文件类型、超限文件和匿名上传均失败。
5. 纯文本创建/回复流程、旧工单详情和跨板块权限查询不回归。
6. `VITE_API_BASE` 与前端站点不同域名时，详情图片仍从后端绝对 URL 加载。

## 8. 实施顺序

1. 冻结第 4 节接口、URL 和公开访问决策。
2. 先补后端媒体存储校验、URL 转换、错误处理和单测。
3. 补反馈服务媒体引用顺序/重复 ID 校验，并运行反馈相关测试。
4. YuanHub 接入新建反馈和两类回复编辑区的图片选择、预览和两步上传。
5. 运行后端媒体/反馈最小测试集与前端构建，完成跨域基地址联调。
6. 部署前确认 `SHARE_MEDIA_DIR` 持久化、`SHARE_PUBLIC_BASE_URL` 可访问，并执行一次真实上传/工单回归。

## 9. P1 后续事项

- 新增媒体删除或回收接口：仅允许上传者操作，并拒绝删除已被工单消息引用的媒体。
- 增加未绑定媒体的 TTL 清理任务，覆盖进程崩溃、网络中断和用户关闭页面等孤儿场景。
- 若截图包含敏感信息，设计鉴权媒体读取或短期签名 URL；同时移除 `/media/**` 的匿名访问。
- 有明确容量和部署需求后，再抽象本地存储与对象存储 Provider；保持 `media_ids` 和工单图片响应契约不变。

## 10. 完成定义

本需求完成必须同时满足：

- 后端无需新增截图专用数据模型即可接受并保存图片引用。
- 图片真实性、类型、大小、归属、数量和顺序有服务端校验及测试。
- YuanHub 新建反馈、用户追加、管理员回复都能选择并展示截图。
- 上传和工单接口错误均保持现有 `ApiResult` 结构。
- 独立后端域名部署时图片 URL 可加载。
- 现有文本反馈、权限、状态、通知和历史数据通过最小相关测试。

