# 白板 / 思维导图子系统

> 读完本文应能回答：白板数据存在哪、如何解析/迁移/保存、两个 `CanvasGroup` 有何区别、编辑器与资料库如何协作、改一块功能该动哪些文件，以及哪些约束不能破。

## 适用场景与相关文档

- 修改白板 JSON 格式、版本迁移、保存或冲突处理。
- 修改画布交互：选择、拖动、容器、连线、对齐、撤销。
- 修改资料库「白板」视图、分组与拖拽。
- 修改笔记里的白板嵌入预览。
- 修改白板设置或卡片预设。

相关文档：[架构总览](./overview.md)、[功能域](./features.md)、[改动配方](../guides/recipes.md)、[IPC 参考](../reference/ipc.md)。

## 文件位置与格式

### 存放位置

白板不是 SQLite 数据，而是笔记库里的普通 JSON 文件：默认 `<vault>/<canvas_dir>/*.json`，`canvas_dir` 默认 `canvases`。项目资料是唯一例外：项目文件夹（`<项目仓库>/Projects/<项目>/`）里的 `.json` 也可作为白板。

- `canvas_dir` 是笔记库内相对文件夹；`resolveCanvasDir`（`electron/main.ts`）把反斜杠换成 `/`，拒绝空路径、`..` 与绝对路径（含盘符），非法时回退到 `canvases`。允许子目录，例如 `mind/canvases`。
- `listCanvasFiles` 扫描白板目录第一层的 `*.json`，并追加该 vault 下已登记项目文件夹里的 `*.json`，按 `modifiedAt` 降序返回 `CanvasFile`；不递归项目文件夹、不写数据库索引。
- `assertCanvasFile` 是所有读写入口的守卫：文件必须在所属 vault 内、扩展名 `.json`，且位于该 vault 的白板目录或某个已登记的 `gtd_project_folders.folder_path` 内。
- IPC 传绝对路径；资料库分组存 vault-relative 正斜杠路径，两者用 `relativePathInsideVault`（`src/lib/paths.ts`）转换。
- 文件名来自标题：非法字符 `<>:"/\|?*` 替换为 `-`，空标题回退 `Untitled`，重名追加 ` 1`、` 2`；`canvasTitle` 去掉末尾 `.json`。
- 私密笔记库中的白板仍叫 `.json`，但读写走 `withVaultKey` / `readEncryptedText` / `writeEncryptedFile` 加密；锁定后清空嵌入缓存。

### CanvasDoc v2

`CanvasDoc`（`src/lib/canvas/model.ts`）是 v2 文档形状，`CANVAS_VERSION = 2`：

| 字段 | 含义 |
|---|---|
| `version` / `kind` | 固定 `2` / `"canvas"` |
| `viewport` | `{ x, y, zoom }`；`sanitizeViewport` 把 zoom 限制在 0.2–2.5 |
| `nodes` | 卡片数组，关键字段见「模型层」 |
| `groups` | 画布内部容器数组，不是资料库分组 |
| `edges` | 连线数组，关键字段见「模型层」 |
| `ink` | `unknown[]`，当前只做透传（克隆/解析/序列化保留），没有渲染逻辑 |

`serializeCanvas` 用固定键序和两空格缩进，保证同一白板重复保存时 diff 小；遍历顺序与 `nodes`/`groups`/`edges` 数组一致，数组顺序本身就是持久化数据。

### 解析、迁移与损坏

`parseCanvas` 返回 `{ doc, migrated, corrupt }`：

- JSON 解析失败、顶层不是对象/数组、或 `nodes` 存在但不是数组 → `corrupt: true`，返回空 v2 文档；`CanvasEditor.load` 把状态置为 `error`，阻塞保存，不会用空文档覆盖磁盘。
- v1 识别在 `looksLikeV1`：`version === 1`，或存在 `rootId` / `layout`，或节点带 `parentId` / `order` / `collapsed`。
- `migrateV1` 把 `parentId` 转成 `sourceHandle: "right"` → `targetHandle: "left"` 的连线，把 `type: "note"` + `notePath` / `type: "link"` + `url` 转成目标；v1 没有容器，`groups` 为空；返回 `migrated: true`，编辑器加载后立即置 dirty，下次自动保存写成 v2。
- v2 清洗在 `parseV2` / `sanitize*`：非法或重复 id 重新生成；越界尺寸/字号/视口/标签位置夹取；非法枚举回退默认值；连线两端必须是存在的节点、不能自连；相同 `source|target|handles` 的重复连线丢弃；空 handle 固定为 right/left。
- `normalizeHandle` 与「卡片所有 Handle 都声明为 source + `ConnectionMode.Loose`」配合：React Flow 才能解析到左/上/下/右任意端点。

