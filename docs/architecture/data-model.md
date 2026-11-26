# 数据模型

> 两类持久化：SQLite（索引与事务数据）与文件/sidecar（用户内容）。列级定义见生成的 [数据库参考](../reference/database.md)。

## SQLite

- 文件：Electron `userData/prism.db`；`journal_mode = WAL`，`foreign_keys = ON`。
- 初始化：`electron/database.ts` 的 `initDatabase()`；建表后用 `PRAGMA table_info` 做增量迁移，旧库原地升级。
- 行结构保持 snake_case + 0/1；所有 CRUD 在 `database.ts` 内映射成 `src/shared/models.ts` 的 camelCase + boolean 领域模型，渲染层看不到行结构。
- 迁移是手写的 `ALTER TABLE` / `RENAME` / `DROP`；每次 schema 变化都要考虑旧数据（见文件顶部的历史迁移注释）。

### 18 张表

| 表 | 用途 | 关键约束 |
|---|---|---|
| `resource_collections` | 网页资源收藏集 | `name` UNIQUE；`color` 可空串；`sort_order` 控制侧栏顺序 |
| `resources` | 网页资源 | `url` UNIQUE；`sort_order` 控制手动排序；`collection_id` 单列归属（`ON DELETE SET NULL` → 未分组） |
| `notes` | 笔记索引（可重建） | `path` UNIQUE（原生分隔符）；`vault_path` 归属；`tags` 空格分隔；`modified_at` ISO |
| `settings` | 键值设置 | `key` 主键；值一律字符串 |
| `pdf_documents` | PDF 索引 | `path` UNIQUE；`repo_path` + `rel_path`；封面字段（`cover_path`/`cover_version`/`cover_custom`/`cover_dirty`） |
| `growth_domains` | 养成领域（注意力分配容器） | `name` UNIQUE；`weight` 是预算意图，不参与能力分；`theme` 是领域专属色（标签调色板键，默认 `violet`）；能力存在时禁止删除（`ON DELETE RESTRICT`） |
| `growth_capabilities` | 养成能力（等级 + 置信） | `level` 1–6、`confidence` 0–5 为 CHECK；`half_life` / `portability` / `status` 枚举；`target_level` 可空；`parent_id` 自引用同领域的根能力（技能树最多两层）；`last_evidence_at` / `last_reviewed_at` 是 UTC 时间戳 |
| `growth_evidence` | 能力证据 | `kind` = `artifact`/`feedback`/`metric`/`usage`；`happened_on` 本地日期；能力删除级联 |
| `growth_snapshots` | 校准快照（只增不改） | 每次 `reviewGrowthCapability` 或过期挑战通过时写一条；能力删除级联 |
| `growth_seasons` | 养成赛季（12 周） | `closed_at` 为空即进行中；`start_date`/`end_date` 本地日期；`theme` 是海报用的标签调色板键（默认 `violet`）；封面事实源是 `growth_media`（`transform` 存赛季封面选区）；文件存在 `%APPDATA%/prism/growth-covers/` 并由 `prism-growth-cover://` 提供；结算写入 `outcome`；删除赛季时挑战保留并失去赛季 |
| `growth_challenges` | 挑战（Boss 战） | `status` = `open`/`passed`/`failed`/`abandoned`；`difficulty_level` 1–6；定义字段 `description`（概述）/ `goal` / `criteria`；`body` 是随时可编辑的 Markdown「过程」；`reflection` / `result_note` 是结算后的复盘与结果备注；通过时必须选 `attribution`；已结算行只锁能力/赛季/难度，过程 / 复盘仍可更新；能力删除级联，赛季删除置空 |
| `growth_artifacts` | 作品（可携带证明） | `kind` = `demo`/`article`/`repo`/`doc`/`other`；`note` 是一句话介绍，`body` 是 Markdown 作品说明；封面与多图画廊的事实源是 `growth_media`（不提供自由裁剪）；能力删除级联；挑战删除后 `challenge_id` 置空 |
| `growth_tasks` | 任务（唯一有日期的行动） | `scheduled_date` / `due_date` 本地日期闭区间；`completed_at` 为空即未完成；`capability_id` / `challenge_id` 可空（能力 / 挑战删除时 `SET NULL`），挂挑战时能力必须与挑战一致（挑战补齐空能力）；任务完成不改能力分 |
| `growth_predictions` | 预测-验证（自知度的唯一数据源） | `kind` = `time`/`difficulty`/`mood`；`predicted`/`actual` 单位随 kind（分钟 / 1–5 / -2..2）；`actual` 可为 NULL（待兑现，不入统计）；`predicted_on` 本地日期；`capability_id` 锚点可空，`challenge_id` / `task_id` 二选一作上下文（上下文补齐能力），三者删除时都 `SET NULL` |
| `growth_self_model` | 自我说明书条目 | `section` 8 段固定枚举；`statement` 非空；`confidence` 0–5 |
| `growth_feedback` | 他评 / 盲区 | 三问 + 与自评的最大偏差；`received_on` 本地日期；至少一项非空 |
| `growth_annual_notes` | 年度一页 | `year` UNIQUE（按年 upsert）；`summary`/`kept`/`dropped` + `milestones`（JSON 数组，最多 3 条）+ `next_focus`（一句话） |
| `growth_media` | 养成模块图片附件 | `owner_type` + `owner_id` 指向赛季 / 作品（后续可扩挑战 / 他评等）；`file` 是主进程生成的文件名；`sort_order` 是画廊顺序；`is_cover` 标卡片/海报封面（每个 owner 最多一行）；`transform` 是赛季封面的 `{x,y,scale}` 选区 JSON。文件在 `%APPDATA%/prism/growth-covers/`，行随 owner 删除由触发器清理 |

