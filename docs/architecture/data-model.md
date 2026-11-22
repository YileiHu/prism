# 数据模型

> 两类持久化：SQLite（索引与事务数据）与文件/sidecar（用户内容）。列级定义见生成的 [数据库参考](../reference/database.md)。

## SQLite

- 文件：Electron `userData/prism.db`；`journal_mode = WAL`，`foreign_keys = ON`。
- 初始化：`electron/database.ts` 的 `initDatabase()`；建表后用 `PRAGMA table_info` 做增量迁移，旧库原地升级。
- 行结构保持 snake_case + 0/1；所有 CRUD 在 `database.ts` 内映射成 `src/shared/models.ts` 的 camelCase + boolean 领域模型，渲染层看不到行结构。
- 迁移是手写的 `ALTER TABLE` / `RENAME` / `DROP`；每次 schema 变化都要考虑旧数据（见文件顶部的历史迁移注释）。

### 10 张表

| 表 | 用途 | 关键约束 |
|---|---|---|
| `resources` | 网页资源 | `url` UNIQUE；`sort_order` 控制手动排序 |
| `tags` | 资源标签 | `name` UNIQUE；`color` 可空串；`sort_order` |
| `resource_tags` | 资源 ↔ 标签 | 复合主键；两边外键 CASCADE |
| `notes` | 笔记索引（可重建） | `path` UNIQUE（原生分隔符）；`vault_path` 归属；`tags` 空格分隔；`modified_at` ISO |
| `settings` | 键值设置 | `key` 主键；值一律字符串 |
| `gtd_projects` | 事务项目（可选容器） | `archived_at` 为空即进行中；`sort_order` 是进行中侧栏的手动顺序；删除时任务 `project_id` 置空而不是级联删除 |
| `gtd_tasks` | 事务任务 | `scheduled_date` / `due_date` 本地日期；`completed_at` 为空即未完成；`project_id` 外键 `SET NULL`；`sort_order` 仅项目内；`inbox_order` 仅收集箱手动顺序 |
| `gtd_project_links` | 项目关联的文档/白板 | `kind` = `note`/`canvas`；`(project_id, file_path)` UNIQUE；项目删除级联删链接，文件保留 |
| `pdf_documents` | PDF 索引 | `path` UNIQUE；`repo_path` + `rel_path`；封面字段（`cover_path`/`cover_version`/`cover_custom`/`cover_dirty`） |

### 语义要点

- **笔记索引不是真实数据**：文件被删/改名后由扫描同步；丢失可重建。正文永远以 `.md` 为准。
- **搜索**：`LIKE` 参数化查询标题/正文，不用 FTS5（对 CJK 更稳）；结果上限来自 `search_result_limit`。
- **标签**：正文 `#tag` 与 frontmatter `tags` 合并；写库时用空格连接，读取时按空白拆分。
- **GTD 模型**：任务与项目分表，没有状态枚举——`completed_at` 为空即未完成；`scheduled_date` / `due_date` 是起始/截止闭区间（只一边时视为同一天），任务在区间内每天活跃；只有超过截止日期才算逾期，起始日过去只是进行中。项目是可选的第二视角，`gtd_projects.sort_order` 保存项目侧栏手动顺序（归档列表仍按归档时间）。收集箱另有 `gtd_tasks.inbox_order`；日历日程仍按截止时间排序。项目归档后只读；删除项目只把任务的 `project_id` 置空，已完成任务保留在日志。
- **项目资料**：项目只有链接记录，不再有专用文件夹；链接指向任意已注册仓库里的普通 `.md`/canvas `.json`。删除项目只删链接，文件保留；旧 `Projects/<项目>/` 白板由目录扫描发现，不依赖数据库映射。
- **PDF 封面**：文件在 `userData/pdf-covers/<id>.jpg`；DB 只存路径/版本/自定义标记；版本号用于缓存破坏。
- **已移除的主页表**：`favorite_notes` / `recent_notes` 随主页删除，旧库启动时 `DROP TABLE IF EXISTS`；只删应用元数据，笔记文件不受影响。
- **窗口/工作区**：也是 `settings` 行，见下文。

## `settings` 中的非注册表键

`src/shared/settings.ts` 只管理 `AppSettings` 的 38 个键；以下键由功能代码直接读写：

| 键 | 值 | 用途 |
|---|---|---|
| `vault_paths` | JSON `VaultEntry[]`（`path`/`name`/`icon`/`private` 提示） | 笔记库列表及侧栏顺序；主进程缓存并在写入时失效 |
| `window_bounds` | JSON `{x,y,width,height,maximized}` | 窗口位置/大小恢复 |
| `workspace_v1` | JSON `PersistedWorkspace` | 完整工作区快照（标签/激活文档/分屏/模块/资料库）；冷启动只取标签与资料库，托盘重建窗口恢复全部 |
| `note_tabs_<vault>` | JSON | 旧版按库保存的标签，hydrate 时迁移并入 `workspace_v1` |
| `pdf_tabs_<repo>` | JSON | 旧版 PDF 标签，同上 |
| `last_coll_<vault>` | 收藏集 id 或 `__canvas__` | 每个笔记库上次选中的视图 |
| `last_pdf_coll_<repoKey>` | 收藏集 id | 每个 PDF 库上次选中的收藏集 |
| `last_resource_tag` | 标签名 | 网页资源库上次选中的标签（不存在时自动清空） |
| `image_path_style` | `note` / `vault` / `name` | 粘贴/插入附件的引用风格；`VaultsSection` 直接读写 |
| `default_notes_dir` | 路径字符串 | 新建笔记的默认目录 |
| `browser_path` | 可执行文件路径 | 外部程序设置；`ExternalSection` 直接读写 |
| `last_vault_path` | 路径字符串 | 上次使用的笔记库（移除库时清理） |
| `gtd_v2_migrated` | `"1"` | 旧 `gtd_items`/`gtd_actions` → `gtd_tasks`/`gtd_projects` 的一次性迁移标记 |

