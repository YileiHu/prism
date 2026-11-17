# 术语表

> UI 是中文，代码是英文；先在这里对齐，再搜代码。路径均为仓库相对路径。

## 产品与导航

| 中文 | 代码/类型 | 主要位置 |
|---|---|---|
| 仓库 / 资料库 | `LibraryView` / module `library` | `src/components/library/LibraryView.tsx` |
| 事务 / GTD | `GtdView` / module `gtd` | `src/components/gtd/GtdView.tsx` |
| 网页资源 | `WebResources` / module `resources` | `src/components/WebResources.tsx` |
| 设置 | `Settings` / module `settings` | `src/components/Settings.tsx` |
| 工作区 | `WorkspaceProvider` / `WorkspaceState` | `src/lib/workspace/WorkspaceProvider.tsx` |
| 文档标签 | `DocTab` / `TabStrip` | `src/lib/workspace/types.ts`、`src/components/TabStrip.tsx` |
| 分屏 | `SplitState` / `openInSplit` | `src/lib/workspace/WorkspaceProvider.tsx` |
| 侧栏槽位 | `AppSidebarSlotProvider` / `ModuleSidebar` | `src/components/AppSidebarSlot.tsx` |
| 工具栏 | `ToolbarProvider` / `AppToolbar` | `src/components/toolbar/ToolbarProvider.tsx` |
| 启动屏 | `SplashScreen` | `src/components/SplashScreen.tsx` |
| 更新日志 | `ChangelogModal` / `changelog.ts` | `src/components/ChangelogModal.tsx`、`src/data/changelog.ts` |

## 资料库

| 中文 | 代码/类型 | 主要位置 |
|---|---|---|
| 笔记库 | `vault` / `VaultEntry` / `vaultPath` | `src/types.ts`、`src/components/settings/VaultsSection.tsx` |
| 笔记 | `NoteBrief` / `notePath` | `src/shared/models.ts` |
| 收藏集 | `NoteCollectionData` / `CollectionData` | `src/components/useCollections.ts`、`src/components/collectionTypes.ts` |
| 分组 | `NoteGroupData` / `CollectionDetail` | `src/components/collectionTypes.ts` |
| PDF 库 | `PdfDocumentsProvider` / `repoPath` | `src/components/pdf/PdfDocumentsProvider.tsx` |
| PDF 收藏集 | `PdfCollectionData` / `usePdfCollections` | `src/components/pdf/usePdfCollections.ts` |
| 回收站 | `trashFile` / `deleteNotes` / `deletePdfDocuments` | `electron/main.ts` |

## 白板

| 中文 | 代码/类型 | 主要位置 |
|---|---|---|
| 白板 / 思维导图 | `canvas` / `CanvasDoc` | `src/lib/canvas/model.ts` |
| 白板库 | `useCanvasLibrary` / `CanvasLibraryContent` | `src/components/library/CanvasLibraryContent.tsx` |
| 白板库分组 | `CanvasGroupsFile` / `CanvasGroup`（`shared/models.ts`） | `.prism/canvas-groups.json`、`src/components/library/useCanvasGroups.ts` |
| 画布内部容器 | `CanvasGroup`（`lib/canvas/model.ts`） | `src/lib/canvas/model.ts`、`src/components/canvas/nodes/GroupNode.tsx` |
| 卡片 / 节点 | `CanvasNode` / `BoardNode` | `src/lib/canvas/model.ts`、`src/components/canvas/nodes/BoardNode.tsx` |
| 连线 | `CanvasEdge` / `ArrowEdge` | `src/components/canvas/edges/ArrowEdge.tsx` |
| 预设 | `CanvasPreset` / `PresetBar` | `src/shared/settings.ts`、`src/components/canvas/PresetBar.tsx` |

## 事务

