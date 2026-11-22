# 功能域导览

本文件按功能域回答「从哪里进、主流程怎么走、哪些不变量不能破、改这里要动哪些文件、怎么验收」。路径均为仓库内真实文件；行为细节以源码为准，标「见源码」处表示本文未给出结论。

## 1. 资料库-笔记

**入口**
- `src/components/library/LibraryView.tsx`：按 `workspace.library.kind`（`note` / `pdf` / `canvas` / `resources`）渲染内容区，侧栏 `LibrarySidebar` 经 `ModuleSidebar` Portal 进全高槽位（`src/components/AppSidebarSlot.tsx`）。
- `src/components/library/LibraryDataProvider.tsx`：一次装配 `useNoteLibrary`、`usePdfDocuments`、`usePdfCollections`、`useCanvasLibrary`、`useResourceLibrary`，组件用 `useLibraryData()` 取。
- 笔记内容 `NoteLibraryContent`；收藏集状态 `src/components/useCollections.ts`；收藏集详情与分组拖拽 `src/components/CollectionDetail.tsx`；共享类型 `src/components/collectionTypes.ts`。

**主流程**
1. 切库：`useNoteLibrary` 用 `getVaultLibrarySummary` 一次拿到 notes + collections 后同批提交（`notes` / `collections` / `dataVaultPath` / `shownVaultPath` 必须一起 set）。
2. 冷启动走 `initialLoading` 全屏 spinner；暖切换（已有数据）保留旧库数据变暗，超过 150ms 才显示 `vault.switching`，避免快切闪烁。
3. 扫描：主进程 watcher 800ms 防抖 → `scanVaultIncremental` 按 mtime 差量 → `vault:updated` 推 `NoteListChanges`；渲染层 `mergeNoteChanges` 就地 patch（保留行对象身份），搜索态改为重新查询。
4. 搜索：标题 `searchNotes`（`vault:search`）、正文 `searchNoteContents`（`vault:search-content`，结果进 `ContentSearchView`）；范围记忆在 localStorage `prism_note_search_scope_v2_<vault>`；上限来自 `search_result_limit`，命中上限有提示；收藏集视图内不提供搜索。
5. 收藏集：侧车文件 `.prism/collections.json`（`note-collections:load/save`）；`useCollections` 提供 CRUD、分组、跨收藏集移动、批量加入/删除；写入经 `src/lib/useDebouncedJsonPersist.ts` 防抖；删除收藏集可用 toast 的撤销快照恢复。
6. 拖拽：`LibraryView` / `DocumentSidebar` 的 `DndContext` 处理「笔记 → 侧栏收藏集」、收藏集排序与仓库列表排序；仓库 id 为 `vault-<path>`，顺序直接写回 `vault_paths`；`CollectionDetail` 内是组卡片排序、笔记在「未分组/组」之间移动与组内排序，id 约定 `group-<id>` / `note-<relPath>` / `coll-<id>`。
7. 批量：`selectMode` + `BatchActionBar` → 加入收藏集，或 `trashFiles` 后对成功项补 `deleteNotes`（否则下次 `loadNotes` 会复活）并 `removeDocs` 关标签。
8. 重命名/回收站：`renameNote` 成功后 `updateNotePaths` 改写收藏集路径、`updateDoc` 同步标签标题；单条删除同样先 `trashFile` 再 `deleteNotes`。

**不变量**
- 单个收藏集内：一条笔记要么在根 `notePaths`，要么在恰好一个分组；跨收藏集可以重复（「加入收藏集」不清除其它收藏集的成员）。
- 路径是库内相对路径 + 正斜杠；比较统一走 `noteKey`（大小写不敏感）。
- 收藏集只存路径，不存内容；外部改名后仅在「同名笔记唯一」时自动重链，歧义或缺失保留 `missing` 标记（搜索期间跳过自愈）。
- 收藏集写入被 `dataVaultPath === vaultPath` 把关：暖切换期间宁可丢弃也不写错库。
- `last_coll_<vaultPath>` 记住选中收藏集；白板用哨兵 `__canvas__`（`CANVAS_VIEW_ID`）。
- 仓库列表顺序就是 `vault_paths` 数组顺序：拖动只改顺序，不改库内容；先派发 `vaults-order-changed` 乐观更新，写入失败回滚；设置页与侧栏共用这一份顺序。

**常见改动点**
- 新增收藏集操作 → `useCollections` 加 handler，再在 `NoteLibraryContent` 挂按钮/菜单；XOR 由 `handleMoveNote` / `handleMoveNoteDirect` 维护。
- 行样式与徽标 → `NoteLibraryContent` + `ItemRow` / `Badge`；颜色只经 `collectionColorByName` / `resolveTagColor`。
- 搜索语义 → 主进程 `searchNotes` / `searchNoteContents`（LIKE 而非 FTS5，CJK 安全）。