### 时间戳与保存冲突

- `CanvasFile.modifiedAt` / `CanvasContent.modifiedAt` 是文件 `mtimeMs`，只做冲突令牌，不是展示时间；工具栏里的 `savedAt` 是编辑器本地状态。
- `canvas:save` 的 `expectedModifiedAt` 为 `null` 表示强制覆盖；否则与磁盘 mtime 比较，差值超过 0.5ms 就返回 `{ conflict: true, modifiedAt }`，不写入。
- 写入先落到同目录唯一临时文件再 `rename`，避免半截文件；私密库走加密写入。
- `CanvasEditor.doSave` 成功后更新 `modifiedAtRef` 并 `notifyCanvasSaved`；失败若匹配 `CANVAS_MISSING` 进入 `missing` 状态。
- 冲突弹窗只给两个选择：重新加载磁盘版本（丢弃本地）或覆盖保存。
- 自动保存由 `useAutosaveTimer` + `autosave_delay` 驱动；`Ctrl+S` 立即保存；标签卸载时若仍 dirty 会再保存一次。

## 两种 CanvasGroup

项目里有两个同名但无关的类型，import 时看清来源：

| 维度 | 资料库分组 | 画布内部容器 |
|---|---|---|
| 类型 | `CanvasGroup`，`src/shared/models.ts` | `CanvasGroup`，`src/lib/canvas/model.ts` |
| 持久化 | `.prism/canvas-groups.json`（`CanvasGroupsFile`） | 每个白板 JSON 的 `groups` 数组 |
| 字段 | `id`、`name`、`color?`、`paths` | `id`、`name`、`color`、`moveContents`、`locked`、`x/y/width/height` |
| 用途 | 资料库「白板」视图的侧栏分组，管文件归属 | 画布上的可视框，管卡片/连线布局 |
| 操作 | `useCanvasGroups`、`CanvasLibraryContent`、`CollectionDetail` | `CanvasEditor`、`BoardFlow`、`GroupNode`、`FrameDetailPanel` |
| 关系 | 扁平列表；一个路径最多属于一个分组 | 纯几何包含；不嵌套，也没有父子字段 |

- 资料库分组文件形状：`{ version: 1, groups, paths }`，根 `paths` 是未分组顺序。
- 画布内部容器在 React Flow 里 `type: "frame"`、`zIndex: -1`、不可连线；UI 文案叫「容器」，`FrameDetailPanel` 的 `frame` 就是它。
- 两者互不转换：重命名/删除资料库分组不会改白板 JSON；移动/删除容器也不会改 `.prism/canvas-groups.json`。

## 模型层

所有画布数据结构与纯函数都在 `src/lib/canvas/`，不依赖 React。

| 文件 | 职责 |
|---|---|
| `src/lib/canvas/model.ts` | 常量、类型、`createNode`/`createGroup`/`createCanvasDoc`、`cloneCanvas`、清洗与夹取、`parseCanvas`/`migrateV1`/`serializeCanvas` |
| `src/lib/canvas/geometry.ts` | `alignNodes`（left/centerX/right/top/centerY/bottom，≥2 个节点）、`distributeNodes`（水平/垂直，≥3 个节点），返回舍入后的 `NodeMove[]`（`{ id, x, y }`） |
| `src/lib/canvas/graph.ts` | 文档增删改：节点/容器/连线的 add/update/remove、`duplicateNodes`、`hasConnection`；无变化时返回原引用 |
| `src/lib/canvas/history.ts` | `CanvasHistory` 的 past/future，上限 100；`recordHistory` 记录变更前快照，`undoHistory`/`redoHistory` 交换 |
| `src/lib/canvas/targets.ts` | `leafName`、`targetTitle`、`normalizeTargetUrl`（只放行 http/https/mailto） |
| `src/lib/canvas/presets.ts` | `PRESET_MIME`、`presetFromNode`（只取样式和尺寸）、`newPresetId` |
| `src/lib/canvas/events.ts` | `prism:canvas-changed` / `prism:canvas-saved` 的常量、detail 类型与派发函数 |

