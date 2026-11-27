# 渲染层

> 入口：`src/main.tsx`、`src/App.tsx`。视觉组件规范见 [UI kit](../guides/ui-kit.md)。

## Provider 链

`src/main.tsx` 的顺序是约定，不要随意调换：

```
ThemeProvider
└ LangProvider
  └ SettingsProvider
    └ ToolbarProvider
      └ PdfDocumentsProvider
        └ VaultLockProvider
          └ WorkspaceProvider
            └ ContextMenuProvider
              └ App
```

`App` 内部再挂：

```
LibraryDataProvider
└ ToastProvider
  └ 外壳（header / sidebar slot / toolbar / main panes / workspace）
```

- `SettingsProvider` 启动时 `getAllSettings()` 一次性载入并解码；`set()` 立即更新内存、异步写回，失败不回滚（下次编辑重试）。
- `VaultLockProvider` 轮询/订阅私密仓库状态，维护锁定态与解锁请求队列；锁定事件会让 `App` 关闭该库标签。
- `WorkspaceProvider` 负责标签/分屏/当前模块/资料库的单一状态源；`workspace_v1` 保存完整现场（标签、激活文档、分屏、模块、资料库），冷启动只取标签与资料库，托盘重建窗口时取全部。
- `LibraryDataProvider` 只在 `App` 内，聚合笔记库、PDF 库、白板库与网页资源数据；不要把它的 hook 挪到 Provider 链更外层。

## App 外壳

```
<header class="app-header">
  模块图标（养成/资料库）
  TabStrip（文档标签 + 主题快捷菜单 + 更新日志 + 设置 + 窗口按钮）
</header>
<AppSidebarSlotProvider>
  <AppToolbar />
  <main class="app-main">
    模块页 ×4（growth / library / settings / changelog，常驻，按 module 切换可见性）
    DocumentWorkspace（工作区激活时可见）
  </main>
</AppSidebarSlotProvider>
<SplashScreen />
```

- 模块导航与文档标签互斥：有激活文档时显示工作区，否则显示当前模块。
- 默认模块是 `growth`（养成），默认落到能力页的「总览」；所有模块共用左侧栏槽位，没有例外。
- `paneStyle(active)` 用 `position:absolute` + `visibility:hidden` + `opacity:0` + `pointer-events:none` 隐藏非活动页；`opacity:0` 让带 transition/transform 的卡片层彻底退出合成，避免切换时残留一帧。**不要改成条件渲染**，否则编辑器/PDF/画布状态会丢；每个 pane 固定 `key`，防止插入模块时 React 复用错 DOM。
- 当前工具栏作用域：`module:<id>` 或 `doc:single` / `doc:<focusedSide>`。

## 覆盖层

- 所有对话框（`Modal` 以及 `ConfirmDialog` / `PromptModal` / `RenameModal` / `DateField` 的二次封装）共用一个 **Modal 栈**：`src/lib/modalStack.ts`。
- `Modal` 默认垂直居中；`position="top"` 仅作为显式特例保留，不再靠调用方遗漏 `position` 决定位置。
- `Modal` 的 `dialog` / `document` 都固定标题与页脚，只滚正文区：`dialog` 高度随内容（最大 `100vh - 48px`），`document` 铺满窗口（四边 64px）。正文滚动区由 Modal 提供隐藏滚动条 + 上下渐隐；弹窗内部的列表 / 凹槽用普通滚动条。
- `Modal layout="document"` 是详情 / 长文容器：铺满窗口（四边 64px）、固定标题与页脚、只滚正文；它仍是 Modal 栈成员，焦点、遮罩与叠层规则不变。判档见 [UI kit](../guides/ui-kit.md)「Modal 的三种容器」。
- 栈保证：Esc 只关最上层；下层 `inert` / `aria-hidden`；容器 z-index 为 `50 + 栈深`。
- 叠层时保留下层遮罩，上层遮罩照常 `anim-overlay` / `anim-exit` 淡入淡出：背景从一层约 60% 平滑压到两层约 84%（三层更暗），用更暗的背景换过渡，不会先亮再暗。
- 菜单、右键菜单、TagInput 下拉、拖拽预览、Toast 不进入 Modal 栈：它们是轻层，固定在 `menu` / `context` / `toast` 等更高 z-index；菜单用 capture 阶段先消费 Esc。
- 需要叠加弹窗时直接渲染 `Modal` 即可，层级、Esc 与焦点由栈处理；不要在弹窗里再手写 document 级 Esc 监听。是否在打开子流程时关闭父弹窗由具体业务流程决定，不要为了规避层级 bug 而关闭。

## 侧栏槽位