**验证**
- 两个 vault 来回切，确认无残留笔记、无错库写入；外部改名后收藏集不出现「缺失」；跨组/跨收藏集拖拽与批量回收站后重开仍在原位（被删的除外）。

## 2. 资料库-PDF

**入口**
- 库页 `src/components/library/PdfLibraryContent.tsx`（注意在 `library/` 下，不在 `pdf/` 下）；阅读器 `src/components/pdf/PdfReader.tsx` 由工作区分屏挂载。
- 扫描与文档列表：`src/components/pdf/PdfDocumentsProvider.tsx` → `usePdfLibrary`，在 `src/main.tsx` 根部提供，全应用共享一次扫描。
- 收藏集 `src/components/pdf/usePdfCollections.ts`；类型与 URL 工具 `src/components/pdf/types.ts`；网格与卡片 `PdfGridView` / `PdfCard` / `PdfCover`。

**主流程**
1. 库根：设置项 `pdf_repo_path` → `getPdfState` → `listPdfs()`；`choosePdfRepo` 选目录后写设置；`rescanPdfs` 手动重扫。
2. 扫描（主进程 `scanPdfRepoIncremental`）：递归收 `.pdf`、跳过点目录，按 `modified_at` 差量 upsert；某目录读取失败（`complete=false`）时**不**推断删除；删行同时删封面文件并推 `pdf:updated`。
3. 封面：`PdfCover` 在进入可视附近后（`IntersectionObserver` + 2 并发队列）用 pdf.js 渲染首页 JPEG（宽 360），`savePdfCover` 落到 `userData/pdf-covers/<id>.jpg` 并 bump `coverVersion`；`coverDirty` 表示待重建；自定义封面走 `choosePdfCover` / `resetPdfCover`。
4. 阅读：`PdfReader` 用 `pdfDocumentUrl`（即 `prism-pdf://doc/<id>`）流式加载，`setPdfPageCount` 回写页数；页码/缩放/双页按文档 id 存在模块级 `readerStates`；书签目录由 `src/components/pdf/pdfOutline.ts` 后台解析，不阻塞首页。
5. 排序/搜索：`usePdfLibrary` 支持 title/added/modified/pages + 升降序，默认方向随字段（title 升，其余降），同分用标题自然序兜底；搜索匹配标题与相对路径，上限 `search_result_limit`。
6. 收藏集：`<repo>/.prism/pdf-collections.json`，选中项记 `last_pdf_coll_<repoPath>`；库页在扫描后调 `pruneMissing` 清掉已不存在的成员；「PDF 卡片拖到侧栏收藏集」由 `LibraryView` 的 `DndContext` 处理。
7. 嵌入：笔记里指向 PDF 的嵌入由 `src/components/embeds/loader.ts` 调 `resolvePdfEmbed`（主进程按相对路径或标题定位单行），`src/components/embeds/EmbedCard.tsx` 用 `pdfCoverUrl` 显示封面。
8. 删除：卡片菜单 → `deletePdfDocuments`（回收站 + 删行 + 删封面），成功后 `removeDocs` 关标签。

**不变量**
- `prism-pdf://` 只服务 `pdf_documents` 中、且路径落在当前库根内的行（主进程 `resolvePdfDocument` 把关）；带 Range，禁止整文件读进内存。
- `prism-cover://cover?id=…&v=…` 只服务 `userData/pdf-covers` 下已存在的 JPEG，`v` 参与缓存失效；渲染层永远不直接读磁盘。
- 封面生成失败按 `(id, modifiedAt)` 记住，同一文件本会话不重复重试。
- 收藏集只存库内相对路径（正斜杠），比较用 `relKey`（大小写不敏感）；外部改名后成员被清理，不做猜谜式重链。

**常见改动点**
- 排序字段/方向 → `src/components/pdf/types.ts` 的 `PdfSort` + `usePdfLibrary` 的 `DEFAULT_DIR` / `compareField`。
- 封面尺寸、并发、触发距离 → `PdfCover.tsx` + `src/components/pdf/pdfjs.ts`；落盘在 `electron/main.ts` 的 `pdf:save-cover`。
- 协议与路径校验 → `electron/main.ts` 的 `registerPdfProtocol` / `registerCoverProtocol`，不要绕过 `resolvePdfDocument`。
- pdf.js 的字体/CMap/wasm 资源走 `prism-asset://`，具体映射见源码 `registerPdfjsAssetProtocol`。

**验证**
- 换库根后旧列表不残留；外部增删 PDF 后网格自动更新且封面按需重建；大文件能翻页（Range 生效）；收藏集成员在文件被删后自动清理。

## 3. 白板库（资料库侧）