关键数据形状（只列关键字段）：

- 卡片 `CanvasNode`：`id`、`text`、`notes`、`color`、`align`（left/center/right）、`valign`（top/middle/bottom）、`fontSize`（默认 14，10–48）、`bold`、`x/y/width/height`（默认 220×88，120×44 到 1200×1200）、`target`。
- 容器 `CanvasGroup`：`id`、`name`（最长 80）、`color`、`moveContents`（默认 true）、`locked`（默认 false）、`x/y/width/height`（默认 420×280，160×100 到 6000×6000）。
- 连线 `CanvasEdge`：`id`、`source`、`target`、`sourceHandle`/`targetHandle`、`color`、`label`、`labelPosition`（默认 0.5，0.05–0.95）、`strokeWidth`（预设 1.5/2.5/4，清洗范围 1–8）、`lineStyle`（solid/dashed）。
- 视口 `CanvasViewport`：`x`、`y`、`zoom`；目标绑定 `CanvasTarget`：`note`（绝对路径 + 标题）、`pdf`（`repoPath` + `relPath` + 标题）、`canvas`（绝对路径 + 标题）、`url`，无目标为 `null`。
- 预设 `CanvasPreset`（`src/shared/settings.ts`）：`id`、`name`、`color`、`fontSize`、`bold`、`align`、`valign`、`width`、`height`。

关键约定：

- `graph.ts` 的函数克隆整份文档再改，调用方用返回值替换 `doc`；不要原地改 `docRef.current`。
- `duplicateNodes` 只为「两端都在复制集合里」的连线创建副本；复制偏移由调用方给（右键复制是 +24/+24）。
- 历史快照是整份 `CanvasDoc` 的深拷贝（`cloneCanvas`），不是操作日志；视口变化不入历史。
- `presetFromNode` 不保存 `text`、`notes`、`target`，预设只是卡片外观模板。

## 编辑器层

### 分工

- `src/components/canvas/CanvasEditor.tsx` 是白板会话的唯一所有者：`load`/`parse`、`doc` 与 `historyRef`、`modifiedAtRef`、dirty/冲突/自动保存、选中集合（卡片和容器共用 `selectedIds`）、`editingId`、详情面板、右键菜单、快捷键、工具栏贡献、预设 CRUD、目标选择、创建/删除/复制/对齐/分布/适配视图。
- `src/components/canvas/BoardFlow.tsx` 把 `CanvasDoc` 映射成 React Flow 的 `nodes/edges`，只保留短命的交互状态（拖动跟随、框选矩形、React Flow 内部节点副本）。选中是受控的：`selected` 从编辑器传入，`onNodesChange`/`onEdgesChange` 只把 select 变化翻译回 id 集合。
- 读取时 `key={viewKey}` 重挂 `BoardFlow`，让 `defaultViewport` 生效；之后视口由 React Flow 自己维护，`onMoveEnd` 写回 `doc.viewport`。

### 渲染文件

| 文件 | 内容 |
|---|---|
| `nodes/BoardNode.tsx` | 卡片：四向 Handle、`NodeResizer`、双击就地编辑（textarea）、目标图标/悬浮按钮、Alt+点击打开目标 |
| `nodes/GroupNode.tsx` | 容器：半透明边框与底色、标题、双击空白处插入卡片、标题双击重命名、尺寸夹取 |
| `edges/ArrowEdge.tsx` | 连线：`getBezierPath` + 箭头 marker、标签 chip 沿贝塞尔曲线拖动（`nearestT`）、线宽/虚实/颜色 |
| `NodeDetailPanel.tsx` / `FrameDetailPanel.tsx` / `EdgeDetailPanel.tsx` | 右侧详情面板：卡片文本/对齐/字号/目标/颜色/备注；容器名称/颜色/`moveContents`/`locked`；连线文字/颜色/粗细/线型 |
| `SelectionToolbar.tsx` / `PresetBar.tsx` | 多选浮动工具条（对齐/分布/围绕所选建容器）；预设卡片拖拽条 |
| `TargetPickerModal.tsx` / `CreateCanvasModal.tsx` | 目标选择（笔记/PDF/白板/URL，排除当前白板）；新建白板 |