## 文件与 sidecar

写入统一走 `electron/sidecar.ts`：先写 `.tmp` 再 `rename`，崩溃不会截断旧文件；读取失败时把坏文件复制为 `.bak` 并按「不存在」处理。

| 路径 | 内容 | 不变量 |
|---|---|---|
| `<vault>/**/*.md` | 笔记正文 | 唯一真实来源；保存时保留 CRLF 风格 |
| `<vault>/<attachments_dir>/` | 图片/附件 | 默认 `attachments`；粘贴图片由 `saveAttachment` 落盘 |
| `<vault>/<canvas_dir>/*.json` | 白板 | 默认 `canvases`；`CanvasDoc` v2；不进 SQLite |
| `<vault>/Projects/<项目>/*.json` | 旧项目白板 | 历史位置仍可扫描/打开/保存；新项目白板不再写入 |
| `<vault>/.prism/collections.json` | 笔记收藏集与分组 | 每篇笔记在根 `notePaths` **XOR** 恰好一个分组 |
| `<vault>/.prism/canvas-groups.json` | 白板库分组 | 路径为库内相对、正斜杠、大小写不敏感去重；未分组 = 全部 − 各组 |
| `<vault>/.prism/private.json` | 私密库元数据 | 只存包裹后的 DEK；不含明文 |
| `<pdf repo>/.prism/pdf-collections.json` | PDF 收藏集 | 路径为 PDF 库相对；`version` + `collections` |
| `userData/pdf-covers/*.jpg` | PDF 封面缓存 | 只由主进程维护 |

### 白板 JSON

`src/lib/canvas/model.ts` 定义 `CanvasDoc` v2：

```
{ version: 2, kind: "canvas", viewport: {x,y,zoom},
  nodes: CanvasNode[], groups: CanvasGroup[], edges: CanvasEdge[], ink: [] }
```

- 读取时做版本迁移与损坏兜底；保存时带 `expectedModifiedAt` 做 mtime 冲突检测。
- 注意：这里的 `CanvasGroup` 是画布内部容器；`src/shared/models.ts` 的 `CanvasGroup` 是资料库侧栏分组，两者不要混用。
- 详细字段与冲突语义见 [白板](canvas.md)。

## 路径约定

| 参数 | 含义 |
|---|---|
| `vaultPath` | 笔记库根（或白板库所属库根） |
| `repoPath` | PDF 库根 |
| `notePath` / `notePaths` | 笔记绝对路径 |
| `filePath` / `filePaths` | 通用文件绝对路径 |
| `relPath` | 库内相对路径，正斜杠（不用 `relativePath`） |
| `canvasPath` | 白板 JSON 绝对路径 |

比较统一用 `pathKey`/`normalizePath`：正斜杠、去尾斜杠、大小写折叠。只改大小写的重命名在 Windows/macOS 上是同一文件。

## 事件与跨窗口同步

| 通道 | 方向 | 载荷 |
|---|---|---|
| `vault:updated` | main → renderer | `{ vaultPath, changes?: { upserted, deleted } }` |
| `pdf:updated` | main → renderer | `{ repoPath, changes?: { upserted, deleted } }` |
| `vault:locked` / `vault:unlocked` | main → renderer | `vaultPath` |
| `vault:privacy-changed` | main → renderer | 隐私状态 |
| `vault:migration-progress` | main → renderer | `{ vaultPath, done, total }` |
| `window:maximize-change` | main → renderer | boolean |

渲染层内部还使用 CustomEvent：

- `prism:open-note`（深链打开笔记）
- `prism:vault-locked` / `prism:vault-unlocked`（App 关闭标签、UI 同步）
- `prism:canvas-changed` / `prism:canvas-saved`（白板库刷新）
- `prism:shortcut`（全局快捷键分发）
- `settings-saved`（设置页短暂提示）

## localStorage

纯 UI 状态，允许丢失：语言（`prism_lang`）、主题/模式首屏镜像、设置分类、侧栏折叠、资料库分区折叠、侧栏宽度、每库搜索范围、大纲折叠、阅读模式折叠。不要往这里放用户内容或需要跨窗口一致的数据。

## 改动地图

| 要改什么 | 先看 |
|---|---|
| 表/列/迁移 | `electron/database.ts`；[recipes](../guides/recipes.md) 的「新增表/列」 |
| 设置键 | `src/shared/settings.ts`；[设置参考](../reference/settings.md) |
| 收藏集/分组格式 | `src/components/useCollections.ts`、`src/components/collectionTypes.ts` |
| 白板格式/冲突 | `src/lib/canvas/model.ts`、`electron/main.ts` 的 `canvas:*` |
| 工作区持久化 | `src/lib/workspace/WorkspaceProvider.tsx`、`src/lib/workspace/types.ts` |
| 私密库标记/加密 | `electron/privateVault.ts`；[主进程](main-process.md) |

## 验证

- 自动：`npm run verify`（schema 表名会与本文档交叉检查）。
- 手测：旧版本 DB 启动迁移；笔记增删改后索引与搜索；收藏集拖拽后重启；白板保存冲突；私密库锁定/解锁；PDF 重新扫描与封面。