**入口**
- `src/components/library/CanvasLibraryContent.tsx`：`LibraryView` 在 `workspace.library.kind === "canvas"` 时渲染；侧栏「白板」选项卡与「全部笔记」平级。
- 文件列表与 CRUD：`src/components/canvas/useCanvasLibrary.ts`；分组：`src/components/library/useCanvasGroups.ts`。

**主流程**
1. 白板是文件不是 DB 行：默认 `<vault>/<canvas_dir>/*.json`（`canvas_dir` 默认 `canvases`）；项目页新建的白板也落在白板目录，不再建项目专用文件夹。旧的 `<vault>/Projects/<项目>/*.json` 仍会出现在 `listCanvases` 中作为兼容。
2. 创建/重命名/删除分别 `createCanvas` / `renameCanvas` / `trashFile`，成功后派发 `prism:canvas-changed`（`src/lib/canvas/events.ts`），同库的列表与嵌入预览据此刷新。
3. 分组存在 `.prism/canvas-groups.json`（`loadCanvasGroups` / `saveCanvasGroups`）；删除分组后成员自动回到「未分组」。
4. 选中状态与收藏集共用记忆槽：`last_coll_<vaultPath>` 写 `__canvas__`（`CANVAS_VIEW_ID` 定义在 `src/components/library/useNoteLibrary.ts`）。
5. 展示复用 `CollectionDetail`，所以拖拽、折叠、右键菜单与笔记收藏集保持同一套交互。

**不变量**
- 分组路径是库内相对路径 + 正斜杠，大小写不敏感去重；「未分组」= 全部文件 − 各组路径，永远由数据推导，不落盘。
- 删除白板时同时 `removePaths` 清分组、并关闭同路径的标签页。
- 分组写入按库归属防抖回写（`saveVaultRef`），切库不会把旧库分组写到新库。
- 节点/边/容器与保存冲突属于画布编辑器，见 [canvas](./canvas.md)。

**常见改动点**
- 库侧只改列表、分组、打开标签；不要把画布编辑逻辑塞回这里（链接同上）。
- 新建白板弹窗 → `src/components/canvas/CreateCanvasModal.tsx`。

**验证**
- 新建 → 改名 → 删除后侧栏计数与分组同步；外部删掉文件后分组不残留；切库再回来分组仍在；打开白板后标签页标题跟随改名。

## 4. 事务

**入口**
- `src/components/gtd/GtdView.tsx`：侧栏主区 `calendar` / `project`；`completed` / `archived` 放在侧栏底部的固定分隔区（`CollapsibleSidebar` 的 footer）；默认日历；冷启动固定进入事务-日历（恢复标签但不恢复激活文档/分屏；主页模块已移除）；托盘/第二实例重建窗口时恢复上次现场。右栏渲染 `GtdCalendar` / `GtdCompleted` / `GtdProjectDetail`；收集箱不再是独立视图，只在日历右栏。原来的「即将」视图已移除。
- 视觉组件：`GtdProgressRing`（项目环）。
- 全局快捷键打开独立的快速记录小窗（`quick-capture.html` / `src/quickCapture.tsx`），不唤起主界面；内容直接进收集箱。收集箱、日历当日 agenda 与项目页输入框也能直接记录。
- 行 `GtdTaskRow`、详情 `GtdTaskModal`、日期 `GtdDueDateModal` + `DueDateCalendar`；项目新建 `GtdProjectCreateModal`；日历 `GtdCalendar` + `GtdCalendarAgenda` + `GtdCalendarInbox`；项目资料 `GtdProjectDocs` + `GtdProjectLinkPickerModal` + `GtdProjectDocCreateModal`。
- 设置 → 事务：`project_vault_path` 指定默认项目资料仓库；新建/关联时默认选中，不再代表项目文件夹。

