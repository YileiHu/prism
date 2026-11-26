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
5. 收藏集：侧车文件 `.prism/collections.json`（`note-collections:load/save`）；`useCollections` 提供 CRUD、分组、跨收藏集**移动**、批量移动/移出/删除；写入经 `src/lib/useDebouncedJsonPersist.ts` 防抖；删除收藏集可用 toast 的撤销快照恢复。读取时由主进程 `dedupeNoteCollections` 做唯一归属归一化。
6. 拖拽：`LibraryView` / `DocumentSidebar` 的 `DndContext` 处理「笔记 → 侧栏收藏集」、收藏集排序与仓库列表排序；仓库 id 为 `vault-<path>`，顺序直接写回 `vault_paths`；`CollectionDetail` 内是组卡片排序、笔记在「未分组/组」之间移动与组内排序，id 约定 `group-<id>` / `note-<relPath>` / `coll-<id>`。
7. 多选：所有资料库列表共用 `useMultiSelect`（`src/lib/useMultiSelect.ts`）+ `SelectModeButton` + `BatchActionBar`；`scopeKey` 管换库/换收藏集/搜索/集合时的自动退出，`keys` 管剪枝、全选与 `Shift` 区间。各来源的批量动作：笔记 = 移动到收藏集 / 移出收藏集 / 回收站（`trashFiles` 后对成功项补 `deleteNotes`，再 `removeDocs` 只关成功项的标签）；白板库 = 移出分组 / 回收站；PDF = 移动到收藏集 / 移出 / `deletePdfDocuments`；网页资源 = 移动到收藏集 / 移出（未分组）/ 删除（逐条 `resources:delete`）。
8. 重命名/回收站：`renameNote` 成功后 `updateNotePaths` 改写收藏集路径、`updateDoc` 同步标签标题；单条删除同样先 `trashFile` 再 `deleteNotes`。

**不变量**
- 单个收藏集内：一条笔记要么在根 `notePaths`，要么在恰好一个分组；**跨收藏集唯一**——一条笔记最多属于一个收藏集，否则视为未分类（读取时按「先出现者优先」去重，见 `src/shared/collectionUniqueness.ts`）。「移动到收藏集」会先从所有其它收藏集/分组移除。
- 路径是库内相对路径 + 正斜杠；比较统一走 `noteKey`（大小写不敏感）。
- 收藏集只存路径，不存内容；外部改名后仅在「同名笔记唯一」时自动重链，歧义或缺失保留 `missing` 标记（搜索期间跳过自愈）。
- 收藏集写入被 `dataVaultPath === vaultPath` 把关：暖切换期间宁可丢弃也不写错库。
- `last_coll_<vaultPath>` 记住选中收藏集；白板用哨兵 `__canvas__`（`CANVAS_VIEW_ID`）。
- 仓库列表顺序就是 `vault_paths` 数组顺序：拖动只改顺序，不改库内容；先派发 `vaults-order-changed` 乐观更新，写入失败回滚；设置页与侧栏共用这一份顺序。

**常见改动点**
- 新增收藏集操作 → `useCollections` 加 handler，再在 `NoteLibraryContent` 挂按钮/菜单；XOR 由 `handleMoveNote` / `handleMoveNoteDirect` 维护。
- 多选/批量动作 → 复用 `useMultiSelect` + `BatchActionBar`（动作写成 `BatchAction[]`），不要在页面里重写选择状态；约定见 [ui-kit](../guides/ui-kit.md) 的「多选」。
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
6. 收藏集：`<repo>/.prism/pdf-collections.json`，选中项记 `last_pdf_coll_<repoPath>`；一条 PDF 最多属于一个收藏集（读取时 `dedupePdfCollections` 去重，写入走「移动」语义）；库页在扫描后调 `pruneMissing` 清掉已不存在的成员；「PDF 卡片拖到侧栏收藏集」由 `LibraryView` 的 `DndContext` 处理，拖放即移动。
7. 嵌入：笔记里指向 PDF 的嵌入由 `src/components/embeds/loader.ts` 调 `resolvePdfEmbed`（主进程按相对路径或标题定位单行），`src/components/embeds/EmbedCard.tsx` 用 `pdfCoverUrl` 显示封面。
8. 删除：卡片菜单 → `deletePdfDocuments`（回收站 + 删行 + 删封面），成功后 `removeDocs` 关标签。

