# 主进程

> 入口：`electron/main.ts`。相关：`electron/preload.ts`、`electron/database.ts`、`electron/privateVault.ts`、`electron/sidecar.ts`、`electron/paths.ts`。

## `main.ts` 分区

| 区域 | 职责 |
|---|---|
| 顶部 import / 协议注册 | 四个 privileged scheme 必须在 app ready 前注册 |
| Window state | 读写 `window_bounds`、多显示器可见性校验、失焦/移动去抖保存、最大化事件 |
| 原生颜色 | `applyNativeColorMode` 同步 `nativeTheme` 与窗口背景色 |
| Fetch title | 网页资源标题抓取 |
| Vault scanning | 递归找 `.md`、mtime diff、批量读、标签提取、写索引 |
| Vault watchers | 每个库一组 `fs.watch`；防抖扫描；失败重建；focus 安全网 |
| 路径解析 | `findOwningVault`、`registeredVaultPaths`、`requireVaultRoot` |
| Private vaults | 私密库判定、未解锁校验、synthetic note id、隐私事件 |
| PDF scanning | PDF 库扫描、封面文件、引用解析、watcher、`applyPdfRepo` |
| IPC handlers | 所有 `ipcMain.handle`，按域分组 |
| App lifecycle | `whenReady`、协议注册、清理、锁屏/休眠锁定 |

## IPC 约定

- 通道命名 `域:动作`：`vault:*`、`pdf:*`、`gtd:*`、`note-collections:*`、`canvas-groups:*`、`settings:*`、`window:*`。
- 新通道必须同时改两处：`electron/main.ts` 的 `registerIpcHandlers()` + `electron/preload.ts` 的 `api`；渲染层只经 `window.prism`。
- 参数在边界收窄：字符串 `String(...)`、数字校验、数组判空；路径必须先过 `findOwningVault` / `requireVaultRoot`。
- 返回值使用 `src/shared/models.ts` 的领域模型；不要让 DB 行结构漏到渲染层。
- main → renderer 的推送用 `mainWindow?.webContents.send(channel, payload)`；preload 暴露 `onXxx(cb)` 并返回取消订阅函数。
- 错误用稳定的字符串错误码跨 IPC：`VAULT_LOCKED`、`OUTSIDE_VAULT`、`BAD_PASSWORD`、`PDF_NOT_FOUND`、`PDF_REPO_NOT_SET`。

完整通道表见 [IPC 参考](../reference/ipc.md)（生成物）。

## Vault 索引与 watcher

### 扫描

`scanVaultIncremental(vaultPath, excludedRoots)`：

1. 递归收集 `.md` 路径 + mtime；跳过点目录（`.prism`、`.git` 等）和 `excludedRoots`（嵌套私密库）。
2. 与 DB 中该库的 `modified_at` 对比，只处理变化文件。
3. 每 30 个文件并行读取，提取：
   - 标题 = 文件名去 `.md`；
   - 标签 = YAML frontmatter 的 `tags`（行内数组或列表）+ 正文 `#tag`（先剔除代码块/行内代码）；
   - 内容与 mtime。
4. 磁盘上已不存在的 DB 行 → `deletePaths`。
5. 调用 `syncVaultNotes` 写库；只在有变化时向渲染层推送 `vault:updated`（带 `{ upserted, deleted }`）。

`ensureVaultIndex` 每个库每次运行只完整索引一次；并发调用共享同一个 in-flight Promise。私密库**从不索引**。

### watcher

- `watchVault` 优先递归 `fs.watch`；Linux/递归不可用时退化为逐目录 watcher。
- 事件先过滤点目录与非 `.md`；私密库只做文件列表刷新，不读内容。
- 800ms 防抖后 `rescanAndNotify`；只有索引实际变化才推送。
- watcher 出错：关闭并 2s 后重建；目录不存在（拔盘）时保持 unwatched，等 focus 安全网重新挂载。
- `App` 在窗口 focus 时触发同步；主进程内部对 focus 扫描有 30s/5min 两档节流。

### 一致性

- `saveNote` 写入**真实文件 mtime** 到 DB，watcher 随后的扫描不会误判为变化。
- 点目录写入（如 `.prism/collections.json`）不会触发笔记索引更新。
- 扫描失败按「尽力而为」处理，不推断删除；PDF 扫描用 `complete` 标记避免不完整遍历导致误删。