### 语义要点

- **笔记索引不是真实数据**：文件被删/改名后由扫描同步；丢失可重建。正文永远以 `.md` 为准。
- **搜索**：`LIKE` 参数化查询标题/正文，不用 FTS5（对 CJK 更稳）；结果上限来自 `search_result_limit`。
- **标签**：正文 `#tag` 与 frontmatter `tags` 合并；写库时用空格连接，读取时按空白拆分。（这是笔记正文标签，与网页资源的旧「资源标签」无关。）
- **收藏集唯一归属**：笔记 / PDF / 网页资源在任意时刻最多属于一个收藏集，否则视为未分组。笔记与 PDF 的唯一性由读取归一化（`src/shared/collectionUniqueness.ts`，在 `vault:library-summary`、`note-collections:load`、`pdf-collections:load` 处去重）+ 写入侧「移动」语义共同保证；网页资源由 `resources.collection_id` 单列 + `resource_collections` 外键保证。
- **已删除的资源标签表**：`tags` / `resource_tags` 在资源收藏集迁移中被删除（一次性、不可逆）。迁移把每个旧标签变成一个收藏集，多标签资源归入 `tags.sort_order` 最前的那个标签（其余标签归属丢弃），无标签资源保持未分组。
- **任务模型**：`growth_tasks` 是应用里唯一有日期的行动，没有状态枚举——`completed_at` 为空即未完成；`scheduled_date` / `due_date` 是起始/截止闭区间（只一边时视为同一天），任务在区间内只出现一次；只有超过截止日期才算逾期，起始日过去只是进行中。任务可选关联一个能力（`capability_id`）和一个挑战（`challenge_id`），后者的能力会补齐前者、冲突拒绝；挑战属于赛季，所以任务经挑战归属赛季，未挂挑战的任务不属于任何赛季。能力 / 挑战删除时任务保留、链接置空；完成不改能力分。没有项目/资料实体：文件关联由能力证据承担。
- **预测模型**：`growth_predictions` 是单纯的测量记录。`capability_id` 表达「这条测量落在哪个能力上」，`challenge_id` / `task_id` 是可选上下文（二选一）并会补齐能力；`actual` 为空即待兑现。补实际只写 `actual`，不改等级、置信或校准闸门；删除能力 / 挑战 / 任务时预测保留、对应链接置空。`growth:state` 返回全部未兑现预测 + 近 90 天已兑现预测；自知度与趋势仍按预测日期近 90 天统计。
- **已删除的事务表**：`gtd_projects` / `gtd_tasks` / `gtd_project_links` 不再创建、不再读写；旧库里的同名表作为孤儿表保留（不 destructive 迁移），新库不会出现。
- **养成（成长量表）**：领域只有权重，能力挂在唯一归属领域下（`domain_id`），不存 0–100 分——`level`（1–6 行为锚点）+ `confidence`（0–5 证据强度）是唯一事实，展示分由两者在渲染层派生，界面把 1–6 显示为 C/B/A/S/SS/SSS。`reviewGrowthCapability` 是唯一手动改分的地方：上调等级必须有 `last_evidence_at > last_reviewed_at` 的新证据，一次最多升一级，且 **A 以上每级需要一个「已通过」的挑战**（`passed 数 >= level - 2`）；下调随时允许。`resolveGrowthChallenge` 是唯一的自动升级路径：过关时等级最多升到挑战难度、置信 +1、写快照、补一条 `usage` 证据，并要求 `attribution`（`stats`=自己长的 / `buff`=平台给的）。`growth_snapshots` 只增不改，置信衰减在读取时按「距最后一条证据的天数」计算（>90 天 −1，>180 天 −2），**不写库**，因此历史快照保留当时的判断。能力删除级联删证据/快照/挑战/作品；领域在能力存在时不可删。模块尚未随版本发布，schema 只保留终态，不再维护 5→6 档等历史迁移。
- **养成（P2 已移除的每日状态与投入）**：`growth_state_entries` 与 `growth_effort` 已从 schema 与开发库中删除；主线改由赛季 `focus`、挑战与任务表达，不再记录工时或每周预算。
- **养成（P3 元认知）**：`growth_predictions` 记「预估 vs 实际」（估时/难度/情绪），两段式——开始前只写 `predicted`（`actual` 为 NULL = 待兑现），做完由 `settle-prediction` 补 `actual`；待兑现条目不进任何统计，自知度与 8 周趋势都由渲染层派生，不落库；`growth_self_model` 是 8 段固定分区的说明书条目，每条带证据与置信；`growth_feedback` 存他评三问与「与自评的最大偏差」。三者**都不参与能力分**，也不影响校准闸门——它们只回答"我看得准不准"。
- **养成（内容与展示）**：挑战的 `goal` / `criteria` / `reflection` / `body` 与作品的 `note` / `body` 都只是记录，不进入评分、校准或闸门；`body` 由模块私有的精简 Markdown 渲染，不执行原始 HTML。赛季封面与作品画廊统一存 `growth_media`：`owner_type` + `owner_id` 表达归属，`file` 是主进程生成的文件名，`sort_order` 保留画廊顺序，`is_cover` 选卡片/海报封面，`transform` 只用于赛季封面的裁剪。文件在 `%APPDATA%/prism/growth-covers/`，经 `prism-growth-cover://` 提供；备份以 data URL 把所有媒体文件写入 `covers`，导入后重建媒体行。
- **养成（P4 编年史）**：`growth_annual_notes` 一年一页（`year` UNIQUE，重存覆盖）：`summary` + `kept` + `dropped` + `milestones`（JSON，最多三条，读取时容错为空数组）+ `next_focus`。全局成长曲线不落表：`growth:timeline` 返回全部 `growth_snapshots`（升序），渲染层按「每月末每项能力最近一条快照」求平均，只有已有快照的能力计入，新能力不会回溯拉低历史月份。随身资产比同样在渲染层由能力等级与「长半衰期 × 高可携带」推导，不存储。
- **养成（技能树）**：`growth_capabilities.parent_id` 表示「前置能力」，规则是**同领域 + 最多两层 + 不能指向自己**：只有 `parent_id` 为空的根能力可以做父节点，且已有子节点的能力不能再去挂父节点（`GROWTH_TREE_DEPTH` / `GROWTH_TREE_DOMAIN` / `GROWTH_TREE_SELF`）。移动能力到别的领域会自动清空自身与子节点上的跨域前置关系；删除能力会先把子节点的 `parent_id` 置空，再走级联删除。
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
| `last_resource_coll` | 收藏集 id | 网页资源库上次选中的收藏集（读取时先匹配 id，再按旧 `last_resource_tag` 的标签名回退；不存在时清空） |
| `image_path_style` | `note` / `vault` / `name` | 粘贴/插入附件的引用风格；`VaultsSection` 直接读写 |
| `default_notes_dir` | 路径字符串 | 新建笔记的默认目录 |
| `browser_path` | 可执行文件路径 | 外部程序设置；`ExternalSection` 直接读写 |
| `last_vault_path` | 路径字符串 | 上次使用的笔记库（移除库时清理） |