**主流程**
1. 记录：收集箱、日历当日 agenda、项目页或全局快捷键 → `addGtdTask`（默认无日期）→ 派发 `gtd-changed`；`GtdView` 重新拉取 `getGtdOpenTasks`。
2. 日历主页布局：顶部一行两栏——左侧是选中日 agenda（默认今天，跟随月历选中的日期），卡片标题直接显示选中日期；右侧是收集箱（标题/计数 + 记录输入框 + 未安排任务列表）；下方是全宽月网格。月网格不再固定半屏，而是占满剩余高度：`GtdCalendar` 用 `buildMonthGrid` 生成 42 格并按自然周拆成 6 行，前后各补 2 个假周（64px、无任务、不可点）作为滚动缓冲；按选中日期所在周展开（184px），上下周 112/96px，其余 84px；滚动聚焦当前周，上下边缘用 48px 渐变淡出，首末周靠缓冲周也能居中。任务在起始到截止之间**每一天**都显示 chip；点日期在顶部 agenda 查看，今天/未来可直接添加；只有单日任务可拖拽改期，多日任务在任务详情里改起始/截止。agenda 条目不再重复选中日期的起始日，只在截止日不同或逾期时显示截止/逾期提示；逾期任务在任何选中日期都固定出现在 agenda 顶部「逾期」组。右上收集箱复用 `InboxCapture`（默认无日期）与 `GtdTaskRow`；新增任务派发 `gtd-changed`，计数与列表即时刷新；收集箱没有独立页面，长列表就在卡片内滚动。
3. 日期区间：`scheduledDate` = 起始日期，`dueDate` = 截止日期，均为本地 `YYYY-MM-DD`；只有一边时视为同一天，`起始 > 截止` 的旧数据按截止日归一为单日。任务在 `[起始, 截止]` 的每一天都算当日日程，月网格每天重复 chip、agenda 每天列出。`src/lib/gtd.ts` 用 `taskDateRange` / `isTaskActiveOn` / `isTaskOverdue`；收集箱只收**无日期且未归项目**的任务，已归项目且无日期的任务只进项目页。只有 `今天 > 截止` 才算逾期，起始日过去不再标红。
4. 完成：`completeGtdTask` 写 `completed_at`，任务离开所有未完成视图；`GtdCompleted` 按完成日期分组，可撤销或删除；「清空已完成」作为工具栏 `actions` 的图标按钮，不再单独占一行。
5. 项目：`addGtdProject` 建项目，默认排在进行中列表最前；进行中项目可在侧栏拖动调整顺序（`@dnd-kit`，参考笔记收藏集），松手后 `reorderGtdProjects` 把顺序写入 `gtd_projects.sort_order`；归档列表不参与拖动，仍按归档时间排序。任务详情或行菜单「加入项目」；项目页左侧是输入和任务列表，右侧栏把项目标题与进度概览合并成一块，下面是纯文本描述与项目资料；重命名、编辑介绍、资料新建/关联、收起右栏都在工具栏，归档/删除通过左侧项目右键菜单；全部完成不弹归档提示。
6. 收集箱：日历右栏的收集箱列表用 `SortableList` 拖动排序，顺序写入 `gtd_tasks.inbox_order`；新任务、取消项目/日期、重新打开的任务默认排到最前。日程 agenda 仍按截止时间排序，不参与拖动。
7. 项目资料：项目资料是纯链接，不再建 `Projects/<项目>/` 专用文件夹。从项目页「新建」时选择仓库，笔记进 `default_notes_dir`、白板进 `canvas_dir`，创建后立即写入 `gtd_project_links`；「关联已有」可从任意已注册仓库选择笔记或白板，文件留在原地。文档和白板合并为一个资料列表，不显示分组标题，点击作为 workspace 标签打开；文件可在资源管理器中显示。笔记库、收藏集详情和白板库的标题后显示项目标记（`ProjectLinkMarker`），点击可跳回项目；编辑器/白板工具栏的同一入口保留，单项目直达，多项目下拉，归档项目跳到已归档列表。旧 `Projects/<项目>/*.json` 仍可扫描、打开、保存，但不参与新建。主进程创建笔记后推送 `vault:updated`，隐藏中的笔记库列表不会停留在旧快照。
8. 日期编辑：任务详情里设起始时，如果截止为空则自动把截止设为同一天；设截止时对称处理。两边都有值后，修改任一边不会拖动另一边（只在起始晚于截止时夹取成合法区间）。清除任一日期会清空整段区间。拖拽只移动单日任务（起始=截止），多日任务不提供拖拽，需在任务详情手动改起止。
9. 快速记录小窗：主进程 `globalShortcut`（或渲染层 `QUICK_CAPTURE_EVENT` 兜底）→ `showQuickCaptureWindow` 创建/聚焦独立小窗（frameless、always-on-top、skipTaskbar）；小窗加载 `quick-capture.html`，录入后仍走 `addGtdTask`（无项目、无日期，即进收集箱），再 `quick-capture:submit` 关窗并通知主窗口派发 `gtd-changed`；主窗口的显示状态不变。