### 交互

- 选择：点击卡片/容器/连线；点空白清空；框选用 `SelectionMode.Partial`；`Shift`/`Meta`/`Ctrl` 多选。单选时自动打开对应详情面板。
- 拖动：左键拖空白是框选，右键拖平移（`panOnDrag={[2]}`）。拖动结束只提交一次 `onMoveMany`，因此一次拖动=一步撤销。
- 容器拖动：`handleDragStart` 在拖拽开始时算「完全落在启用 `moveContents` 的容器内」的卡片，拖动过程中在本地平移它们，`onNodeDragStop` 与所选节点一起提交。只包含完全在内（四条边都 ≤/≥）的卡片；容器之间不嵌套。
- 缩放/平移：滚轮缩放，范围 0.2–2.5；`fitView` 用 padding 0.2、动画 250ms；空白画布 `setViewport({ x: 0, y: 0, zoom: 1 })`；插入卡片或 `requestFocus` 时 `setCenter` 到卡片中心（zoom 1）。
- 容器绘制：工具栏的 Frame 按钮进入 `drawGroupMode`，按下拖动出矩形（在 window 上跟踪指针），小于 60×60 时退回默认 420×280；`Escape` 取消。
- 锁定与 `moveContents`：`locked` 让容器 `draggable: false` 且不显示 resizer；`moveContents` 关掉后拖动容器不会带走内部卡片。锁定不影响卡片本身的移动。
- 复制：右键「创建副本」调用 `duplicateNodes`，偏移 +24/+24；没有 Ctrl+C/Ctrl+V 剪贴板复制。
- 对齐/分布：右键菜单或多选工具条；≥2 个对齐、≥3 个分布；`frameSelection` 用 padding 40 在所选卡片外画一个容器（纯几何，不建立父子关系）。
- 删除：`Delete`/`Backspace`；`deleteIds` 先按 id 是否属于 `doc.groups` 分流，删节点时 `removeNodes` 连带删掉两端失效的连线；删容器不删卡片。
- 历史：`applyDoc` 每次提交前 `recordHistory`；`Ctrl+Z` 撤销，`Ctrl+Shift+Z` / `Ctrl+Y` 重做；上限 100；载入/重载清空；撤销后剔除已不存在的选中 id。
- 快捷键：`Ctrl+A` 全选（卡片+容器）、`F2`/`Enter` 编辑单选、`Escape` 退出绘制/清空选择、`Ctrl+S` 保存。
- 卡片文本：双击进入 textarea，失焦提交、`Escape` 取消；`NodeDetailPanel` 的文本字段按 `Enter` 提交、`Shift+Enter` 换行，备注是多行输入、失焦提交。
- 目标：`TargetPickerModal` 选笔记/PDF/白板/URL；`applyTarget` 在卡片文本为空时用 `targetTitle` 自动填标题；Alt+点击卡片或详情面板按钮打开目标。

## 资料库层

资料库的「白板」视图与「全部笔记」「PDF」平级，本质是每个 vault 一个虚拟收藏集。

