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
- `LibraryDataProvider` 只在 `App` 内，聚合笔记库、PDF 库、白板库数据；不要把它的 hook 挪到 Provider 链更外层。

## App 外壳

```
<header class="app-header">
  模块图标（事务/资料库/网页资源）
  TabStrip（文档标签 + 主题快捷菜单 + 更新日志 + 设置 + 窗口按钮）
</header>
<AppSidebarSlotProvider>
  <AppToolbar />
  <main class="app-main">
    模块页 ×4（常驻，按 module 切换可见性）
    DocumentWorkspace（工作区激活时可见）
  </main>
</AppSidebarSlotProvider>
<ChangelogModal />
<SplashScreen />
```

- 模块导航与文档标签互斥：有激活文档时显示工作区，否则显示当前模块。
- 默认模块是 `gtd`（事务），其默认子视图是日历；所有模块共用左侧栏槽位，没有例外。
- `paneStyle(active)` 用 `position:absolute` + `visibility:hidden` 隐藏非活动页；**不要改成条件渲染**，否则编辑器/PDF/画布状态会丢。
- 当前工具栏作用域：`module:<id>` 或 `doc:single` / `doc:<focusedSide>`。

## 侧栏槽位

- `AppSidebarSlotProvider` 在 header 下方创建「全高左侧槽位 + 右侧内容列」。
- 每个模块用 `<ModuleSidebar active={...}>` 把侧栏 portal 进槽位；`active=false` 时 `display:none`，但组件保持挂载。
- 只有活动模块的侧栏贡献宽度；不要在每个模块内部再包一层固定宽度侧栏。
- 侧栏折叠状态在 `src/lib/sidebarState.ts`（`useSyncExternalStore` + localStorage），模块共享。

## 工具栏

- `ToolbarProvider` 是一个小型外部 store：`useToolbarContribution(key, contribution)` 注册，`AppToolbar` 按当前 `scopeKey` 读取。
- `contribution` 支持 `title` / `subtitle` / `controls` / `actions`；调用方用 `useMemo` 保持对象identity，避免每次渲染都触发 store 更新。
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
  5. 把标签与库写回状态，标记 `hydrated`；`resume=false`（冷启动）时固定 `module = "gtd"`、`activeId = null`、`split = null`，所以每次都落在事务-日历；
  6. `resume=true`（主进程重建窗口时 URL 带 `?restore-workspace=1`）时按 `workspace_v1` 恢复 `module` / `activeId` / `split`；`activeId` 为 `null` 表示用户当时在模块页，保持模块页而不是回退到第一个标签，也不恢复被模块页遮住的分屏。
- hydration 前由深链打开的文档在两种模式下都优先；已有窗口的托盘恢复、第二实例和 `app:activate` 只 `show()`，不重新 hydrate，现场原样保留。
- 持久化：`hydrated` 后 150ms 去抖写 `workspace_v1`；切换库/标签/分屏/模块都会触发。
- 激活文档会把 `library` 切到它所属的库；用户手动切换库后，直到下次激活文档才覆盖。
- `DocumentWorkspace` 维护分屏比例（默认 50%，最小 25%），拖动时直接改 DOM 宽度，不 setState 每一帧；模块页隐藏工作区但不卸载，阅读位置/缩放得以保留。

## 资料库数据

`LibraryDataProvider` 聚合三种模式：

- `note`：`useNoteLibrary(vaultPath)` + `useCollections`；
- `pdf`：`usePdfDocuments` + `usePdfCollections`；
- `canvas`：`useCanvasLibrary` + `useCanvasGroups`。

它额外维护：

- 切到 PDF 时保留上一个笔记库路径，切回来不用重扫；
- 白板视图切换时写 `last_coll_<vault> = "__canvas__"`；
- PDF 库路径与当前 `library` 不一致时纠正。

`LibraryView` 按 `library.kind` 渲染 `NoteLibraryContent` / `CanvasLibraryContent` / `PdfLibraryContent`，侧栏统一由 `LibrarySidebar` 提供。

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

## 验证

- 自动：`npm run verify`。
- 手测：切模块再切回文档，编辑/滚动/PDF 页是否保留；打开/关闭/重排标签；分屏左右聚焦与替换；重启恢复标签/分屏/当前库；找不到文件的标签被丢弃；深链打开笔记；窄窗口下侧栏折叠。