**不变量**
- 任务没有 `status` 枚举：`completedAt` 为空即未完成；项目没有“完成态”，只有 `archivedAt`。
- 项目是可选透镜：任务属于一个项目或没有项目，仍按日期出现在日历；没有日期的项目任务只在项目页出现，不进入收集箱；项目页不复制任务。
- 日历是 open tasks 的日期视图，不复制任务；完成、归档项目任务不出现；任务在区间内每天出现一次，单日只出现一次。
- 日历只在本月日期上显示任务；本月外日期与前后各 2 个假周只做占位，不显示任务且不可点击。
- 日历聚焦周 = 选中日期所在周；切换日期/月份时滚动到该周并居中；聚焦周固定展开，其他周按距离压缩。
- 日历主页顶部左 agenda 跟随选中日期，右收集箱只列无日期且未归项目的任务；两栏都复用 `GtdTaskRow` 的完成与右键菜单，完成/删除后经 `gtd-changed` 刷新。月网格全宽、占剩余高度，不再固定 50%。
- 起始/截止是闭区间；单日期任务等价于起始=截止。逾期只看截止：`今天 > 截止` 且未完成；起始过去不标红。
- 收集箱手动顺序只由 `gtd_tasks.inbox_order` 决定；日程 agenda 仍按截止时间排序。进入收集箱（新建、清空项目/日期、重新打开）的任务取 `MIN(inbox_order)-1` 排最前。
- 单日任务可拖拽，拖到哪天就把起始和截止都设为那天；多日任务不可拖拽，避免改一半区间。
- 逾期组固定在 agenda 顶部，不随选中日期隐藏；选中日期落在某个逾期任务的原区间时，该任务只出现在当日列表，不重复进逾期组。
- `getGtdOpenTasks` 过滤归档项目：归档项目的任务只在项目页/已归档可见且只读；取消归档恢复。
- 删除项目不级联：未完成任务 `project_id` 置空回到收集箱/日期视图，已完成任务保留在日志（失去项目徽标）。
- 完成日志只取最近 200 条；「清空已完成」只清未归档项目的任务，归档项目历史保留。
- 项目资料 = 链接记录；文件仍是库里的普通 `.md` / canvas `.json`，不复制、不内嵌。
- 术语统一：功能与快捷键叫「全局快速记录」，界面叫「快速记录小窗」（UI 标题显示「快速记录」），写入位置是收集箱；英文统一 Quick capture / quick capture window，不再使用「全局捕获」「快速捕获」。
- 项目资料不再有专用文件夹；已有 `Projects/<项目>/` 只是历史文件位置，仍可扫描/打开/保存，删除项目不影响磁盘文件。
- 项目页“新建”的文件落在所选仓库的常规位置（`default_notes_dir` / `canvas_dir`）；“关联已有”的文件留在原库。白板库可见范围是 `canvas_dir` 与旧 `Projects/*/`。
- 项目/链接缺失时显示 missing；归档项目可打开资料，但不能新建/关联/取消关联；私密库操作要求解锁。
- `addGtdTask` 可选第三参数 `scheduledDate`；`gtd_projects` 新增 `sort_order` 保存侧栏顺序，`gtd_tasks` 新增 `inbox_order` 保存收集箱顺序；日程顺序不落库。
- 项目顺序只对进行中列表生效：拖动不会改变归档列表（`archived_at DESC`），取消归档后项目回到它的手动位置；新建项目默认 `sort_order = min - 1`，排在最前。
- 旧 `gtd_items`/`gtd_actions` 由 `settings.gtd_v2_migrated` 标记做一次性迁移，迁移前写 `prism.db.pre-gtd-v2.bak`。
- 归档项目只读不只靠 UI：`updateGtdTask` / `completeGtdTask` / `reopenGtdTask` / `deleteGtdTask` 都在 DB 层拒绝归档项目任务；资料写操作同样在 DB/IPC 层拒绝。

**常见改动点**
- 新字段/查询 → `electron/database.ts` 的 `gtd_tasks` / `gtd_projects`、`toGtdTask`/`toGtdProject`，再同步 `src/shared/models.ts`。
- 分层规则 → `src/lib/gtd.ts`；日期原语/月网格 → `src/lib/dates.ts`。
- 项目环 → `GtdProgressRing`；颜色用项目 palette，不写死。
- 日历 → `GtdCalendar`、`GtdCalendarAgenda`、`GtdCalendarInbox`、`buildMonthGrid`；日期区间/逾期判断在 `src/lib/gtd.ts`（`taskDateRange` / `isTaskActiveOn` / `isTaskOverdue`）；周高/聚焦滚动在 `GtdCalendar`；单日拖拽用 `@dnd-kit`，多日任务不注册拖拽。
- 项目资料 → `GtdProjectDocs`、`GtdProjectLinkPickerModal`、`GtdProjectDocCreateModal`；设置项 `project_vault_path`（`GtdSection`）；主进程 `setGtdProjectLink`；白板路径兼容在 `isAllowedCanvasPath` / `listCanvasFiles`。列表标记与工具栏跳转共用 `src/lib/projectLinks.tsx` + `src/components/ProjectLinkMarker.tsx`。
- 项目页布局 → 左栏 `GtdProjectDetail` 输入/任务；右栏标题+进度同块、纯文本描述、`GtdProjectDocs embedded`；视口 ≥1100px 双栏，窄窗口保留紧凑标题条并单列滚动。工具栏 actions 放重命名、编辑介绍、资料菜单（新建/关联笔记与白板）和收起/展开右栏；归档/删除走左侧项目右键菜单，标题区不再放操作按钮。右栏折叠/展开不带动画，折叠后不渲染正文标题行；重命名时自动展开右栏。项目页的已完成任务用静态分组标题，始终展开，不提供折叠按钮。输入复用 `InboxCapture`，资料行复用 `ItemRow variant="dense"` 圆角行，文档和白板合并为一个 `.sidebar-group` 凹陷容器列表（同左侧栏分组），不显示「文档/白板」组标题；行内不重复组头图标，也不重复显示所属库名；缺失时只显示「文件不存在」。资料菜单的项目/文件/新建关联动作都通过 `GtdProjectDocs` 的 ref handle 调用；在资源管理器中显示/取消关联收进 `ItemRow` 的通用右键菜单。空态复用 `EmptyState`，选择器复用 `SelectButton`。
- 全局快速记录 → `electron/main.ts` 的 `applyGlobalShortcuts` / `showQuickCaptureWindow` / `revealMainWindow`、`quick-capture.html`、`src/quickCapture.tsx`、`ShortcutsSection`；`showMain` 为全局呼出主界面（托盘驻留时也可用）。
- 新文案 → `src/i18n/zh.ts` 与 `en.ts` 双份；新快捷键动作要同步 `SHORTCUT_ACTIONS` 与设置行（`docs:check` 会检查）。

