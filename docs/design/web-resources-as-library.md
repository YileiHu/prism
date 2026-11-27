# 网页资源并入资料库（资料库来源方案）

> 历史设计依据。实现完成后以源码与 `docs/architecture/*` 为准；本文记录为什么这样做、哪些方案被否决。

## 背景

网页资源曾经是顶级模块，和「资料库」并列。它保存的是 URL、标题、备注与标签，数据在 SQLite 的 `resources` / `tags` / `resource_tags`，没有磁盘根目录、没有扫描、没有文档标签页。资料库里的 PDF 库则是一个全局唯一的来源：固定侧栏行、独立内容面板、自己的收藏集、打开为工作区标签。

两者的导航层级不一致，导致「资料」分散在两个入口；而网页资源本身已经具备「全局单例数据源」的语义，只是缺少资料库来源这层身份。

## 决策

把网页资源改为资料库里的一个**固定、全局唯一、无路径的来源**：

- `LibraryRef` 增加 `{ kind: "resources" }`，不携带 `vaultPath` / `repoPath`。
- 资料库侧栏在笔记库与 PDF 库之后增加固定「网页资源库」行，显示总数、有选中态、不可拖动。
- 内容区复用现有网页资源页；标签作为侧栏「标签」分区，不硬套资料库收藏集。
- 数据、标签、搜索、排序、颜色、标题抓取、外部打开全部保持原 SQLite / IPC 语义。
- 顶级模块收敛为事务、资料库、设置。

## 为什么合理

1. **语义吻合**：`note`（多库）、`canvas`（跟随笔记库）、`pdf`（单例）、`resources`（单例）都是「资料库来源」，`LibraryRef` 本来就是表达这件事的类型。
2. **PDF 是现成先例**：PDF 库同样全局唯一、不进 `vault_paths`、有固定侧栏行和独立内容面板；网页资源照这个模式即可。
3. **零数据迁移**：资源表、标签表、IPC 通道都不变；现有行、颜色、顺序、URL 唯一约束原样保留。
4. **不破坏路径安全**：网页资源没有文件路径，不能参与 `findOwningVault` / `requireVaultRoot` / 私密仓库 / watcher / sidecar。把它注册进 `vault_paths` 会制造假路径并破坏这些不变量。
5. **状态可保留**：资料库内容按 `library.kind` 条件渲染，所以资源数据、搜索词、选中标签、卡片折叠状态必须放在 `LibraryDataProvider` 的 `useResourceLibrary` 中，才能满足「切来源不丢状态」。

## 收益与代价

**收益**

- 所有「资料」只有一个入口；顶级导航更短。
- 资料库外壳（侧栏、工具栏、异步三态、工作区恢复）被复用；工作区侧栏也自动获得资源入口。
- 后续把资源接入项目资料、嵌入、反向引用时无需再维护第二套数据入口。

**代价与风险**

- `LibraryRef` 变宽，所有读取 `library.vaultPath` 的分支必须先窄化；用 `libraryVaultPath()` 统一处理。
- 旧 `workspace_v1` 可能存 `module: "resources"`；resume 时要迁移为 `library` + `resources`，冷启动仍只按 `library` 恢复。
- 标签不是收藏集：多标签是资源的固有模型，转成路径集合会丢失语义和迁移成本；因此侧栏标题显示「标签」。
- 资源内容会随来源切换卸载，滚动位置不保留；与笔记/PDF 内容一致。

## 2026-11 修订：标签改为收藏集

本节推翻上文「用收藏集替换标签」的否决结论，并说明为什么现在成立：

- **单一分类取代多标签**：资源按「一条只属于一个收藏集」组织，和笔记/PDF 收藏集语义一致，「未分组」= 没有收藏集。标签的多值模型无法表达「移动」，批量整理只能反复增删标签。
- **复用既有交互**：侧栏行/拖拽/右键/对话框/选择记忆全部复用（`GroupNavRow`、`CollectionSection`、`CollectionDialogs`、`librarySelection`），资源侧只新增一个数据源适配（`useResourceLibrary` → DB）。
- **存储不跨来源复用**：资源没有库根，仍留在 SQLite；新增 `resource_collections` 表与 `resources.collection_id` 单列外键（`ON DELETE SET NULL`）来保证唯一归属，不引入 sidecar。
- **迁移**：旧 `tags` 逐个变成收藏集，多标签资源归入 `tags.sort_order` 最前的标签，无标签资源保持未分组；迁移完成后删除 `tags` / `resource_tags`（一次性、不可逆，已确认）。
- 旧记忆键 `last_resource_tag` 保留为一次性回退来源，新的选择写入 `last_resource_coll`。

上文「被否决的方案」表中的「用收藏集替换标签」一行因此失效，仅作为历史记录保留。

## 被否决的方案

| 方案 | 做法 | 否决理由 |
|---|---|---|
| 文件型资源仓库 | 新增资源仓库路径，把资源写成 `.md`/JSON 并扫描、监听、支持私密 | 要迁移现有数据、跨文件维护 URL 唯一、标签颜色/顺序 sidecar、watcher 与索引重复；资源是元数据而非长文，收益不抵成本 |
| 保留独立模块 + 资料库再放入口 | 两个入口并存 | 两套状态宿主、两个数据归属，容易出现不一致 |
| 注册进 `vault_paths` | 把资源当成笔记库 | 需要伪造路径，污染路径安全、私密仓库、扫描与移除语义 |
| 用收藏集替换标签 | 资源分组改走 `.prism` 收藏集 | 多标签无法表达为路径集合；还会引入 sidecar 写入与迁移 |

## 数据流

1. 启动：`LibraryDataProvider` 挂载 → `useResourceLibrary` 调 `getResources()` + `getResourceCollections()`；`workspace_v1.library` 校验后恢复上次来源。
2. 选来源：侧栏行/工作区侧栏 → `setLibrary({ kind: "resources" })` → `LibraryView` 渲染 `ResourcesLibraryContent`。
3. 选收藏集：`ResourceCollectionList` → 父级 `onSelectCollection` 同时把 library 指向资源并设置 `selectedCollectionId`，再触发 `onOpenCollections`（工作区侧栏场景切回资料库模块）。
4. 写操作：内容区/收藏集区复用 `resources:*` / `resource-collections:*` IPC；hook 重新拉取列表与收藏集，侧栏计数和内容一起更新。
5. 持久化：只有 `workspace_v1.library` / `module` 变化；没有 watcher、没有 main → renderer 推送。

## 不变量

- 网页资源是唯一、无路径的来源；不进入 `vault_paths`，不参与扫描、watcher、私密仓库、路径安全、侧车文件。
- 资源视图只读写 `resources` / `resource_collections`（`tags` / `resource_tags` 已随迁移删除）。
- URL 唯一；一条资源最多属于一个收藏集（`collection_id` 单列）；收藏集可由用户选预设图标，卡片色调仍从 `hashColor(name)` 派生。
- 收藏集顺序跟随 `resource_collections.sort_order`，资源全局顺序跟随 `resources.sort_order`，不另建顺序。
- 搜索词与卡片折叠状态是会话内存状态；选中收藏集持久化到 `last_resource_coll`（首次读取回退旧 `last_resource_tag`，与笔记/PDF 收藏集选择一致）。

## 非目标

- 不把资源做成工作区标签页或内嵌浏览器。
- 不做资源导出/导入的可同步仓库。
- 不把资源接入项目资料链接或笔记嵌入（后续可选）。
- 不新增设置项；新增的 `resource-collections:*` IPC 与两张表仅服务于本次收藏集改造。