- `useCanvasLibrary`（`src/components/canvas/useCanvasLibrary.ts`）负责 `listCanvases`、创建、重命名、删除（`trashFile`）与刷新；列表由 `LibraryDataProvider` 挂在 `noteVaultPath` 上，资料库内容与侧栏计数共用这一份。创建/重命名/删除后都会 `notifyCanvasChanged`，监听器用 `normalizePath` 比较 vault 后刷新；每次请求带自增序号，慢响应不会覆盖新 vault。
- `CanvasLibraryContent` 渲染工具栏、`Skeleton`/`EmptyState`，其余交给 `CollectionDetail`（`src/components/CollectionDetail.tsx`，与笔记收藏集共用）。创建走 `CreateCanvasModal`；重命名后同时 `renamePath` 改分组路径、`updateDoc` 改已打开标签；删除后 `removePaths` 清分组引用并关闭对应标签。
- `useCanvasGroups`（`src/components/library/useCanvasGroups.ts`）读取 `.prism/canvas-groups.json`，`sanitize` 丢弃坏 group、把路径统一成去前导斜杠的正斜杠、全局大小写不敏感去重（先出现者胜）。编辑走 300ms 防抖写入；`saveVaultRef` 把写入固定到编辑发生的 vault，切换 vault 时先 flush；失败重新标记 dirty，交给下次 flush 重试。
- 未分组 = 全部白板 − 各组路径：`collectUngrouped` 先收根 `paths` 里的顺序，再把 `fileByRel` 中所有未被任何分组引用的文件补进来；不存在的文件不会进入未分组。
- 删除分组只删 group，成员路径不再被任何组引用，下一次 `collectUngrouped` 自然把它们放回未分组；不需要也不应该手工搬移。
- `movePath` 先 `stripFromGroups` 把所有组和根 `paths` 里的同一路径清掉，再插入目标组/未分组；因此「移动」总是先离开旧组，路径最多属于一个分组。
- 拖拽复用 `CollectionDetail` 的 dnd-kit：分组标题可排序；白板行拖到分组卡片=追加，拖到某行=插到该行位置，拖回未分组=写回根 `paths`；`groupId === null` 表示未分组。分组颜色用 `resolveTagColor`。
- 分组内文件可能已被外部删除/改名：`resolveFile` 查不到时 `NoteInfo.missing` 为 true，显示警告且不可点击；改名/删除由本应用发起时会同步 `renamePath` / `removePaths`，外部改动不会自动清理。
- `prism:canvas-changed` 的实际监听者只有资料库列表和嵌入缓存；`events.ts` 注释里的「打开标签也监听」目前不成立，打开中的编辑器靠保存时的 mtime 冲突发现外部修改。

## 嵌入预览

笔记里用 `![[target|label|WxH]]` 嵌入白板；`InsertModal` 写入的是 vault-relative 路径（默认 `canvases/name.json`，项目白板为 `Projects/<项目>/name.json`）。`detectEmbedKind`（`src/components/embeds/model.ts`）把 `.canvas` / `.json` 目标判为 `canvas`，其余按 `note`。

- `loadEmbed` → `loadCanvas`（`src/components/embeds/loader.ts`）：用缓存的 `listCanvases` 按规范化绝对路径或标题解析文件（允许省略 `.json`）；`readCanvas` 后 `parseCanvas`；返回 `loading` / `ready` / `missing` / `corrupt` / `error`。
- 文档缓存按绝对路径键；`prism:canvas-changed` 清掉该 vault 的列表与文档，`prism:canvas-saved` 只清被保存的文档；私密库锁定调用 `clearVaultEmbedCache`，避免缓存解密内容。
- `EmbedCard` 只对非空画布 `React.lazy` 加载 `CanvasEmbedPreview`；空画布（`nodes` 和 `groups` 都为空）直接显示 `embed.emptyCanvas` 占位，不引入 `@xyflow/react` chunk。图片和 PDF 封面另有 `loading="lazy"`；白板嵌入没有视口级 `IntersectionObserver`，懒加载发生在 chunk 和数据层，见源码。
- `CanvasEmbedPreview` 是只读 React Flow：不拖动、不连接、不可选、不滚轮缩放；`ConnectionMode.Loose` 与编辑器一致；打开后 `fitView({ padding: 0.08, maxZoom: 1 })`，卡片尺寸变化时用 `ResizeObserver` 120ms 防抖后重新 fit。
- 尺寸：默认宽 600（`EMBED_SIZE_MAX`），高约 0.66 倍，可调 300–600；可编辑时工具栏可改宽度和 caption。
- 点击：`EmbedCard` 的覆盖按钮把 `{ kind: "canvas", path, title }` 交给 `DocumentPane`，由 `makeCanvasDoc` 打开精确文件；`path` 是加载器解析出的绝对路径。

## 设置与预设

设置键都注册在 `src/shared/settings.ts`：

