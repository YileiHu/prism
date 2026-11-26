# 架构总览

> 读完本文应能回答：Prism 有哪些进程和层、启动时发生什么、数据放在哪、模块如何切换、哪些约束不能破。

## Prism 是什么

本地优先的个人知识管理桌面应用：笔记库、PDF 库、白板库、网页资源与养成（含任务）集中在单窗口里。笔记是普通 `.md` 文件；白板是笔记库里的 `.json` 文件；PDF 留在原文件夹；SQLite 只做索引与事务数据。

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron 43（主进程 + preload + 渲染进程） |
| UI | React 19 + TypeScript + Vite + Tailwind |
| 状态 | React Context + `localStorage`（少量 UI 偏好） |
| 持久化 | better-sqlite3（WAL）+ 文件系统 + `.prism` sidecar |
| 编辑器 | CodeMirror 6 + markdown-it + KaTeX + highlight.js |
| PDF | pdfjs-dist |
| 白板 | @xyflow/react |

## 进程模型

```
Renderer (React SPA, no Node)              Main Process (Node.js)
┌───────────────────────────┐             ┌────────────────────────────┐
│ window.prism.xxx()        │── invoke ──→│ ipcMain.handle(ch, fn)     │
│ onXxx(callback)           │←── send ────│ webContents.send(ch, …)    │
│ <img src="prism-file://…">│── HTTP ────→│ protocol.handle(...)       │
└───────────────────────────┘             │ better-sqlite3 (prism.db)  │
                                          │ fs watchers / PDF scan     │
                                          └────────────────────────────┘
```

- 渲染层**没有 Node 权限**（`nodeIntegration: false`、`contextIsolation: true`）。
- 所有数据库访问都经 IPC；`electron/preload.ts` 的 `api` 就是 `window.prism` 的唯一来源。
- 跨进程模型只在 `src/shared/models.ts` 定义；DB 行在 `electron/database.ts` 边界映射成 camelCase + boolean。
- 主进程还负责：窗口状态、托盘与开机启动、原生主题、vault/PDF 扫描与 watcher、私密仓库加解密、四类自定义协议。

## 启动链

### 主进程（`electron/main.ts`）

1. 模块加载时注册四个 privileged scheme（必须在 app ready 前）：`prism-file`、`prism-cover`、`prism-pdf`、`prism-asset`。
2. `app.whenReady()`：
   - 关闭应用菜单；
   - `initDatabase()`（`userData/prism.db`，WAL）；
   - 注册私密仓库的空闲锁定与 locked/unlocked 推送；监听锁屏/休眠并锁定；
   - 注册四个协议 handler；
   - `registerIpcHandlers()`；
   - `applyAutoLaunch()` 自愈登录项；非 `--hidden` 启动时 `createWindow()`（冷启动，恢复窗口位置/大小/最大化状态，设置背景色避免闪白）；托盘/第二实例/`app:activate` 重建窗口时 `createWindow(true)`，渲染层 URL 带 `?restore-workspace=1`；
   - `syncTray()`：按设置决定是否创建托盘；`--hidden` 启动没有主窗口、没有渲染进程；
   - 注册全局快捷键（快速记录小窗 / 呼出主界面）；
   - PDF 库延后到第一次创建主窗口时才恢复并异步扫描。
3. `will-quit`：销毁托盘、停止所有 vault watcher、停止 PDF watcher、清零私密仓库会话密钥。

### 渲染层（`src/main.tsx`）

Provider 顺序固定：

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
                └ LibraryDataProvider
                  └ ToastProvider