## 路径安全

| 函数 | 用途 |
|---|---|
| `pathKey` / `isPathInside` | 统一正斜杠、去尾斜杠、大小写折叠；判断包含关系 |
| `findOwningVault(filePath)` | 在已注册库中找最长前缀的拥有者；不在任何库内返回 `null` |
| `requireVaultRoot(vaultPath)` | sidecar/白板等库级操作必须精确指向库根，不能是库内嵌套路径 |
| `normalizeVaultPath` | 私密库/路径比较的规范化 |

规则：

- 读取、保存、附件、协议访问、白板读写都必须先解析拥有者。
- Windows/macOS 大小写不敏感；只改大小写的重命名不能走「已存在」后缀逻辑。
- 私密库内容对外表现为「不存在」：公开父库扫描会排除嵌套私密库根。

## 私密仓库

实现：`electron/privateVault.ts`；状态 UI：`src/lib/vaultLock.tsx`、`src/components/vault/*`。

- **标记文件**：`<vault>/.prism/private.json` 是唯一权威；`vault_paths` 里的 `private` 只是提示。
- **文件格式**：`PVD1 | version | nonce | tag | ciphertext`；AES-256-GCM；文件名保持明文。
- **密钥**：每库一个 DEK，由密码经 scrypt（N=32768,r=8,p=1）派生的 KEK 包裹；可有多条 wrap（密码/恢复密钥）。
- **会话**：解锁后 DEK 只在主进程内存；空闲计时器到期、锁屏、休眠、退出都会清零；密文图片禁止进入 Chromium 磁盘缓存（`cache-control: no-store`）。
- **迁移**：`make-private` 逐文件加密并写 marker，中断后可恢复；`make-public` 反向解密；`change-password` 只重包 DEK，不重写文件。
- **索引**：私密库不写入 `notes` 表；文件列表与 synthetic id 由主进程临时提供。
- **事件**：`vault:privacy-changed`、`vault:locked`、`vault:unlocked`、`vault:migration-progress`；渲染层锁定时关闭该库文档标签。

## PDF 库

- 库根来自 `pdf_repo_path`；`applyPdfRepo` 扫描、建索引、挂 watcher、推送 `pdf:updated`。
- 扫描只认 `.pdf`，跳过点目录；`complete=false` 时不做删除推断。
- 行保存 `repo_path`、绝对 `path`、POSIX 相对 `rel_path`、标题、大小、mtime、页面数、封面字段。
- 封面文件在 `userData/pdf-covers/<id>.jpg`；自定义封面用 `nativeImage` 缩放后写 JPEG；重置只改 DB 标记。
- 删除 PDF 时先 `shell.trashItem`，成功后删行与封面文件；逐项返回结果，不因单个失败中断整批。
- `pdf:resolve-embed` 按 relPath（带/不带 `.pdf`）再按标题解析，避免为一张嵌入卡拉全库。

## 自定义协议

| 协议 | 用途 | 安全 |
|---|---|---|
| `prism-file` | Markdown 图片/媒体 | 只服务已注册库；媒体扩展名白名单；解析顺序 note-relative → vault 根 → basename 扫描；私密库需解锁且 `no-store` |
| `prism-pdf` | PDF 流式读取 | 只服务 `pdf_documents` 中且位于当前库内的行；支持 HTTP Range；CORS |
| `prism-cover` | PDF 封面 | 只服务 `pdf_documents` 行与 `userData/pdf-covers` 下的文件；不可变缓存 |
| `prism-asset` | pdf.js 的 cmaps / standard fonts / wasm | 从打包的 `pdfjs-dist` 读取；kind 白名单 + `basename` 校验防穿越 |

## 窗口与原生状态

- 窗口位置/大小/最大化写入 settings `window_bounds`；启动时若保存坐标已不在任何显示器可见区域则忽略坐标。
- `app:set-color-mode` 同步 `nativeTheme.themeSource` 与窗口背景色，避免启动/重绘闪白。
- Windows 使用无边框窗口；渲染层自绘标题栏与窗口按钮。
- 隐藏到托盘的主窗口保留渲染进程，靠 Chromium 的 `backgroundThrottling` 节流；应用没有自建轮询定时器。

## 托盘、关闭行为与开机启动