**不变量**
- `prism-pdf://` 只服务 `pdf_documents` 中、且路径落在当前库根内的行（主进程 `resolvePdfDocument` 把关）；带 Range，禁止整文件读进内存。
- `prism-cover://cover?id=…&v=…` 只服务 `userData/pdf-covers` 下已存在的 JPEG，`v` 参与缓存失效；渲染层永远不直接读磁盘。
- 封面生成失败按 `(id, modifiedAt)` 记住，同一文件本会话不重复重试。
- 收藏集只存库内相对路径（正斜杠），比较用 `relKey`（大小写不敏感）；一条 PDF 最多属于一个收藏集；外部改名后成员被清理，不做猜谜式重链。

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

## 4. 任务（养成模块内）

**入口**
- 养成 · 能力页「总览」里的「任务」卡片（`GrowthTasksCard`，由 `GrowthBoard` 渲染）：逾期 / 今天 / 未来 7 天 / 更晚 / 未安排，底部可展开「已完成」；侧栏不再有单独的任务页。
- 任务详情 `GrowthTaskModal`；卡片顶部只有一个快速输入（回车保存），日期与能力在详情里排；没有再放第二个「新建」入口。
- 全局快捷键打开独立的快速记录小窗（`quick-capture.html` / `src/quickCapture.tsx`），不唤起主界面；写入一条无日期任务后关窗并派发 `growth-changed`。

**主流程**
1. 记录：任务卡片顶部输入框或快速记录小窗 → `addGrowthTask`（默认无日期）→ 派发 `growth-changed`；`GrowthView` 重新拉取 `getGrowthTasks`。
2. 分组：`src/lib/taskDates.ts` 的 `bucketGrowthTasks` 按本地日期分为 逾期 / 今天 / 未来 7 天 / 更晚 / 未安排；区间内任务只出现一次，`逾期` 只看截止。
3. 完成：`completeGrowthTask` 写 `completed_at`，任务离开未完成分组、进入底部「已完成」（最近 50 条，可撤销/删除），并弹一条完成提示。
4. 能力关联：任务可选关联一个能力（`growth_tasks.capability_id`，删除能力时 `SET NULL`）；能力详情「相关任务」按能力过滤，新建任务可直接预填能力。
5. 总览布局：独立首页已删除，能力页「总览」是默认落点；左栏由任务卡独占并撑满，右栏上方是领域分布雷达、下方是全部能力列表；单领域页保持领域雷达 + 能力列表。任务卡片覆盖今天与逾期、支持快速输入和完成分组；原首页的「今天做什么 / 最近怎么样 / 赛季海报」不再单独存在。

**不变量**
- 任务没有 `status` 枚举：`completedAt` 为空即未完成；完成不写成长分、不改等级、不产生投入记录。
- 起始/截止是闭区间；单日期等价于起始=截止；只有 `今天 > 截止` 才算逾期，起始过去不标红。
- 设起始且截止为空时自动补同一天；两边都有值后修改一边不移动另一边（只在倒置时夹取）；清除任一日期清空整段区间。
- 任务属于至多一个能力；没有能力也可以存在；能力归档不影响已有任务。
- 快速记录小窗只写标题，日期在任务详情里再排；主窗口隐藏/托盘驻留时仍可用。
- 任务不进入编年史与年度统计；赛季进度只由挑战结算决定。

**常见改动点**
- 任务字段/查询 → `electron/database.ts` 的 `growth_tasks` / `toGrowthTask`，再同步 `src/shared/models.ts`。
- 日期分组/逾期规则 → `src/lib/taskDates.ts`；日期原语 → `src/lib/dates.ts`。
- 任务卡片/详情 → `GrowthTasksCard`、`GrowthTaskModal`；能力页总览布局 → `GrowthBoard`、`GrowthDomainDistribution`。
- 快速记录 → `electron/main.ts` 的 `applyGlobalShortcuts` / `showQuickCaptureWindow`、`quick-capture.html`、`src/quickCapture.tsx`。
- 新文案 → `src/i18n/zh.ts` 与 `en.ts` 双份。