- `AppSidebarSlotProvider` 在 header 下方创建「全高左侧槽位 + 右侧内容列」。
- 每个模块用 `<ModuleSidebar active={...}>` 把侧栏 portal 进槽位；`active=false` 时 `display:none`，但组件保持挂载。
- 只有活动模块的侧栏贡献宽度；不要在每个模块内部再包一层固定宽度侧栏。
- 侧栏折叠状态在 `src/lib/sidebarState.ts`（`useSyncExternalStore` + localStorage），模块共享。

## 工具栏

- `ToolbarProvider` 是一个小型外部 store：`useToolbarContribution(key, contribution)` 注册，`AppToolbar` 按当前 `scopeKey` 读取。
- `contribution` 支持 `title` / `subtitle` / `tabs` / `controls` / `actions`；调用方用 `useMemo` 保持对象identity，避免每次渲染都触发 store 更新。
- `tabs` 紧跟标题渲染、**永不收进「…」溢出菜单**：它是唯一的分区切换入口（如元认知的 自知度 / 说明书 / 他评，用紧凑 `SegmentedToggle`）。`controls` 在窗口 < 1080px、`actions` 在 < 760px（窗口最小 900，实际不会）时才进溢出菜单，所以「不能被藏起来的导航」只能放 `tabs`。
- 新增模块/文档类型时，给自己的作用域注册贡献；缺省时 `AppToolbar` 使用 `fallback`。

## 工作区

状态类型在 `src/lib/workspace/types.ts`：

- `DocTab` = note（`vaultPath` + 绝对 `path`）| pdf（`repoPath` + 相对 `relPath`）| canvas（`vaultPath` + 绝对 `path`）。
- doc id：`note::<normalizePath>`、`pdf::<repo>::<rel>`、`canvas::<normalizePath>`；同一文档只保留一个标签。
- `WorkspaceState`：`module`、`tabs`、`activeId`、`split`、`library`、`hydrated`。

关键行为：

- `openDoc` 去重后追加/替换；分屏存在时，若文档不在任一窗格，则替换聚焦窗格。
- `activateDoc` 在分屏中会同步 `focused`；关闭窗格内文档会拆掉分屏并把幸存者设为激活。
- `hydrate(vaults, resume)`：
  1. 读取 `workspace_v1`；
  2. 合并旧版 `note_tabs_<vault>` / `pdf_tabs_<repo>`；
  3. 用当前笔记/PDF/白板列表校验标题与存在性，删掉找不到文件的标签；
  4. 校验上次 `library` 仍指向存在的库；
  5. 把标签与库写回状态，标记 `hydrated`；`resume=false`（冷启动）时固定 `module = "growth"`、`activeId = null`、`split = null`，所以每次都落在养成-能力总览；
  6. `resume=true`（主进程重建窗口时 URL 带 `?restore-workspace=1`）时按 `workspace_v1` 恢复 `module` / `activeId` / `split`；`activeId` 为 `null` 表示用户当时在模块页，保持模块页而不是回退到第一个标签，也不恢复被模块页遮住的分屏。
- hydration 前由深链打开的文档在两种模式下都优先；已有窗口的托盘恢复、第二实例和 `app:activate` 只 `show()`，不重新 hydrate，现场原样保留。
- 持久化：`hydrated` 后 150ms 去抖写 `workspace_v1`；切换库/标签/分屏/模块都会触发。
- 激活文档会把 `library` 切到它所属的库；用户手动切换库后，直到下次激活文档才覆盖。
- `DocumentWorkspace` 维护分屏比例（默认 50%，最小 25%），拖动时直接改 DOM 宽度，不 setState 每一帧；模块页隐藏工作区但不卸载，阅读位置/缩放得以保留。

## 资料库数据

`LibraryDataProvider` 聚合四种来源：

- `note`：`useNoteLibrary(vaultPath)` + `useCollections`；
- `pdf`：`usePdfDocuments` + `usePdfCollections`；
- `canvas`：`useCanvasLibrary` + `useCanvasGroups`；
- `resources`：`useResourceLibrary`（全局单例，无路径；标签作分组）。

它额外维护：

- 切到 PDF/网页资源时保留上一个笔记库路径，切回来不用重扫；
- 白板视图切换时写 `last_coll_<vault> = "__canvas__"`；
- PDF 库路径与当前 `library` 不一致时纠正；
- 资源搜索词、卡片折叠状态只在内存中跨来源保留；选中收藏集持久化到 `last_resource_coll`。

`LibraryView` 按 `library.kind` 渲染 `NoteLibraryContent` / `CanvasLibraryContent` / `PdfLibraryContent` / `ResourcesLibraryContent`，侧栏统一由 `LibrarySidebar` 提供；资源模式下侧栏「收藏集」分区由 `ResourceCollectionList` 渲染，工作区侧栏（`DocumentSidebar`）自动获得同一入口。侧栏顶部只列笔记库，PDF 库与网页资源库固定在底部「全局库」区，不随上方列表滚动。