| 中文 | 代码 | 主要位置 |
|---|---|---|
| 收集箱 | `groupGtdTasks().inbox`（无日期且未归项目） | `src/components/gtd/GtdCalendarInbox.tsx` |
| 日历（默认首页） | `GtdCalendar` / `GtdCalendarAgenda` | `src/components/gtd/GtdCalendar.tsx` |
| 任务 | `GtdTask` | `src/shared/models.ts` |
| 项目 | `GtdProject` | `src/components/gtd/GtdProjectDetail.tsx` |
| 起始日期 | `scheduledDate` | `src/components/gtd/DueDateCalendar.tsx` |
| 截止日期 | `dueDate` | `src/components/gtd/DueDateCalendar.tsx` |
| 日期区间 | `taskDateRange` / `isTaskActiveOn` | `src/lib/gtd.ts` |
| 逾期 | `isTaskOverdue`（只看截止） | `src/lib/gtd.ts` |
| 已完成 | `completedAt` | `src/components/gtd/GtdCompleted.tsx` |
| 全局快速记录 | `quickCapture` / `quick-capture:open` / `quick-capture.html` | `src/quickCapture.tsx`、`electron/main.ts` |
| 快速记录小窗 | `showQuickCaptureWindow` / `quick-capture.html` | `electron/main.ts`、`src/quickCapture.tsx` |

> 设置里的快捷键行叫「全局快速记录」，指同一个功能；小窗 UI 标题用「快速记录」，文档指代界面时称「快速记录小窗」。不再用「全局捕获」「快速捕获」。代码标识符保持 `quickCapture`（对应英文 Quick capture），不与中文逐字绑定。

## 编辑器

| 中文 | 代码 | 主要位置 |
|---|---|---|
| 阅读模式 | `MarkdownPreview` | `src/components/editor/MarkdownPreview.tsx` |
| 编辑模式 | `NoteEditor` / CodeMirror | `src/components/editor/NoteEditor.tsx` |
| 实时预览 | `livePreview.ts` | `src/components/editor/livePreview.ts` |
| 块 / 容器 | `BlockRef` / `BlockSession` / `containers/*` | `src/components/editor/blockModel.ts`、`src/components/editor/blockSession.ts` |
| 提示卡 | callout | `src/components/editor/callouts.ts` |
| 嵌入 | embed / `![[…]]` | `src/components/embeds/model.ts`、`src/components/editor/markdown.ts` |
| 大纲 | `OutlineCard` / `HeadingOutline` | `src/components/editor/OutlineCard.tsx` |
| 附件 | `attachments_dir` / `saveAttachment` | `src/shared/settings.ts`、`electron/main.ts` |

## 通用

| 中文 | 代码 | 主要位置 |
|---|---|---|
| 私密仓库 | private vault / `PVD1` | `electron/privateVault.ts` |
| 解锁 / 锁定 | `unlockVault` / `lockVault` / `VaultLockProvider` | `src/lib/vaultLock.tsx` |
| 主题 | `themeId` / `themes.ts` | `src/theme/themes.ts` |
| 模式（深/浅/系统） | `mode` / `resolvedMode` | `src/lib/settings.tsx`、`src/theme/ThemeProvider.tsx` |
| 语义 token | `index.css` / Tailwind 主题 | `src/index.css`、`tailwind.config.js` |
| 设置项 | `AppSettings` / `SETTING_KEYS` | `src/shared/settings.ts` |
| 快捷键 | `ShortcutAction` / `ShortcutMap` | `src/shared/shortcuts.ts` |
| 托盘 / 最小化到托盘 | `Tray` / `syncTray` / `close_behavior = "tray"` | `electron/main.ts` |
| 开机自动启动 / 隐藏启动 | `auto_launch` / `auto_launch_hidden` / `--hidden` / `applyAutoLaunch` | `electron/main.ts`、`src/shared/settings.ts` |
| 呼出主界面 | `showMain` / `GLOBAL_SHORTCUT_ACTIONS` / `applyGlobalShortcuts` | `src/shared/shortcuts.ts`、`electron/main.ts` |
| 深链 | `prism:open-note` | `src/App.tsx` |
| 写操作提示 | `useToast` | `src/lib/toast.tsx` |

## 命名约定

- 路径参数：`vaultPath`、`repoPath`、`notePath(s)`、`filePath(s)`、`relPath`、`canvasPath`。
- 视觉枚举用 `variant`；数据配色用 `palette`；选中态 `active`/`selected`/`checked`/`parentActive`。
- 组件局部 props 用 `interface Props`；导出/多类型并存用 `XProps`。
- 跨进程模型只在 `src/shared/models.ts`；DB 行 snake_case + 0/1 只在 `electron/database.ts` 内部。
