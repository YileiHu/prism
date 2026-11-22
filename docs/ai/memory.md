# 项目记忆

> 最后核对：v0.5.4（2026-11-22）。只记稳定结论、决策和坑；不写每日流水。整块功能/重构/发布后更新。

## 1. 当前快照

- 版本 `0.5.4`，Electron 43 + React 19 + TS + Vite + SQLite。
- 类型检查基线：`node node_modules/typescript/bin/tsc --noEmit` 通过（本会话沙箱下 `npm run lint` 的 npm 包装受命名管道限制）。
- 没有自动化测试/CI；UI 一律手动验收。
- 2026-11 完成编辑器统一容器（表格/代码/提示卡/公式/嵌入共享块会话与菜单），设计背景见 [编辑器块重构](../design/editor-block-refactor.md)。
- 2026-11 事务模块改为「即将优先」：任务/项目分表、日期自动分层（即将含今天/逾期）、完成日志、移除等待/未来清单与整理弹窗，新增全局快速记录。
- 2026-11 事务改为日历为主：月网格按自然周滚动，聚焦周展开、上下周渐隐；项目进度环；移除「即将」列表；主页模块已删除，冷启动固定进入事务-日历（标签恢复，但不恢复激活文档/分屏），托盘重建窗口恢复完整现场。
- 2026-11 项目资料改为纯链接：不再创建 `<仓库>/Projects/<项目>/`，新建笔记/白板落到仓库常规位置并自动关联；可关联任意已注册仓库的笔记/白板；列表标题后显示项目标记，编辑器/白板工具栏共用同一跳转入口。
- 2026-11 项目页布局改为左侧输入/任务、右侧栏项目概览 + 描述 + 资料；移除未来 7 天分布，避免纵向堆叠。
- 2026-11 项目列表支持拖动排序：进行中项目在侧栏用 `@dnd-kit` 拖动，顺序写入 `gtd_projects.sort_order`；归档列表仍按归档时间，新建项目排最前。
- 2026-11 笔记库仓库列表支持拖动排序：`LibrarySidebar` 的 vault 行用 `useSortable`，模块页与工作区侧栏共用 `DragOverlay`，顺序直接写回 `vault_paths`。
- 2026-11 网页资源并入资料库：网页资源成为资料库内唯一的无路径来源（与 PDF 库同级），顶级模块只剩事务/资料库/设置；标签仍作分组，资源行与标签分区同时出现在资料库侧栏和工作区侧栏；旧 `workspace_v1` 的 `module: "resources"` 在 resume 时迁移为「资料库 + 资源」。
- 2026-11 资料库共用层：三类仓库的分组展示与交互收口到 `LibraryGroup` 适配器、`GroupNavRow`、`SectionCard`、`CollectionDialogs`、`useLibraryDnd` / `LibraryDragOverlay`、`LibraryTitle` / `SearchLimitHint` 和 `librarySelection`；资源标签选择开始持久化到 `last_resource_tag`。
- 2026-11 收集箱支持拖动排序：`gtd_tasks.inbox_order` 保存手动顺序，日历右栏用 `SortableList`；日程 agenda 仍按截止时间，不参与拖动。
- 2026-11 关闭行为/托盘/开机启动：`close_behavior`（退出 / 最小化到托盘）、`auto_launch`、`auto_launch_hidden`；托盘按需创建，`--hidden` 登录启动不建主窗口、PDF 库延后到首次建窗；打包版单实例；新增全局「呼出主界面」快捷键。
- 文档体系：`AGENTS.md` 路由 + `docs/` 深度文档 + `.dsh/skills` 任务手册 + `docs/reference` 生成物 + `npm run docs:check` 防漂移。
- 2026-11 新增 AI 白板桥接：`integrations/prism-canvas-mcp` 提供 6 个 MCP 工具（vaults/list/read/create/edit/layout），把模型生成的结构按 `CanvasDoc` v2 写成白板 JSON；DSH 插件行 `prism_canvas` 已接入，私密库拒绝、无默认仓库。
- 无已知未完成的大规模重构；下一步以用户需求为准。