**验证**
- 快速记录在后台/最小化/仅托盘驻留时可用，保存后任务出现在「未安排」，主窗口焦点不变。
- 设今天/明天/区间后任务落在正确分组；区间任务只出现一次；逾期只看截止。
- 完成/重新打开/删除；已完成列表最近 50 条；完成关联任务只更新任务状态，不产生投入记录。
- 删除能力后任务保留、能力徽标消失；能力详情「相关任务」与能力页总览的任务卡片同步。

## 5. 网页资源（资料库来源）

**入口**
- 资料库侧栏底部固定行「网页资源库」（`src/components/library/LibrarySidebar.tsx`）→ `LibraryRef.kind = "resources"`；内容区 `src/components/library/ResourcesLibraryContent.tsx`，数据在 `src/components/library/useResourceLibrary.ts`（经 `LibraryDataProvider` 常驻）。
- 侧栏收藏集分区 `src/components/library/ResourceCollectionList.tsx`：全部资源 + 收藏集拖拽/右键菜单（与笔记/PDF 同一套 `GroupNavRow` / `CollectionSection` / `CollectionDialogs`）；工作区侧栏（`DocumentSidebar`）复用同一 `LibrarySidebar`。
- 主进程：`resources:*`、`resource-collections:*` 通道与 `fetch:title`、`resources:open-url`（`electron/main.ts`）。

**主流程**
1. 加载：`getResources()` 全量 + `getResourceCollections()`（含每集总数与未分组数）；搜索（防抖）走 `searchResources(query)`，上限 `search_result_limit`。hook 在 `LibraryDataProvider` 挂载即加载，切换资料库来源不重新拉取。
2. 新增：URL 无协议时自动补 `https://`；标题留空则 `fetchPageTitle(url)`（主进程 5s 超时、只流式读到 `</title>`，失败回落 URL）；表单用 `SelectButton` 选收藏集（可空 = 未分组）；`addResource` 的唯一约束冲突映射成「已存在」提示。
3. 收藏集：`resource-collections:create/rename/set-color/reorder/delete`；删除只解散分类（成员经 `ON DELETE SET NULL` 变未分组），不删资源；颜色 `resolveTagColor`（未知用 `hashColor`）；全局顺序 `reorderCollection`（侧栏拖拽），资源在列表内拖拽仍走 `reorderResources`。
4. 归类：`resources:move-to-collection` 单列写入，天然唯一；内容区「全部」按收藏集顺序分区 + 未分组，选中收藏集后切成平铺列表。
5. 打开：行点击与菜单都走 `window.prism.openUrl`（`shell.openExternal`）；资源不是工作区文档，没有标签页。
6. 来源记忆：上次来源存 `workspace_v1.library`；旧工作区 `module: "resources"` 在托盘重建窗口时迁移为「资料库 + 资源」。

**不变量**
- 网页资源是**全局唯一、无路径**的资料库来源：不进入 `vault_paths`，不参与扫描、watcher、私密仓库、侧车文件或路径安全。
- URL 唯一；**一条资源最多属于一个收藏集**（`resources.collection_id` 单列 + `resource_collections` 外键），否则就是未分组。
- 颜色只从 `resolveTagColor` 取，未知收藏集名用 `hashColor` 稳定派生，禁止硬编码色值。
- 收藏集顺序由 `resource_collections.sort_order` 决定，资源全局排序由 `resources.sort_order` 决定，两者不混用。
- `fetchPageTitle` 失败不阻塞新增。
- 资源视图只读写 `resources` / `resource_collections`，不得写 `collections.json`、`canvas-groups.json` 或 `vault_paths`。
- 搜索词与卡片折叠状态属于 UI 会话状态，放在 provider 内存中；选中收藏集经 `last_resource_coll` 持久化（首次读取回退旧的 `last_resource_tag` 标签名），与笔记/PDF 收藏集选择一致。