- 设置 `close_behavior`：`quit`（默认）关窗即退出；`tray` 关窗只隐藏主窗口（`close` 处理器 `preventDefault` + `hide()`），渲染进程保留换取秒开。托盘创建失败时 `close` 不拦截，退化为退出。
- 托盘按需创建（`syncTray`）：`close_behavior === "tray"`、本次以 `--hidden` 启动、或开启了 `auto_launch` + `auto_launch_hidden` 时存在；`will-quit` 销毁。菜单只有「显示 Prism / 快速记录 / 退出 Prism」；Windows/Linux 左键切换主窗口，macOS 点击弹菜单。
- 原生托盘文案没有 `useT()`：主进程从 `src/i18n/zh.ts` / `en.ts` 取 `tray.*`，按 `app.getLocale()` 选择（非英文回落中文），双份对齐仍由 `docs:check` 保证。
- 全局快捷键由 `applyGlobalShortcuts` 统一注册（`GLOBAL_SHORTCUT_ACTIONS`）：`quickCapture` 打开快速记录小窗，`showMain` 调 `revealMainWindow()`（无主窗口时按需创建）。注册结果经 `shortcuts:get-global-status` 给设置页做「注册失败」提示；`shortcuts` 设置变化时整体重新注册。渲染层只兜底 `quickCapture`（`QUICK_CAPTURE_EVENT`），`showMain` 是纯主进程行为。
- 开机启动：`applyAutoLaunch` 调 `app.setLoginItemSettings`；只在 `app.isPackaged` 时写系统启动项（开发模式会注册 electron.exe），每次启动自愈路径/参数。`auto_launch_hidden` 仅在 Windows 生效，通过登录项 `args: ["--hidden"]` 传入。
- `--hidden` 启动**不创建主窗口**：没有渲染进程、没有 vault watcher、不扫 PDF 库；vault watcher 本来就由渲染层 `vault:set-path` 触发，PDF 库由 `ensurePdfRepoRestored` 在第一次创建主窗口时恢复。主窗口由托盘 / 第二实例 / `app:activate` 经 `revealMainWindow` 按需创建。
- `window-all-closed` 只在「没有托盘且不是隐藏启动」时退出：否则关闭快速记录小窗会把仅托盘驻留的实例一起关掉。
- 「关闭即退出」优先于托盘存在：主窗口 `closed` 且 `close_behavior === "quit"` 时直接 `app.quit()`（macOS 保持关窗不退出）。`powerMonitor` 的 `shutdown`、窗口 `query-session-end` / `session-end` 会先置 `isQuitting`，避免关机被托盘逻辑拦住。
- 单实例：仅打包版 `app.requestSingleInstanceLock()`；第二实例带 `--hidden` 忽略，否则 `revealMainWindow()`。开发模式跳过，避免 `electron:dev` 与已安装版抢锁。
- 渲染层用 `app:get-launch-state` 拿 `packaged` / `loginItemSupported` / `hiddenStartSupported`，据此禁用设置行并提示。

## 改动地图

| 要改什么 | 先看 |
|---|---|
| 新增 IPC 通道 / handler | [recipes](../guides/recipes.md) 的「新增 IPC」；`registerIpcHandlers` |
| 改扫描/标签提取 | `scanVaultIncremental`、`extractTags` |
| watcher 行为/节流 | `watchVault`、`scheduleVaultScan`、`rescanAndNotify` |
| 路径权限 | `findOwningVault`、`requireVaultRoot`、`electron/paths.ts` |
| 私密仓库 | `electron/privateVault.ts`、`requireUnlocked`、`src/lib/vaultLock.tsx` |
| PDF 索引/封面 | `scanPdfRepoIncremental`、`applyPdfRepo`、`registerCoverProtocol` |
| 协议/媒体 | `registerAssetProtocol`、`registerPdfProtocol`、`registerPdfjsAssetProtocol` |
| 窗口状态/主题 | `createWindow`、`applyNativeColorMode` |
| 托盘/关闭行为/开机启动 | `syncTray`、`applyAutoLaunch`、`revealMainWindow`、`ensurePdfRepoRestored`；[设置参考](../reference/settings.md) |

## 验证

- 自动：`npm run verify`（类型 + 文档契约）。
- 手测：新增/移除笔记库后列表与 watcher 是否更新；重命名/外部修改笔记；私密库解锁/锁定/重启；PDF 扫描、封面、嵌入；图片在阅读/编辑模式的显示；窗口关闭重启后的位置与分屏恢复。