## 2. 已定决策

| ID | 决策 | 原因 | 代码位置 |
|---|---|---|---|
| D-001 | Markdown 源码是唯一持久化；阅读用 markdown-it、编辑用 CM6 decoration，不引入第二份文档状态 | 避免双状态同步与迁移风险 | `src/components/editor/markdown.ts`、`livePreview.ts` |
| D-002 | 编辑模式只保留一个主 EditorView；同一时间最多一个活动块会话 | 嵌套 CM/多状态会让焦点与撤销不可控 | `src/components/editor/blockSession.ts`、`blockState.ts` |
| D-003 | 搜索用参数化 `LIKE`，不用 FTS5 | CJK 分词/索引维护成本高，个人库规模可接受 | `electron/database.ts` |
| D-004 | 收藏集/白板分组/PDF 收藏集用 `.prism/*.json` sidecar，临时文件 + rename 原子写 | 用户数据跟着库走，可手工修复/同步 | `electron/sidecar.ts`、`electron/main.ts` |
| D-005 | 设置用共享类型注册表（默认值/范围/编解码） | 主/渲染同源，避免两边校验分叉 | `src/shared/settings.ts` |
| D-006 | 工作区持久化用 `workspace_v1`，hydrate 时合并旧版按库标签并丢弃缺失文件 | 平滑迁移，不出现幽灵标签 | `src/lib/workspace/WorkspaceProvider.tsx` |
| D-007 | 私密仓库：PVD1 容器、scrypt + AES-256-GCM、会话仅内存、私密库不进 SQLite 索引 | 文件名保持明文但内容加密；锁定后索引不可用是预期 | `electron/privateVault.ts`、`electron/main.ts` |
| D-008 | 文档只让机械事实自动生成（IPC/设置/表/导出），手写文档只写流程与不变量 | 防止文档随代码漂移，同时控制 AI 上下文成本 | `scripts/ai/*`、`docs/reference/*` |
| D-009 | 技能只保留 `.dsh/skills` 一份，`.claude` 不再维护副本 | 避免两份内容长期不同步 | `AGENTS.md`、`.dsh/skills/` |
| D-010 | 事务模块用「即将优先」模型：任务与项目分表，日期锚点自动分层（即将含今天/逾期），完成写日志不删除；取消 waiting/someday/整理弹窗与独立“今天”板块 | 整理成本高于收益，收集后应能直接消费；今天经常为空，单列板块噪声大 | `electron/database.ts`、`src/lib/gtd.ts`、`src/components/gtd/` |
| D-011 | 事务改为日历为主（取代 D-010 的「即将」视图）：月网格按自然周滚动，聚焦周展开、上下周渐隐；项目环；原 Home 近期任务跳到日历日期（Home 入口已由 D-015 删除） | 列表与日历信息重复，周聚焦日历更直接；不新增依赖与迁移 | `GtdView`、`GtdCalendar` |
| D-012 | 项目资料 = 项目仓库 + `Projects/<项目>/` + 链接表（已由 D-029 取代）：新建文件进项目文件夹并登记 `gtd_project_links`，关联已有文件留在原地；项目删除只删链接/文件夹记录，文件保留；项目文件夹中的 `.json` 作为白板合法路径 | 文件保持普通笔记/白板，可独立编辑/同步；不复制内容，删除项目不丢用户文件；项目分组与白板库可见性兼顾 | `electron/database.ts`、`electron/main.ts`、`src/components/gtd/GtdProjectDocs.tsx`、`src/components/settings/GtdSection.tsx` |
| D-013 | 项目页采用左任务/右「标题+进度」+纯文本描述+资料栏；重命名/编辑介绍/打开文件夹/资料新建关联/右栏折叠进工具栏，归档删除走左侧项目右键菜单；右栏折叠无动画，折叠后不渲染正文标题行；文档和白板合并为一个 `.sidebar-group` 凹陷容器列表，不显示分组标题；移除未来 7 天、标题操作按钮、文件夹信息框和完成归档提示 | 任务占主视觉，标题与概览合并省空间；工具栏承担项目级动作，右键菜单承担项目列表动作；折叠和资料列表保持简单 | `src/components/gtd/GtdProjectDetail.tsx`、`src/components/gtd/GtdProjectDocs.tsx` |
| D-014 | 已关联笔记/白板的编辑器工具栏提供项目跳转按钮：按 `file_path` 查询 `gtd_project_links`，单项目直达、多项目下拉；归档项目通过 `GtdFocusRequest.archived` 跳到已归档列表 | 文件是普通文件，跳转入口应跟随文件本身；避免编辑器与项目页双向查找 | `src/components/gtd/ProjectJumpButton.tsx`、`src/App.tsx`、`src/components/gtd/GtdView.tsx`、`electron/database.ts` |
| D-015 | 删除主页模块：`gtd` 成为第一个/默认模块，日历（`GtdView` 默认 `calendar`）即首页；同时删除只在主页消费的收藏/最近/时钟（`favorite_notes`/`recent_notes` 两表、4 个 `notes:*` 通道、`clock_format`/`home_recents_count` 两设置、17 个 i18n key），旧 `workspace_v1` 的 `module: "home"` 回落到 `gtd` | 主页四块与 GTD/资料库重复，收藏/最近低频；删除后模块统一为「侧栏 + 内容」，只保留单一数据归属（笔记归资料库、任务归事务），避免留下无消费者的契约 | `src/App.tsx`、`src/lib/workspace/types.ts`、`src/lib/workspace/WorkspaceProvider.tsx`、`electron/database.ts`、`electron/main.ts`、`src/components/library/useNoteLibrary.ts` |
| D-016 | 事务主页改为「顶部选中日 agenda + 收集箱，下方全宽月历」：左卡跟随选中日期（默认今天），右卡复用 `InboxCapture` + `GtdTaskRow`；月网格不再固定 50% 高度，改占剩余高度 | 日历主页信息量偏少；把原有底部 agenda 上移而不是复制今日列表，既避免重复又让月历全宽；收集箱在首页可见可直接记录/处理 | `src/components/gtd/GtdCalendar.tsx`、`src/components/gtd/GtdCalendarAgenda.tsx`、`src/components/gtd/GtdCalendarInbox.tsx`、`src/components/gtd/GtdView.tsx` |
| D-017 | 收集箱只收无日期且未归项目的任务：给任务指定项目就是处理动作，`groupGtdTasks` 把无日期的项目任务分到 `projectUndated`，不再计入 `inbox` 计数/列表；项目页仍显示这些任务 | 同一任务同时出现在收集箱和项目页是重复；项目页才是项目任务的归属，收集箱应只保留未处理入口 | `src/lib/gtd.ts`、`src/components/gtd/GtdView.tsx`、`src/components/gtd/GtdCalendarInbox.tsx` |
| D-018 | 事务侧栏把「已完成 / 已归档」从主导航移到侧栏底部的固定分隔区（`CollapsibleSidebar` footer）；项目页的已完成任务改为静态分组标题，始终展开、不提供折叠 | 完成/归档是低频回顾入口，不应插在日历/收集箱/项目之间；项目页已完成条目需要常驻可见，折叠只增加一次点击 | `src/components/gtd/GtdView.tsx`、`src/components/gtd/GtdProjectDetail.tsx`、`src/components/gtd/GtdSectionHeading.tsx` |
| D-019 | 删除独立收集箱视图与侧栏入口：日历右栏的收集箱卡是唯一收集箱，去掉「查看全部」；`GtdViewKey` 不再包含 `inbox`，长收集箱在卡片内滚动 | 右侧卡片已完整复用收集箱的输入/列表/操作，单独一页和导航是重复；统一入口后事务侧栏更短 | `src/components/gtd/GtdView.tsx`、`src/components/gtd/GtdCalendarInbox.tsx`、`src/shared/models.ts` |
| D-020 | 日期模型从「单日锚点（取较早者）」改为「起始/截止闭区间」：`scheduledDate` = 起始、`dueDate` = 截止；单边日期视为同一天，起始晚于截止的旧数据按截止归一为单日；首次设置一边时另一边为空才补齐，之后两边独立编辑（只在区间倒置时夹取）；任务在区间内**每一天**都出现在月网格和 agenda；只有 `今天 > 截止` 才逾期，起始过去不标红；月网格每天重复 chip，多日任务不可拖拽、在任务详情改起止；agenda 顶部固定「逾期」组，卡片标题显示选中日期，条目里不再重复起始日，只保留截止/逾期提示 | 旧模型把计划和截止压成一个出现日期，截止早于计划时会被拉前，计划日过去就被标成逾期，容易误解；区间模型更接近“某天有哪些任务在进行”的日程心智；重复 chip 和手动改多日日期换取实现简单、行为可预期 | `src/lib/gtd.ts`、`src/components/gtd/GtdCalendar.tsx`、`src/components/gtd/GtdCalendarAgenda.tsx`、`src/components/gtd/GtdTaskRow.tsx`、`src/components/gtd/GtdTaskModal.tsx`、`src/components/gtd/DueDateChip.tsx`、`src/components/gtd/GtdView.tsx` |
| D-021 | 全局快速记录改为独立小窗：`showQuickCaptureWindow` 创建 frameless/always-on-top/skipTaskbar 的 `quick-capture.html`，不再恢复/显示主窗口；小窗保存后 `quick-capture:submit` 关窗并让主窗口派发 `gtd-changed`；渲染层兜底 `QUICK_CAPTURE_EVENT` 走 `quick-capture:open` 打开同一小窗；删除 `QuickCaptureModal` | 用户只需要输入一条记录，不应把整个主界面带到前台；独立窗口可以只显示弹窗、保持主窗口原来的最小化/后台状态 | `electron/main.ts`、`electron/preload.ts`、`src/App.tsx`、`src/quickCapture.tsx`、`quick-capture.html`、`vite.config.ts` |
| D-022 | 关闭行为可选退出 / 最小化到托盘，开机启动可选且默认只驻留托盘：托盘按需创建（关闭到托盘、隐藏启动、或开启隐藏自启）；`--hidden` 启动不建主窗口、vault watcher 由渲染层触发、PDF 库延后到首次建窗；快速记录小窗不预热；打包版单实例锁 | 兼顾秒开与后台占用：仅托盘时只有主进程+托盘，隐藏主窗口保留渲染进程换取即时恢复；预热小窗或卸载主窗口都会带来常驻内存或丢编辑/标签状态 | `electron/main.ts`、`src/shared/settings.ts`、`src/components/settings/GeneralSection.tsx`、`src/shared/models.ts` |
| D-023 | 新增全局「呼出主界面」快捷键 `showMain`（默认 `Ctrl+Shift+M`）：与 `quickCapture` 一起由 `applyGlobalShortcuts` 注册，`GLOBAL_SHORTCUT_ACTIONS` 标注 OS 级动作；注册结果统一经 `shortcuts:get-global-status` 给设置页做失败提示；渲染层不处理 `showMain` | 托盘/隐藏启动时主窗口可能不存在，只有 OS 级快捷键可靠；把全局动作的注册状态统一，避免再维护一套 quick-capture 专用状态 | `src/shared/shortcuts.ts`、`electron/main.ts`、`electron/preload.ts`、`src/components/settings/ShortcutsSection.tsx` |
| D-024 | 统一快速记录术语：功能/快捷键「全局快速记录」，界面「快速记录小窗」，写入位置「收集箱」；英文 Quick capture / quick capture window；文档与注释不再用「全局捕获」「快速捕获」；代码标识符保持 `quickCapture`，不与中文逐字绑定 | 现状 UI/docs 有三套叫法；英文已统一为 GTD 的 capture，重命名代码要迁移已存的 `shortcuts` JSON，收益低 | `src/i18n/zh.ts`、`src/i18n/en.ts`、`src/quickCapture.tsx`、`docs/ai/glossary.md`、`docs/architecture/features.md` |
| D-025 | 冷启动固定落在事务-日历：`workspace_v1` 仍保存完整现场，但冷启动只恢复标签与上次资料库，`module`/`activeId`/`split` 置空；窗口由托盘/第二实例/`app:activate` 重建时 `createWindow(true)` 带 `?restore-workspace=1`，恢复完整现场；已有窗口的托盘恢复不重新 hydrate；hydration 前由深链打开的文档优先；设置项改名为「恢复上次打开的文档标签」 | 用户要求每次启动都从首页开始；标签是工作上下文，页面与分屏属于现场，托盘恢复不应被重置；深链是外部显式打开，不能被首页覆盖 | `src/lib/workspace/WorkspaceProvider.tsx`、`electron/main.ts`、`src/App.tsx`、`src/i18n/zh.ts`、`src/i18n/en.ts` |
| D-026 | 事务项目列表支持手动排序：`gtd_projects` 新增 `sort_order`，旧库按 `created_at DESC` 回填 0..N 保持原顺序；进行中列表按 `sort_order ASC` 读取，拖动由 `reorderGtdProjects` 整组写回；归档列表仍按 `archived_at DESC`，新建项目取 `MIN(sort_order)-1` 排最前 | 项目列表需要像笔记收藏集一样可拖动；只改进行中列表，归档保持时间序；新建项目沿用原来“最新在前”的可见位置 | `electron/database.ts`、`electron/main.ts`、`electron/preload.ts`、`src/components/gtd/GtdProjectList.tsx`、`src/components/gtd/GtdView.tsx` |
| D-027 | 笔记库仓库列表支持手动排序：`LibrarySidebar` 的 vault 行用 `useSortable`（id `vault-<path>`），`LibraryView` 与 `DocumentSidebar` 的 `DndContext` 统一处理并渲染 `VaultDragPreview`；顺序直接写回 `vault_paths`，不新增排序键；`persistVaultOrder` 先派发 `vaults-order-changed` 做乐观更新，失败回滚 | 仓库顺序只属于 `vault_paths`，设置页与侧栏必须共用一份；复用现有 DnD/浮层与排序交互，避免再维护一套顺序 | `src/components/library/LibrarySidebar.tsx`、`src/components/library/LibraryView.tsx`、`src/components/workspace/DocumentSidebar.tsx`、`src/lib/vaultOrder.ts`、`src/App.tsx` |
| D-028 | 收集箱支持手动排序，日程 agenda 不参与：`gtd_tasks` 新增 `inbox_order`，旧库按 `created_at DESC` 回填；收集箱按 `inbox_order` 排序，拖拽由 `reorderGtdInboxTasks` 整组写回；新建/重新进入收集箱的任务取 `MIN(inbox_order)-1` 排最前；日程仍按 `compareTasksByDeadline` | 收集箱是稳定列表，手动顺序有意义；日程是按日期过滤的派生视图，同一任务跨多天，按天排序需要额外表，先只做收集箱 | `electron/database.ts`、`electron/main.ts`、`electron/preload.ts`、`src/lib/gtd.ts`、`src/components/gtd/GtdCalendarInbox.tsx`、`src/components/gtd/GtdView.tsx` |
| D-029 | 项目资料改为纯链接（取代 D-012）：删除 `gtd_project_folders` 与项目文件夹 IPC；`project_vault_path` 改为默认资料仓库；项目页新建落到 `default_notes_dir`/`canvas_dir` 后立即写链接；`gtd:project-link-index` 提供全量绑定，`ProjectLinksProvider` + `ProjectLinkMarker` 统一列表标记和工具栏跳转；旧 `Projects/<项目>/*.json` 由目录扫描继续兼容 | 资料应能来自任意仓库，而不是被专用文件夹绑死；列表标记与编辑器按钮需要同一份数据，避免逐文件 IPC；旧文件不能因删表/删项目而失效 | `electron/database.ts`、`electron/main.ts`、`electron/preload.ts`、`src/lib/projectLinks.tsx`、`src/components/ProjectLinkMarker.tsx`、`src/components/gtd/GtdProjectDocs.tsx`、`src/components/gtd/GtdProjectDocCreateModal.tsx` |
| D-030 | 网页资源改为资料库的固定单例来源（`LibraryRef.kind = "resources"`，无路径）：删除顶级 resources 模块；数据仍存 SQLite，标签作侧栏分组；`useResourceLibrary` 在 `LibraryDataProvider` 常驻；工作区侧栏复用同一 `LibrarySidebar`；旧工作区 `module: "resources"` 在 resume 时迁移为 `library + resources` | 资源本来就是全局唯一、无磁盘根的数据源，缺的只是资料库来源这层身份；照 PDF 库模式可复用资料库外壳且不改 DB/IPC；不把假路径塞进 `vault_paths` 才能保住路径安全、私密仓库与扫描不变量 | `src/lib/workspace/types.ts`、`src/lib/workspace/WorkspaceProvider.tsx`、`src/components/library/LibraryDataProvider.tsx`、`src/components/library/useResourceLibrary.ts`、`src/components/library/LibrarySidebar.tsx`、`src/components/library/ResourcesLibraryContent.tsx`、`src/components/library/ResourceTagList.tsx`、`src/App.tsx` |
| D-031 | 三类仓库（笔记/PDF/网页资源）在展示层共用一套分组抽象：`LibraryGroup` 适配器不改存储；`GroupNavRow` / `SectionCard` / `CollectionDialogs` / `LibraryTitle` / `SearchLimitHint` 统一行、卡片、对话框、标题；`useLibraryDnd` + `LibraryDragOverlay` 统一排序与投放；`librarySources` 集中来源元数据；`librarySelection` 统一选择记忆 key；资源标签新增 `last_resource_tag` 持久化 | 资源接入后侧栏行/卡片/对话框/拖拽出现第三套近似实现；把差异留在数据适配器、把交互收口到共用组件，既统一手感又不合并 sidecar/SQLite 存储与搜索/打开语义 | `src/components/library/libraryGroups.ts`、`librarySources.ts`、`GroupNavRow.tsx`、`SectionCard.tsx`、`CollectionDialogs.tsx`、`useNotePdfDialogs.ts`、`useLibraryDnd.ts`、`LibraryDragOverlay.tsx`、`LibraryTitle.tsx`、`SearchLimitHint.tsx`、`src/lib/librarySelection.ts`、`ResourceTagList.tsx`、`LibrarySidebar.tsx`、`LibraryView.tsx`、`DocumentSidebar.tsx` |
| D-032 | AI 画白板走独立 stdio MCP 服务（`integrations/prism-canvas-mcp`）：只读写 `<vault>/<canvas_dir>/*.json`，格式层由 `src/lib/canvas/model.ts` 编译复用；工具必须显式指定仓库、私密库拒绝、写前比 mtime、不新增 Prism watcher；DSH 经 `@deepseek-ai/dsh-mcp-client` bundle 接入（`serverName: prism_canvas`） | 不侵入 Prism 数据层与加密逻辑，AI 和手工编辑共用同一份格式；文件级集成让任意 MCP 客户端都能用；接受“切换资料库/重启后可见”避免在主进程加目录监听与 IPC | `integrations/prism-canvas-mcp/**`、`docs/architecture/ai-canvas.md`、`package.json` |

