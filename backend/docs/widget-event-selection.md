# 桌面伴侣活动选择 API

`GET /open-api/calendar/events`，`Authorization: Bearer <API Token>`，沿用 `calendar:read`。

通过 Token 的 `userId/accountId` 查找绑定子账号，游戏由该账号决定；客户端传入的 `account_id/game` 不影响范围。返回该游戏全部已启用公开活动，包含尚未订阅、即将开始、进行中和已结束活动，以及可见招募池派生项。复用 `ActivityCalendarService.publicItems`，不读取或修改用户订阅，不包含私有日历项。

成功响应为既有 `ApiResult`，`data` 包含 `account_id`、`game`、`generated_at`、`items`。条目复用 `ActivityCalendarItem`，使用 `id`、`title`、`start_date`、`end_date`、`start_time`、`end_time`、`time_zone` 等 snake_case 字段；不附加虚构的 `subscribed/completed` 值。空目录返回 200 + 空数组；响应 `Cache-Control: no-store`。

缺失/无效 Token 返回 401，缺少权限返回 403，绑定账号不存在返回 404。原 `/open-api/calendar/subscriptions` 保持原有行为和默认 30 天窗口，供客户端自动选择模式使用。

Android 0.8.0 的手动关注仅保存在设备当前连接缓存，不改变网页订阅；换连接清除。后端未部署时 App 显示「活动选择暂未开放」，原自动模式继续工作。

验证：`OpenApiCalendarEventsContractTest` 覆盖身份/权限、游戏范围、账号不存在、未订阅/招募条目及无订阅读写；`OpenApiCalendarControllerContractTest` 覆盖原接口兼容。