| 键 | 默认 | 作用 |
|---|---|---|
| `canvas_dir` | `canvases` | 白板 JSON 在 vault 内的相对目录；全局设置，所有 vault 共用；UI 在 `VaultsSection.tsx`，主进程再清洗 |
| `project_vault_path` | `""` | 项目仓库；项目文件在 `<vault>/Projects/<项目>/`，其中的 `.json` 也按白板处理；UI 在 `GtdSection.tsx` |
| `canvas_presets` | `[]` | 卡片预设 JSON 数组，`normalizeCanvasPresets` 限 8 个、名字 32 字符、尺寸/字号夹取 |
| `canvas_minimap_position` | `bottom-right` | `off` / 四角；`off` 或详情面板可见时不渲染 MiniMap |
| `canvas_background` | `dots` | `dots` / `lines` / `cross` / `none` |
| `canvas_grid_size` | `22` | 背景网格间距与吸附步长，10–60 |
| `canvas_snap_to_grid` | `false` | 拖动/缩放是否吸附到网格 |

`autosave_delay` 也作用于白板。`CanvasSection.tsx` 只渲染导览图/背景/网格/吸附；`canvas_dir` 在 `VaultsSection.tsx`。

- `PresetBar` 在预设为空时不渲染；拖动用 `application/x-prism-canvas-preset`，`BoardFlow` 的 `onDrop` 解析后按落点插入卡片。
- 预设只存样式与尺寸（`presetFromNode`）；保存入口是卡片右键「存为预设卡片」，达到 `MAX_CANVAS_PRESETS`（8 个）上限时弹错误 toast；右键预设可重命名/删除（`RenameModal`/`ConfirmDialog`），删除不可撤销。
- 预设名称默认取卡片首行前 24 字符，最多 32；拖入的卡片是普通 `CanvasNode`，之后独立编辑。

## 不变量与坑

1. **JSON 是唯一持久化**：白板不进 SQLite，列表靠目录扫描；不要给白板加数据库索引或假设有 `id` 主键。`listCanvasFiles` 的非递归扫描意味着更深层子目录里的 JSON 不会被发现。
2. **路径一律 vault-relative + 正斜杠**：写进 `.prism/canvas-groups.json` 的必须是 `canvases/foo.json` 或 `Projects/<项目>/foo.json` 这种形式，不能是绝对路径；比较/去重先 `normalizePath`（小写）或 `toLowerCase`，否则 Windows 大小写会产生重复成员。
3. **两个 `CanvasGroup` 不能混用**：资料库分组有 `paths`、存在 sidecar；画布容器有坐标/锁定、存在白板 JSON。在不经过类型检查的边界（JSON、props 透传）用错会静默错。
4. **分组不变式**：分组路径优先于根 `paths`；未分组是「全部文件 − 所有组引用」的推导结果，不是独立存储。移动前必须先 `stripFromGroups`，删除分组后成员自动回未分组。
5. **容器是几何关系，不是父子关系**：卡片不记录所属容器；拖动时只在拖拽开始按「完全包含」计算跟随者。容器不能嵌套，`locked` 只锁容器自身，`moveContents` 只影响拖动。
6. **mtime 是唯一冲突令牌**：`expectedModifiedAt` 比较有 0.5ms 容差；强制覆盖传 `null`。外部工具保留 mtime 的写入无法被检测。冲突时没有「合并」，只有重载或覆盖。
7. **React Flow 与 `visibility:hidden` 不兼容**：节点会写内联 `visibility: visible`，工作区隐藏白板分支必须用 `hidden`（`display:none`），见 `DocumentPane.tsx` 的 canvas 分支；否则 minimap/节点会漏到其他模块。
8. **目标绑定会失效**：`target` 只存路径快照（PDF 还存 `repoPath`/`relPath`），文件移动/删除后不会自动修复；`targetTitle` 用 `leafName` 兜底。打开目标时 PDF 可能提示缺失。
9. **懒加载边界**：`CanvasEditor` 和 `CanvasEmbedPreview` 都静态 import `@xyflow/react`，二者必须保持 `React.lazy`；从 App 或资料库同步 import 会把 React Flow 拖进首屏 chunk。
10. **视口也会写盘**：`onMoveEnd` 更新 `doc.viewport` 并置 dirty，纯平移/缩放也会自动保存，且不进撤销历史；`BoardFlow` 只在加载时用 `key={viewKey}` 重挂，切标签不会重置视口。
11. **corrupt 与 migrated 不同**：损坏返回空文档并阻塞保存；v1 迁移成功会置 dirty，下一次自动保存写回 v2。不要给损坏文件自动「修复并覆盖」。
12. **卸载保存与重命名竞态**：标签关闭时用旧 `canvasPath` 和原 mtime 补一次保存，冲突或文件已不在时结果被忽略；重命名打开中的白板会改 `tab.path` 并触发编辑器重新 load，防抖窗口里的改动可能写到旧路径且错误被吞掉（见源码）。
13. **私密库缓存**：白板 JSON 加密存储；`clearVaultEmbedCache` 必须在锁定时清掉已解析文档与摘录；不要把明文 `CanvasDoc` 放全局缓存。

