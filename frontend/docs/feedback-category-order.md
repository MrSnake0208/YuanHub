# 反馈板块排序

有 `admin:feedback_access:manage` 权限的管理员在 `/feedback/admin` 的“反馈板块”使用“上移／下移”。每次调整自动保存；首项不能上移，末项不能下移，保存期间禁用重复操作，改名期间禁用排序。隐藏板块也可排序，恢复显示后沿用保存位置。

保存成功采用后端返回的完整目录顺序；失败保留原顺序并显示错误。若提示目录顺序已更新，刷新页面后再调整。新建反馈、板块筛选、工作台和授权选项在下次读取目录后使用保存的顺序，不主动刷新其他已打开页面。板块标识、名称、历史反馈、授权不受排序影响。

前端使用 `PUT /v1/admin/feedback-categories/order`，发送完整新顺序 `keys` 和当前完整旧顺序 `expected_keys`（含隐藏项），沿用原权限和目录乐观锁。操作同步写入审计记录，可在 `/admin/audit` 查看前后名称顺序。接口详见后端 `docs/feedback-workflow-api.md`。

最小非浏览器验证（用户执行）：

```bash
node --test test/feedbackContract.test.js test/adminAccess.test.js
npm run test:behavior -- behavior/feedbackAccess.spec.js behavior/adminHeader.spec.js
```

后端仓库执行（Mongo 测试只使用 `TestMongo` 自有一次性容器）：

```bash
./gradlew test --tests '*FeedbackCategoryServiceTest' --tests '*FeedbackAccessServiceTest' --tests '*FeedbackCategoryControllerContractTest' --console=plain
./gradlew integrationTest --tests '*FeedbackCategoryMongoTest' --console=plain
```

人工验收：桌面 1440px、手机 390px 打开板块管理，上移／下移并刷新，确认顺序保留；检查首尾禁用与隐藏项排序；进入新建反馈和工作台确认选项顺序；两个管理页面先后调整，旧页面收到冲突提示后刷新可继续。真实浏览器布局、键盘焦点和触控由用户验收。