## 文件与 sidecar

写入统一走 `electron/sidecar.ts`：先写 `.tmp` 再 `rename`，崩溃不会截断旧文件；读取失败时把坏文件复制为 `.bak` 并按「不存在」处理。

| 路径 | 内容 | 不变量 |
|---|---|---|
| `<vault>/**/*.md` | 笔记正文 | 唯一真实来源；保存时保留 CRLF 风格 |
| `<vault>/<attachments_dir>/` | 图片/附件 | 默认 `attachments`；粘贴图片由 `saveAttachment` 落盘 |
| `<vault>/<canvas_dir>/*.json` | 白板 | 默认 `canvases`；`CanvasDoc` v2；不进 SQLite |
| `<vault>/Projects/<项目>/*.json` | 旧项目白板 | 历史位置仍可扫描/打开/保存；新项目白板不再写入 |
| `<vault>/.prism/collections.json` | 笔记收藏集与分组 | 一条笔记**最多属于一个收藏集**（跨收藏集唯一）；收藏集内根 `notePaths` 与组路径 XOR；读取时按「先出现者优先」去重，下一次保存落盘 |
| `<vault>/.prism/canvas-groups.json` | 白板库分组 | 路径为库内相对、正斜杠、大小写不敏感去重；未分组 = 全部 − 各组 |
| `<vault>/.prism/private.json` | 私密库元数据 | 只存包裹后的 DEK；不含明文 |
| `<pdf repo>/.prism/pdf-collections.json` | PDF 收藏集 | 路径为 PDF 库相对；一条 PDF **最多属于一个收藏集**（读取时去重）；`version` + `collections` |
| `userData/pdf-covers/*.jpg` | PDF 封面缓存 | 只由主进程维护 |
| `userData/growth-covers/*` | 养成媒体图（赛季封面 / 作品画廊） | 只由主进程写入；文件名由主进程生成；`growth_media` 记录归属与顺序；导出时以 data URL 嵌入 JSON；启动时回收无引用文件 |
| `userData/growth-backups/*.json` | 养成导入前的自动备份 | 每次替换导入前写一份；可用同一个导入入口恢复 |

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