**验证**
- 记录后不整理也能用；设今天/明天/日期后日历落在正确日期；日历默认是主视图且没有「即将」入口；顶部左 agenda 跟随选中日期并显示卡片标题日期，右侧收集箱记录/完成正常且长列表在卡片内滚动，两栏列表内部滚动；月网格全宽占剩余高度并每天重复显示区间任务；聚焦周展开、上下周渐隐、滚动可居中；跨月/跨年与中英文周起始正确；多日任务不可拖拽，单日任务拖拽后起止同为目标日；逾期组始终在 agenda 顶部且只含截止已过的任务；项目环 0/50/100%；侧栏已完成/已归档位于项目列表下方的分隔区；项目页已完成任务始终展开且没有折叠按钮。
- 项目资料：项目页新建/关联任意仓库的笔记和白板；新建文件落在常规位置并自动关联；旧 `Projects/<项目>/` 白板仍可列出/打开/保存；资料缺失/重命名/删除项目/归档/私密库路径符合预期；列表项目标记与工具栏跳转一致。
- 全局快捷键在后台/最小化/仅托盘驻留（无主窗口）时可用；旧数据迁移数量一致且不重复跑。

## 5. 网页资源（资料库来源）

**入口**
- 资料库侧栏底部固定行「网页资源库」（`src/components/library/LibrarySidebar.tsx`）→ `LibraryRef.kind = "resources"`；内容区 `src/components/library/ResourcesLibraryContent.tsx`，数据在 `src/components/library/useResourceLibrary.ts`（经 `LibraryDataProvider` 常驻）。
- 侧栏标签分区 `src/components/library/ResourceTagList.tsx`：全部资源 + 标签拖拽/右键菜单；工作区侧栏（`DocumentSidebar`）复用同一 `LibrarySidebar`。
- 主进程：`resources:*` 通道与 `fetch:title`、`resources:open-url`（`electron/main.ts`）。

**主流程**
1. 加载：`getResources()` 全量 + `getAllTags()`；搜索（防抖）走 `searchResources(query)`，上限 `search_result_limit`。hook 在 `LibraryDataProvider` 挂载即加载，切换资料库来源不重新拉取。
2. 新增：URL 无协议时自动补 `https://`；标题留空则 `fetchPageTitle(url)`（主进程 5s 超时、只流式读到 `</title>`，失败回落 URL）；`addResource` 的唯一约束冲突映射成「已存在」提示。
3. 标签：颜色 `setTagColor`（未知标签用 `hashColor` 派生），重命名 `renameTag`（重名合并后选中态跟到新名字）、删除 `deleteTag`（清空当前筛选）、全局顺序 `reorderTags`（侧栏拖拽）。
4. 排序：侧栏标签拖拽改全局顺序；卡片视图按该顺序分组，未打标签进「未分组」；列表内拖拽 `reorderResources` 只在自身占用的槽位内重排。
5. 打开：行点击与菜单都走 `window.prism.openUrl`（`shell.openExternal`）；资源不是工作区文档，没有标签页。
6. 来源记忆：上次来源存 `workspace_v1.library`；旧工作区 `module: "resources"` 在托盘重建窗口时迁移为「资料库 + 资源」。