```

- `SettingsProvider` 启动时一次 `getAllSettings()` 批量载入；`set()` 写回 `settings:set` 并广播 `settings-saved`。
- `App` 读取 `vault_paths` 设置、查询私密仓库状态、调用 `WorkspaceProvider.hydrate()` 恢复标签与上次资料库（托盘重建窗口时恢复完整现场）；完成前显示启动屏。
- `App` 内部再挂 `LibraryDataProvider`（笔记/PDF/白板/网页资源四类来源数据）与 `ToastProvider`。

## 导航与外壳

- 顶级导航是**模块**：养成、资料库、设置；网页资源是资料库内的一个固定来源（与 PDF 库同级），不再是独立模块。冷启动固定进入养成-能力总览，托盘恢复保留当前页面。
- 打开文档后进入**工作区**：笔记 / 白板 / PDF 共用一条标签栏，可左右分屏；完整现场经 `workspace_v1` 持久化，冷启动只恢复标签/资料库，托盘重建窗口恢复激活文档与分屏。
- 模块页与工作区**同时挂载**，只切换可见性；切换标签或模块不会丢编辑器/滚动状态。工作区激活时模块页用 `visibility: hidden` 隐藏，而不是卸载。
- 每个模块的侧栏经 `ModuleSidebar` portal 到 `AppSidebarSlotProvider` 提供的全高槽位；模块内部不要自己平铺侧栏。
- 工具栏是贡献制：模块/文档向 `ToolbarProvider` 注册当前作用域的内容，`AppToolbar` 负责渲染。

## 数据归属

| 数据 | 位置 | 说明 |
|---|---|---|
| 网页资源、标签、任务、笔记索引、PDF 索引、设置 | SQLite `userData/prism.db` | 表结构见 [数据库参考](../reference/database.md) |
| 笔记正文 | `<vault>/**/*.md` | 唯一真实来源；SQLite 只是可重建索引 |
| 笔记附件 | `<vault>/<attachments_dir>/` | 默认 `attachments` |
| 白板 | `<vault>/<canvas_dir>/*.json`（旧 `<vault>/Projects/<项目>/*.json` 兼容） | 默认 `canvases`；新项目白板也在这里；不进 SQLite |
| PDF | 用户选择的 PDF 根目录 | 只索引，不移动文件 |
| 收藏集/分组 | `<vault>/.prism/collections.json` | 原子写；损坏时备份 `.bak` |
| 白板库分组 | `<vault>/.prism/canvas-groups.json` | 与画布内部容器不是一回事 |
| PDF 收藏集 | `<pdf repo>/.prism/pdf-collections.json` | 跟随 PDF 库根目录 |
| 私密仓库标记 | `<vault>/.prism/private.json` | 密钥包裹，不含明文 |
| 工作区/窗口/偏好 | SQLite `settings` 表 | `workspace_v1`、`window_bounds`、`vault_paths` 等 |
| 语言/设置分类/侧栏折叠等 | `localStorage` | 纯 UI 状态，可丢 |

## 顶层目录

```
prism/
├── electron/          # main.ts、preload.ts、database.ts、privateVault.ts、sidecar.ts、paths.ts
├── src/
│   ├── components/    # library/ pdf/ canvas/ editor/ growth/ settings/ workspace/ toolbar/ …
│   ├── lib/           # settings、workspace、canvas、vaultLock、toast、hooks、paths、colors
│   ├── shared/        # models.ts、settings.ts、shortcuts.ts（与主进程共用）
│   ├── theme/         # ThemeProvider + 8 套主题
│   ├── i18n/          # zh.ts（类型源）、en.ts、useT
│   ├── data/          # changelog.ts
│   ├── App.tsx        # 外壳
│   ├── main.tsx       # Provider 入口
│   └── index.css      # Tailwind + 语义 token + 共用效果类
├── scripts/           # 维护脚本 + ai/（文档生成与检查）
├── docs/              # 本套文档
└── vite.config.ts     # vite-plugin-electron；固定 5173
```

## 核心不变量

1. **DB 只经 IPC**：渲染层只出现 `window.prism`，不 import `electron/*`，不用 Node API。
2. **跨进程类型只在 `src/shared/models.ts`**；数据库行保持 snake_case + 0/1，在 `database.ts` 边界转换。
3. **路径安全**：读取/保存/附件/协议访问统一经 `findOwningVault` / `requireVaultRoot` 校验；最长前缀、大小写不敏感。
4. **Markdown 是唯一持久化**：阅读/编辑/嵌入都不引入第二份文档状态。
5. **设置先注册**：`src/shared/settings.ts` 是默认值、校验、编解码的唯一来源。
6. **i18n 双份对齐**：`zh.ts` 是类型源，`en.ts` 必须同 key；界面文字必须走 `useT()`。
7. **颜色走语义 token**：禁止 `gray-*` / `red-*` 等硬编码，统一 `src/index.css` 与 `tailwind.config.js`。
8. **模块常驻**：切模块/标签不卸载页面；需要保留的本地状态不要放在会被卸载的组件里。
9. **异步列表三态**：首载 Skeleton、已加载空态 EmptyState、刷新保留旧数据。
10. **私密仓库锁定即失效**：锁定时关闭该库的文档标签；解密内容不写 Chromium 磁盘缓存。

## 下一步

- 主进程细节：[main-process](main-process.md)
- 数据与 sidecar：[data-model](data-model.md)
- 渲染层与工作区：[renderer](renderer.md)
- 各功能域：[features](features.md)