**常见改动点**
- 新增字段 → 先改 `resources` 表与 `src/shared/models.ts`，再改 `electron/preload.ts` + `electron/main.ts` 通道。
- 收藏集颜色/排序行为 → `src/lib/colors.ts` 与 `useResourceLibrary.ts`（`collectionGroups` / `colorForCollection`）。
- 资料库入口/资源行 → `LibrarySidebar.tsx`；内容布局/toolbar → `ResourcesLibraryContent.tsx`。

**验证**
- 只输域名能抓到标题；重复 URL 报「已存在」；新建/改名/改色/排序/删除收藏集后列表与侧栏同步；删除收藏集后资源进未分组且未丢失。
- 旧库首次启动：每个旧标签变成一个收藏集，多标签资源归入最靠前的标签，无标签资源未分组；重启不重复迁移、不报错。
- 笔记库 / PDF / 白板 / 网页资源来回切换后资源搜索词、选中收藏集、折叠状态保留；资源页不产生任何库内写入；零笔记库/零 PDF/私密库锁定时资源仍可用。

## 6. 养成

**入口**：`src/components/growth/GrowthView.tsx`（四个视图：能力 / 赛季 / 编年史 / 元认知，默认能力页「总览」）；派生算法在 `src/lib/growth.ts`。

**要点**：能力量表（等级 + 置信 + 证据 + 只增快照）、挑战/赛季/作品（过关自动升级、L3+ 每级需一个已通过挑战、强制归因；挑战按概述/目标/标准定义，过程在详情页用 Markdown 随时编辑，结算时记录结果与复盘；作品按封面 + 一句话介绍 + Markdown 说明在赛季页卡片墙展示）、元认知（预测-验证 + 自知度 + 自我说明书 + 他评）。自知度永不进入能力分。

完整主流程、不变量、文件地图与验证清单见 [养成](growth.md)。

## 7. 设置

**入口**
- `src/components/Settings.tsx`：右侧固定分类 `general` / `vaults`（PDF 也在此页）/ `editor` / `canvas` / `appearance` / `search` / `shortcuts` / `external`；分类记忆在 localStorage `prism_settings_category`（历史值 `pdf` 迁移到 `vaults`）。
- 分区实现都在 `src/components/settings/`，统一用 `controls.tsx` 的 `SettingRow` / `SettingBlock` / `Toggle` / `Select` / `NumberInput` / `Slider` / `SectionHeader`。

**主流程**
1. 启动：`src/lib/settings.tsx` 的 `SettingsProvider` 用一次 `getAllSettings` 批量加载，再按 `decodeSetting` 得到类型化值；业务组件读 `useSettings().values`。
2. 改动：`set(key, value)` → `normalizeSetting` + `serializeSetting` → `setSetting` → 派发 `settings-saved`（`Settings.tsx` 顶栏闪「已保存」2 秒）。
3. 重置：`reset()` 把 `SETTING_KEYS` 全部写回 `DEFAULT_SETTINGS`；`Settings.tsx` 另外把主题恢复 `violet`/深色、语言恢复中文。
4. 语言：`useT().setLang`，存 localStorage `prism_lang`（`src/i18n/index.tsx`），**不在**设置注册表里。
5. 窗口与启动（通用分区）：`close_behavior`（`quit` 退出 / `tray` 最小化到托盘）、`auto_launch`、`auto_launch_hidden`；行为都在主进程（见 [主进程](main-process.md) 的「托盘、关闭行为与开机启动」）。设置页用 `app:get-launch-state` 提示「开发模式不写启动项」「平台不支持」。
6. 养成数据（通用分区）：导出/导入单个 `prism-growth` JSON；导入前自动备份到 `growth-backups/`，导入为替换而非合并；笔记/PDF/白板/设置/索引不参与。字段与行为见 [growth](growth.md) 的「导出/导入」。

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
- 工作区恢复：冷启动固定养成-能力总览（标签保留、无激活文档）；关到托盘再打开保持当前页面/分屏；`--hidden` 启动后从托盘打开恢复上次现场。
- 快捷键：「呼出主界面」在任何应用/仅托盘驻留时都能把主窗口带到前台；与快速记录冲突时录制器报冲突；被其他程序占用时显示注册失败提示；修改后无需重启即重新注册。