**不变量**
- 网页资源是**全局唯一、无路径**的资料库来源：不进入 `vault_paths`，不参与扫描、watcher、私密仓库、侧车文件或路径安全。
- URL 唯一；标签是独立实体（`tags` / `resource_tags`），颜色属于标签而非资源，`Resource.tags` 只是字符串数组。
- 颜色只从 `resolveTagColor` 取，未知标签用 `hashColor` 稳定派生，禁止硬编码色值。
- 分组顺序永远跟随侧栏标签顺序，不做第二套排序。
- `fetchPageTitle` 失败不阻塞新增。
- 资源视图只读写 `resources` / `tags` / `resource_tags`，不得写 `collections.json`、`canvas-groups.json` 或 `vault_paths`。
- 搜索词与卡片折叠状态属于 UI 会话状态，放在 provider 内存中；选中标签经 `last_resource_tag` 持久化，与笔记/PDF 收藏集选择一致。

**常见改动点**
- 新增字段 → 先改 `resources` 表与 `src/shared/models.ts`，再改 `electron/preload.ts` + `electron/main.ts` 通道。
- 标签颜色/排序行为 → `src/lib/colors.ts` 与 `useResourceLibrary.ts`（`tagGroups` / `colorForTag`）。
- 资料库入口/资源行 → `LibrarySidebar.tsx`；内容布局/toolbar → `ResourcesLibraryContent.tsx`。

**验证**
- 只输域名能抓到标题；重复 URL 报「已存在」；改标签颜色/改名/删标签后列表与侧栏同步；拖标签与拖资源后重启顺序保持。
- 笔记库 / PDF / 白板 / 网页资源来回切换后资源搜索词、选中标签、折叠状态保留；资源页不产生任何库内写入；零笔记库/零 PDF/私密库锁定时资源仍可用。

## 6. 设置

**入口**
- `src/components/Settings.tsx`：右侧固定分类 `general` / `vaults`（PDF 也在此页）/ `editor` / `canvas` / `appearance` / `search` / `shortcuts` / `external`；分类记忆在 localStorage `prism_settings_category`（历史值 `pdf` 迁移到 `vaults`）。
- 分区实现都在 `src/components/settings/`，统一用 `controls.tsx` 的 `SettingRow` / `SettingBlock` / `Toggle` / `Select` / `NumberInput` / `Slider` / `SectionHeader`。

**主流程**
1. 启动：`src/lib/settings.tsx` 的 `SettingsProvider` 用一次 `getAllSettings` 批量加载，再按 `decodeSetting` 得到类型化值；业务组件读 `useSettings().values`。
2. 改动：`set(key, value)` → `normalizeSetting` + `serializeSetting` → `setSetting` → 派发 `settings-saved`（`Settings.tsx` 顶栏闪「已保存」2 秒）。
3. 重置：`reset()` 把 `SETTING_KEYS` 全部写回 `DEFAULT_SETTINGS`；`Settings.tsx` 另外把主题恢复 `violet`/深色、语言恢复中文。
4. 语言：`useT().setLang`，存 localStorage `prism_lang`（`src/i18n/index.tsx`），**不在**设置注册表里。
5. 窗口与启动（通用分区）：`close_behavior`（`quit` 退出 / `tray` 最小化到托盘）、`auto_launch`、`auto_launch_hidden`；行为都在主进程（见 [主进程](main-process.md) 的「托盘、关闭行为与开机启动」）。设置页用 `app:get-launch-state` 提示「开发模式不写启动项」「平台不支持」。

**不变量**
- 新设置项先在 `src/shared/settings.ts` 的 `AppSettings` + `DEFAULT_SETTINGS` + `SETTING_META` 注册，再写 UI；范围/枚举/颜色校验只在该文件的 `decodeSetting` / `normalizeSetting`，UI 不要重复 clamp。
- 存储是字符串；`json` 类型应提供规范化函数（`JSON_NORMALIZERS`，参考 `shortcuts`、`canvas_presets`），否则原样透传。
- 设置页不手写行布局；视觉与控件约定见 [ui-kit](../guides/ui-kit.md)，逐项键值清单见 [settings](../reference/settings.md)。
- 主题（`themeId`）与语言不在注册表，别在分区里伪造。

**常见改动点**
- 新增分区 → `Settings.tsx` 的 `SettingsCategory` + `categories`（图标/文案）+ 新 `<X>Section.tsx`。
- 新增设置项后跑 `npm run docs` 重新生成参考，否则 `docs:check` 报 stale。

**验证**
- 任一项改动重启后保留、顶栏出现「已保存」；越界输入被夹回合法区间；重置后全部回默认且语言/主题也回默认。
- 关闭行为：`quit` 关窗退出；`tray` 关窗后托盘仍在、点图标/快捷键能回到应用；开发模式的开机启动提示正确。
- 工作区恢复：冷启动固定事务-日历（标签保留、无激活文档）；关到托盘再打开保持当前页面/分屏；`--hidden` 启动后从托盘打开恢复上次现场。
- 快捷键：「呼出主界面」在任何应用/仅托盘驻留时都能把主窗口带到前台；与快速记录冲突时录制器报冲突；被其他程序占用时显示注册失败提示；修改后无需重启即重新注册。