## 改动地图

| 要改什么 | 先看哪个文件 |
|---|---|
| 白板 JSON 字段/版本/迁移 | `src/lib/canvas/model.ts`、`electron/main.ts`（`canvas:*`） |
| 读取/保存/冲突/自动保存 | `CanvasEditor.tsx`（`doSave`）、`electron/main.ts`（`canvas:save`）、`src/lib/useAutosave.ts` |
| 卡片渲染/就地编辑/Handle | `nodes/BoardNode.tsx`、`BoardFlow.tsx`（`nodeTypes`） |
| 容器渲染/拖动/锁定/跟随 | `nodes/GroupNode.tsx`、`BoardFlow.tsx`（`handleDragStart`）、`FrameDetailPanel.tsx` |
| 连线/箭头/标签 | `edges/ArrowEdge.tsx`、`EdgeDetailPanel.tsx`、`CanvasEdge` 模型 |
| 对齐/分布/复制/删除 | `src/lib/canvas/geometry.ts`、`src/lib/canvas/graph.ts`、`SelectionToolbar.tsx`、`CanvasEditor.tsx` |
| 撤销/重做 | `src/lib/canvas/history.ts`、`CanvasEditor.tsx`（`applyDoc`/`applyHistoryDoc`） |
| 资料库分组/拖拽/事件 | `useCanvasGroups.ts`、`CanvasLibraryContent.tsx`、`CollectionDetail.tsx`、`events.ts` |
| 嵌入预览 | `src/components/embeds/loader.ts`、`EmbedCard.tsx`、`CanvasEmbedPreview.tsx` |
| 设置/预设/标签与分屏 | `src/shared/settings.ts`、`CanvasSection.tsx`、`PresetBar.tsx`、`workspace/types.ts`、`DocumentPane.tsx` |

## 验证

自动：`npm run verify`（= `npm run lint` + `npm run docs:check`）。`docs:check` 会校验本文的路径、链接、`npm run` 脚本与行数（手写文档 ≤300 行）；只改代码时仍以 `npm run lint` 为底线。按项目约定，不跑 Playwright/CDP/截图自动化，UI 由人工验收。

UI 手测清单：

- 新建白板 → 打开标签 → 重命名 → 分组里的路径与标签标题同步；删除 → 文件进回收站、标签关闭、分组引用消失。
- 项目页新建流程白板 → 文件落在 `Projects/<项目>/` → 白板库列表可见、可打开/保存/重命名；项目删除后文件仍在。
- 打开白板改内容，等自动保存；用外部编辑器改同一文件后再改一次，应弹冲突；分别试「重新加载」和「覆盖保存」。
- 分组：新建/重命名/换色/排序；把未分组白板拖进组、组间拖动、拖回未分组；删除分组后成员回到未分组；空组显示拖入提示。
- 卡片/连线：双击新建、双击编辑、拖拽/缩放、右键复制、对齐/分布、围绕所选建容器；连线两端/标签拖动/线型/粗细；删除节点后相关连线消失。
- 容器：拖动带卡片、关闭 `moveContents` 后卡片留在原地、锁定后不可拖动/缩放、删除容器不删卡片。
- 嵌入：在笔记里 `![[canvases/foo.json]]` 显示只读预览；空白白板显示占位；点击打开正确标签；保存白板后预览刷新。
- 分屏：白板与笔记/PDF 左右分屏；切换模块后白板不穿透（minimap/节点不残留）；顶栏「适配视图」「详情面板」「分屏」按钮可用。
- 设置：切换背景/网格/吸附/导览图；保存预设、拖入画布、重命名/删除，达到 8 个上限时报错。
