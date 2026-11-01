# 密探立绘批量更新

把原图放入 `scripts/portraits/source-update/`，运行一次脚本即可按公共密探目录匹配 ID、生成正式 WebP、更新前端立绘索引，并把成功处理的原图移入归档。路径全部相对本工具目录，仓库换位置后仍可使用。支持 Linux / WSL、Python 3.11+。

## 安装与运行

首次在仓库根目录安装依赖并下载人脸模型：

```sh
python3 -m venv scripts/portraits/.venv
scripts/portraits/.venv/bin/python -m pip install -r scripts/portraits/requirements.txt
scripts/portraits/.venv/bin/python scripts/portraits/normalize.py --fetch-model
```

当前工作区已经装好运行环境。若另一台 Linux 的系统 Python 缺少 `ensurepip`，可以用 `uv venv scripts/portraits/.venv` 和 `uv pip install --python scripts/portraits/.venv/bin/python -r scripts/portraits/requirements.txt` 完成前两步，无需修改系统 Python。

每次更新：

```sh
# 原图先放入 scripts/portraits/source-update/
scripts/portraits/.venv/bin/python scripts/portraits/update.py
```

默认目录对应本仓库：

| 用途 | 路径 |
| --- | --- |
| 待处理原图 | `scripts/portraits/source-update/` |
| 正式成品 | `public/assets/operator-portraits/<密探ID>.webp` |
| 前端索引 | `src/data/operatorPortraits.json` |
| 原图及覆盖前备份 | `scripts/portraits/archive/<UTC批次时间>/` |
| 最新累计处理记录 | `scripts/portraits/metadata.json` |

正常完成后 `source-update` 为空。失败、名称冲突、不支持的文件会留在原处；不会为了清空目录删除未处理文件。空目录再次运行直接退出，不查询网络。

## 名称与公共目录

默认读取 `/v1/operator/catalog`，通过进程环境变量或仓库 `.env*` 中的 `VITE_API_BASE` 确定后端地址。只读取这个配置项，不读取登录凭据。也可以在 `config.json` 的 `update.catalog_url` 设置完整公开接口地址，或使用：

```sh
scripts/portraits/.venv/bin/python scripts/portraits/update.py \
  --catalog-url https://your-api.example/v1/operator/catalog
```

中文名、目录中的拼音/别名、当前完整 ID 均可，例如：

```text
陈琳.png
chenlin.png
sth_chenlin.png
1800px-陈琳-立绘.png
char_130_chenlin.webp
陈登·黍王.png
```

支持 PNG、WebP、JPG、JPEG 及子目录。忽略名称中的空格、下划线、分隔符和拼音声调；`ü` 对应 `v`。优先匹配完整中文名，拼音从公共目录 ID 后缀及 alias 读取，不维护另一份硬编码 ID 表。

同拼音（例如“张绣”和“张修”）、多个原图对应同一个 ID 时，不猜测或互相覆盖；改为中文名/完整 ID，或通过 sidecar 指明 `operator_id`。文件名中的完整旧 ID 已被公共目录删除时会拒绝，不自动改挂到同名新 ID。

接口不可达时停止，不使用前端旧兜底目录。可显式提供公共接口导出的 JSON，支持完整响应包装或包含 `operators` 的数据对象：

```sh
scripts/portraits/.venv/bin/python scripts/portraits/update.py \
  --catalog-json /path/to/public-operator-catalog.json
```

`update.use_environment_proxy` 默认 `false`，直接访问后端；需要系统代理时改为 `true`。

## 检查与 Debug

```sh
# 只查询目录、检查文件名匹配；不生成图片或移动原图
scripts/portraits/.venv/bin/python scripts/portraits/update.py --check

# 正常更新，同时将源图脸框、目标脸框、中心、裁切边界和预览网格写入本批归档
scripts/portraits/.venv/bin/python scripts/portraits/update.py --debug
```