## 7. 变更日志 / 启动屏

**入口**
- `src/components/ChangelogModal.tsx`：`src/App.tsx` 顶栏按钮打开，数据来自 `src/data/changelog.ts`。
- `src/components/SplashScreen.tsx`：`App.tsx` 启动时全屏覆盖，`hydrate()` 完成后 500ms 淡出。

**主流程**
1. changelog 每条含 `version/date/summary`，细节二选一：`highlights`（图标 + `palette` 卡片）或 `changes`（平铺列表）；最新版本在最前，每次打开默认全部折叠。
2. splash 固定展示 logo、`PRISM`、`splash.tagline` 与三个跳动点。

**不变量**
- `changelog[0].version` 必须等于 `package.json` 的 `version`，版本号严格降序、不可重复；违反会被 `npm run verify` 拒绝。
- `highlights[].palette` 只能是 `TagColorKey`；文案是中文硬编码字符串（历史记录，不进 i18n）。

**常见改动点**
- 发版：加一条 entry（`summary` 必填，大功能用 `highlights`），同步 `package.json` 版本号。

**验证**
- `npm run verify` 通过；打开变更日志能看到新版本并展开；冷启动看到 splash 且在数据就绪后消失。

## 跨域不变量

1. **DB 只经 IPC**：渲染层不碰 Node，所有 SQL 在 `electron/database.ts`；新通道同时改 `electron/main.ts` + `electron/preload.ts`，否则 `docs:check` 的 IPC 契约检查失败。
2. **路径安全**：读取/保存/附件/协议先过 `findOwningVault`（最长前缀、大小写不敏感），库外路径直接拒绝（`NOTE_OUTSIDE_VAULT` / `CANVAS_OUTSIDE_VAULT` / `VAULT_LOCKED`）；`.prism` 侧车写入还要求 `requireVaultRoot`，只接受精确库根（否则 `OUTSIDE_VAULT`）。
3. **异步列表三态**：首载无数据用 `Skeleton` / `SkeletonRows`，已加载且空用 `EmptyState`，刷新时保留旧数据不闪空。
4. **i18n 双份**：界面文案一律 `useT()` + `src/i18n/zh.ts` / `src/i18n/en.ts` 对齐（`en.ts` 以 zh 为类型源），占位符两端必须一致。
5. **收藏集 XOR**：单个收藏集内一条笔记只在根列表或恰好一个分组；白板的「未分组」由「全部文件 − 组内路径」推导，不单独存储。
6. **暖切换**：切库/切仓库时不立刻清空，旧数据留到新数据提交；写入被目标库/仓库身份校验拦住，宁可丢弃也不写错地方。
7. **事件广播**：跨面板刷新靠 window 事件——`gtd-changed`、`vaults-changed`、`settings-saved`、`prism:canvas-changed`、`prism:open-note`、`prism:vault-locked`，加上 IPC 推送 `vault:updated`、`pdf:updated`。
8. **侧车文件**：收藏集/分组/PDF 收藏集都写在对应根目录的 `.prism/*.json`；扫描忽略点目录，所以保存侧车不会触发重新索引。

## 验证

自动检查只有一条命令：

```bash
npm run verify   # = npm run lint（tsc --noEmit）+ npm run docs:check
```

`docs:check` 覆盖：生成文档是否过期、IPC 通道与 preload 双向对齐、`window.prism.*` 调用存在、Markdown 断链与反引号路径、i18n 键与占位符、变更日志版本顺序、文档行数上限。只改源码时 `npm run lint` 足够；动到功能域文档就跑完整 `verify`。

手测清单（UI 一律人工验收，不做自动化）：

- **笔记库**：两个 vault 来回切无残留；外部增删笔记自动更新；拖拽入收藏集/跨组移动；批量回收站；搜索标题与正文都命中。
- **PDF**：换库根、外部增删、封面重建、大文件翻页、收藏集成员清理、删除到回收站。
- **白板**：新建/改名/删除、分组增删与拖拽、切库后分组保持、打开标签标题同步。
- **事务**：记录后不整理可直接设日期/完成；日历按选中日期查看，收集箱只收未归项目的未安排项；完成进日志并可撤销；项目归档只读、删除后未完成任务回收集箱；全局快捷键在后台可用。
- **网页资源**：资料库侧栏固定行进入；抓标题、重复 URL、标签增删改色与排序、外部打开链接；与笔记/PDF/白板切换后筛选与折叠状态保留。
- **设置**：改项后重启保留、越界夹取、重置（含主题与语言）、`npm run docs` 后 `docs:check` 通过。
- **变更日志**：新版本在顶部且可展开；冷启动 splash 正常淡出。