### 资料库共用层

三类仓库的数据源保持独立，但分组相关的展示与交互共用一层：

- `libraryGroups.ts`：把笔记收藏集、PDF 收藏集、网页资源收藏集适配成 `LibraryGroup { id, name, color, count, source }`；`GroupNavRow` / 分组卡 / 拖拽预览只消费这个视图模型。
- `librarySources.ts`：来源的标签、图标、分组标题、全部行文案等静态元数据；侧栏不再散落 `kind` 分支文案。
- `CollectionSection`：侧栏收藏集列表的可折叠/空态外壳，笔记、PDF、资源三处共用。
- `GroupNavRow`：侧栏分组行的唯一实现（彩色圆点、计数、选中、右键菜单、拖拽把手、拖放高亮）；`CollectionNavRow` 和资源收藏集都复用它。
- `SectionCard`：笔记/白板分组卡与资源分组卡共用的卡片外壳（头部、chevron、tint、计数、折叠、拖拽/右键透传）。
- `CollectionDialogs`：收藏集的重命名与删除对话框；`useNotePdfDialogs` 统一笔记/PDF 的选中、删除撤销与 toast，`LibraryView`、`DocumentSidebar`、`ResourceCollectionList` 共用。
- `useLibraryDnd` + `LibraryDragOverlay`：vault 排序、收藏集排序、笔记/PDF 拖入收藏集、拖拽浮层的唯一状态机；两个侧栏宿主只挂载一次。拖入收藏集是**移动**语义（单归属）。
- `LibraryTitle` / `SearchLimitHint`：工具栏标题与搜索上限提示的共用展示。
- `lib/librarySelection.ts`：分组选择记忆的 key 构造与读写；笔记/PDF 保持旧 key，资源收藏集用 `last_resource_coll`。

新增来源时：优先在 `librarySources.ts` 注册元数据、在 `libraryGroups.ts` 加适配器，再接内容组件；不要复制一套侧栏行/对话框/拖拽状态机。

## 异步与交互模式

- **三态列表**：首载无数据 → `Skeleton` / `SkeletonRows`；已加载为空 → `EmptyState`；刷新时保留旧数据，不闪空。
- **暖切换**：`useNoteLibrary` 在切库时保留旧库数据（可带 150ms 延迟提示），新数据到达再替换；异步响应必须用请求序号/库路径校验，避免旧响应覆盖新库。
- **写操作失败**：必须 `useToast()(msg, "error")`；可撤销操作使用 toast `action`（约 5 秒）。
- **右键菜单**：`useContextMenu()` + `MenuItem[]`；不要自己写浮层定位。
- **拖拽**：统一 dnd-kit；纵向排序用 `SortableList`，跨区用 `DndContext` + `SortableContext`；点击与拖拽共存用 `useDragClickGuard`。
- **深链**：`window.dispatchEvent(new CustomEvent("prism:open-note", { detail }))`；`App` 在库列表就绪前后都能处理。
- **错误边界**：`App` 外层 `ErrorBoundary`；模块级错误不要静默吞掉。

## 常见改动点

| 要改什么 | 先看 |
|---|---|
| 顶部导航/模块切换 | `src/App.tsx`、`src/lib/workspace/types.ts` 的 `ModuleId` |
| 标签栏/标签菜单 | `src/components/TabStrip.tsx`、`App.tsx` 的 `handleTabContextMenu` |
| 分屏行为 | `WorkspaceProvider` 的 `openInSplit`/`closeSplit`、`DocumentWorkspace` |
| 工作区恢复 | `WorkspaceProvider.hydrate` 与 `PersistedWorkspace` |
| 侧栏槽位 | `src/components/AppSidebarSlot.tsx` |
| 工具栏 | `src/components/toolbar/ToolbarProvider.tsx`、`AppToolbar.tsx` |
| 资料库模式 | `src/components/library/LibraryDataProvider.tsx`、`LibraryView.tsx` |
| 资料库分组行/卡片/对话框 | `LibraryGroup` 适配器、`GroupNavRow`、`SectionCard`、`CollectionDialogs` |
| 资料库拖拽 | `useLibraryDnd`、`LibraryDragOverlay` |
| 分组选择记忆 | `src/lib/librarySelection.ts` |

## 验证

- 自动：`npm run verify`。
- 手测：切模块再切回文档，编辑/滚动/PDF 页是否保留；打开/关闭/重排标签；分屏左右聚焦与替换；重启恢复标签/分屏/当前库；找不到文件的标签被丢弃；深链打开笔记；窄窗口下侧栏折叠。