默认不保留临时测试图片。运行中的临时文件自动清理；正式归档保留 `originals/`、目录响应、配置、校准、metadata 和 `report.json`。被覆盖的 WebP、索引及 metadata 先备份到 `previous/`。`--debug` 额外保留本批 debug 和 contact sheet。

仅成功编码的图片发布到正式目录；图片/索引写入失败时恢复本批已改文件并保留输入。原图归档校验与正式文件发布成功后才移除输入；中断或输入被同时修改时宁可保留副本，不删除变化后的文件。失败文件的 sidecar 一并保留。不要在脚本运行时手工移动待处理原图。

退出码：`0` 完成（可能有构图警告）；`2` 仍有未处理文件；`1` 配置、公共目录、模型或写入错误。底部留空、头部边界等构图警告会显示在终端与 metadata 中，仍会产出图片。

## 几何与画质配置

所有关键参数集中在 `config.json`。

- 检测使用专用动漫人脸 `deepghs/anime_face_detection / face_detect_v1.4_s`。四张固定参考副本（庞德、张邈、刘豹、吕布）用于自动校准；不从更新后的成品反复校准。
- 统一脸中心、脸高；人物整体只做等比缩放、平移、裁切。当前基准卡片为 360×190 CSS px，脸中心约为卡片宽度的 51.98%、高度的 30.07%，基础脸高占卡片高度约 21.63%。
- 默认 **WebP quality 96 / method 6**，透明通道无损。输出按 **3 倍卡片高度**取样：当前为 **782×570**，最大画布 960×700。高像素密度手机不再只加载 285px 高的成品；原图细节不足时，提高输出像素不能恢复缺失细节。
- 左右羽化各 18%，保护脸框，上下不额外羽化；去掉连续透明/近纯黑底边，避免将部分深色衣服误删。
- 小幅补底最多额外等比放大 8%，脸中心不变；仍不足时记录警告，绝不拉伸身体。可选 `head_bbox` 用于检查头顶边界。

常调参数：`output.quality`、`output.pixel_ratio`、`output.width/height`、`target.center_x/center_y/face_scale`、`feather.left/right`、`detector.confidence_threshold`、`safety.top_margin`、`safety.bottom_fill_max_scale_change`。`target` 的 `null` 表示从参考自动读取。

画布只控制图片内部构图；如果修改卡片 CSS 的尺寸、右偏移或显示规则，应同步更新 `display` 配置。模型下载约 45 MB，自动校验 SHA-256；[上游模型卡](https://huggingface.co/deepghs/anime_face_detection)标记 MIT。模型和虚拟环境属于可重建运行依赖，不提交 Git。

## 人工回退 Sidecar

人脸漏检、低分或有多个候选时不发布、不移动该原图。在原图旁添加 **完整文件名加 `.json`**，例如 `chenlin.png.json`：

```json
{
  "operator_id": "char_130_chenlin",
  "source_size": [354, 353],
  "face_bbox": [140, 35, 205, 110]
}
```

上面坐标仅说明格式，需实际测量。`operator_id` 可省略，默认按文件名匹配；脸框为原图像素 `[left, top, right, bottom]`，不是 `[x,y,width,height]`。可选 `source_sha256` 防止换图后误用旧标注，可选 `head_bbox`、`crop_bbox` 提供头部或有效内容范围。也可用 `face_center` 加 `face_height`、可选 `face_width` 代替脸框。飞云、绣球等非人形角色使用同一人工锚点流程。

处理成功后，sidecar 与原图一起归档。累计 metadata 按输出文件名记录目录 ID、人脸框、置信度、scale、x/y 平移、最终裁切、原图/成品哈希、是否人工标注、实际羽化宽度、警告和归档位置。

`normalize.py` 是几何处理核心，也可独立用于指定输入、输出目录的批处理；日常更新正式资源使用 `update.py`，无需维护旧实验 manifest 或逐角色 CSS。