## 3. 硬坑

- `better-sqlite3` 是原生模块，升级 Electron/重装依赖后必须 `npm run rebuild`。
- Vite 固定 5173 且 `strictPort`；换端口会让 Electron 白屏。
- 路径比较必须走 `pathKey`/`normalizePath`；Windows/macOS 大小写不敏感。
- 笔记保存要把真实 mtime 写进 DB，否则 watcher 会重复扫描。
- 通过 IPC 新建笔记（尤其项目资料）后要主动推送 `vault:updated`；否则隐藏中的笔记库会保留旧列表，新文件也不一定被 watcher 立即发现。
- `gtd_projects.sort_order` 的迁移必须在 `migrateGtdV2` 之后回填，并按 `created_at DESC` 保持旧的最新在前顺序；漏回填会让所有项目按 id 排。
- 冷启动回日历只在 `WorkspaceProvider.hydrate` 里做；不要监听窗口 `focus`/托盘显示去切模块，否则托盘恢复会丢现场；托盘重建窗口必须走 `createWindow(true)`，否则 `?restore-workspace=1` 丢失、现场无法恢复。
- 托盘驻留/`--hidden` 启动时没有主窗口：`window-all-closed` 必须放行，否则关掉快速记录小窗会把应用一起退出。
- `app.setLoginItemSettings` 只在打包版写（开发模式注册的是 electron.exe）；托盘图标依赖 `public/icon-16.png` 被打包。
- 私密库锁定后标签会关闭、索引不可用；不要把它当 bug。
- 白板标签用 `display:none` 隐藏；React Flow 会写内联 `visibility`，祖先 visibility 方案无效。
- MCP 桥接的 `server/package.json` 必须声明 CommonJS：bundle 根 `"type": "module"` 会让 `server.js` 按 ESM 运行并报 `require is not defined`，DSH 侧只显示 `Connection closed`。另外 `cordis.patch.yml` 里是绝对路径，仓库搬家后要改并重装。
- 资料库 `CanvasGroup`（侧栏分组）与画布 `CanvasGroup`（内部容器）是两个类型，不要混用。
- 编辑器块编辑必须走 `BlockSession`/container spec；直接 focus 子编辑器会破坏选区恢复。
- `LibraryRef` 增加 `resources` 后，所有读取 `library.vaultPath` 的分支必须先窄化（`note`/`canvas`）；网页资源不是 `vault_paths` 仓库，不要给它路径、扫描、watcher 或私密逻辑。
- 资料库分组统一走 `LibraryGroup` + `GroupNavRow` / `SectionCard` / `CollectionDialogs`；新增来源不要复制侧栏行、对话框或 `useLibraryDnd` 的状态机。
- `docs/reference/*` 是生成物；改源码后跑 `npm run docs`，不要手改。
- 发布前核对 `release/latest.yml` 与实际安装包文件名（历史上出现过不一致）。

更多见 [排错](../guides/troubleshooting.md)。

## 4. 进行中 / 待办

- 无已知进行中重构。
- 可选后续（未排期）：为编辑器/白板补最小自动化冒烟；评估是否把 md smoke test 的 esbuild 固定为 devDependency。

## 5. 更新协议

- **小改**（调色、局部布局、单组件行为、普通 bugfix）：只改代码，不动本文件。
- **契约变化**（IPC/DB/设置/快捷键/主题/i18n）：`npm run docs` + `npm run docs:check`。
- **整块功能/重构**：更新对应 `docs/architecture/*`；在本文件「快照/决策/待办」补稳定结论。
- **发布**：更新 changelog 与版本；刷新「最后核对」；`npm run release:win`。
- **发现新坑**：在 [排错](../guides/troubleshooting.md) 补条目，这里只留一句索引。
- 本文件 ≤150 行；不写逐条提交记录，不复制 API/表结构。