## 8. 变更日志 / 启动屏

**入口**
- `src/components/ChangelogModal.tsx`：`src/App.tsx` 顶栏按钮打开，数据来自 `src/data/changelog.ts`。
- `src/components/SplashScreen.tsx`：`App.tsx` 启动时全屏覆盖，`hydrate()` 完成后 500ms 淡出。

**主流程**
1. changelog 每条含 `version/date/summary`，细节二选一：`highlights`（图标 + `palette` 卡片）或 `changes`（平铺列表）；最新版本在最前，每次打开默认全部折叠。
2. 公告标题栏右侧是**版本下拉**：按版本倒序列出全部条目，选择后平滑跳到对应版本；滚动正文时下拉值跟随当前版本，`prefers-reduced-motion` 下改为即时跳转。
3. splash 固定展示 logo、`PRISM`、`splash.tagline` 与三个跳动点。

**不变量**
- `changelog[0].version` 必须等于 `package.json` 的 `version`，版本号严格降序、不可重复；违反会被 `npm run verify` 拒绝。
- `highlights[].palette` 只能是 `TagColorKey`；文案是中文硬编码字符串（历史记录，不进 i18n）。

**常见改动点**
- 发版：加一条 entry（`summary` 必填，大功能用 `highlights`），同步 `package.json` 版本号。

**验证**
- `npm run verify` 通过；打开变更日志能看到新版本并展开；标题栏版本下拉可跳到任意版本，滚动时下拉值跟随；冷启动看到 splash 且在数据就绪后消失。

## 跨域不变量

1. **DB 只经 IPC**：渲染层不碰 Node，所有 SQL 在 `electron/database.ts`；新通道同时改 `electron/main.ts` + `electron/preload.ts`，否则 `docs:check` 的 IPC 契约检查失败。
2. **路径安全**：读取/保存/附件/协议先过 `findOwningVault`（最长前缀、大小写不敏感），库外路径直接拒绝（`NOTE_OUTSIDE_VAULT` / `CANVAS_OUTSIDE_VAULT` / `VAULT_LOCKED`）；`.prism` 侧车写入还要求 `requireVaultRoot`，只接受精确库根（否则 `OUTSIDE_VAULT`）。
3. **异步列表三态**：首载无数据用 `Skeleton` / `SkeletonRows`，已加载且空用 `EmptyState`，刷新时保留旧数据不闪空。
4. **i18n 双份**：界面文案一律 `useT()` + `src/i18n/zh.ts` / `src/i18n/en.ts` 对齐（`en.ts` 以 zh 为类型源），占位符两端必须一致。
5. **收藏集 XOR**：单个收藏集内一条笔记只在根列表或恰好一个分组；白板的「未分组」由「全部文件 − 组内路径」推导，不单独存储。
6. **暖切换**：切库/切仓库时不立刻清空，旧数据留到新数据提交；写入被目标库/仓库身份校验拦住，宁可丢弃也不写错地方。
7. **事件广播**：跨面板刷新靠 window 事件——`growth-changed`、`vaults-changed`、`settings-saved`、`prism:canvas-changed`、`prism:open-note`、`prism:vault-locked`，加上 IPC 推送 `vault:updated`、`pdf:updated`。
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
- **任务**：记录后不整理可直接设日期/完成；逾期/今天/未来 7 天/更晚/未安排分组正确；完成进已完成并可撤销；可关联能力；快速记录在后台可用。
- **网页资源**：资料库侧栏固定行进入；抓标题、重复 URL、标签增删改色与排序、外部打开链接；与笔记/PDF/白板切换后筛选与折叠状态保留。
- **设置**：改项后重启保留、越界夹取、重置（含主题与语言）、`npm run docs` 后 `docs:check` 通过。
- **变更日志**：新版本在顶部且可展开；冷启动 splash 正常淡出。
