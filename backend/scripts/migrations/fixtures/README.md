# 关卡迁移测试输入

`20260907-levels.json` 原样保存真实历史目录的 143 条公开关卡数据，来源：
[MrSnake0208/MaaYuan-Share-Backend resource/levels.json @ 8c5869184cce43420ac67a613c734bd43f62fb28](https://github.com/MrSnake0208/MaaYuan-Share-Backend/blob/8c5869184cce43420ac67a613c734bd43f62fb28/resource/levels.json)。已比对 GitHub 原始文件，未生成或改写行内容。

原数据第 83 行的 stageId 年份错误刻意保留，供现有归一化修正断言验证；数量、分类映射、冲突、幂等和 dry-run 不访问数据库的断言不变。测试相对自身文件读取此快照，不再依赖工作目录外未入库的 `levels (2).json`。

此文件仅为测试输入，不会自动导入数据库，不改变生产迁移脚本的默认输入或发布行为。
