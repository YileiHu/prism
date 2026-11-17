# 排错

> 先看现象，再按「定位 → 常见原因 → 处理」走。改动前优先备份 `userData/prism.db` 与相关文件。

## 启动与构建

### 启动崩溃 / 白屏 / `better-sqlite3` 报 ABI 不匹配

- 原因：`better-sqlite3` 是原生模块，必须针对当前 Electron ABI 重编译；升级 Electron 或重装 `node_modules` 后常见。
- 处理：`npm run rebuild`；仍失败时删除 `node_modules/better-sqlite3` 后重装再 rebuild。
- 确认：主进程日志里出现 `NODE_MODULE_VERSION` 相关错误即命中。

### 开发窗口空白，Vite 在别的端口

- `vite.config.ts` 固定 5173 且 `strictPort: true`；端口被占用应直接失败。
- 如果 Electron 仍加载旧端口，检查是否有残留的 Vite 进程，结束后重启 `npm run electron:dev`。

### 打包后启动失败

- 检查 `package.json` 的 `main` 指向 `dist-electron/main.js`，且 `vite build` 已生成该文件。
- `dist-electron` 由 vite-plugin-electron 生成；只跑 `vite build` 不一定会生成主进程代码，必要时跑完整 `electron:build`。

### 关闭窗口后应用还在运行 / 找不到托盘图标

- 设置「通用 → 关闭窗口时」：`quit` 关窗即退出；`tray` 只隐藏窗口，托盘图标是唯一入口（`electron/main.ts` 的 `close` 处理器）。
- 托盘只在需要时创建：选择「最小化到托盘」、开启了「开机启动时只驻留托盘」、或以 `--hidden` 启动。默认 `quit` + 未开自启时没有托盘图标。
- 托盘图标创建失败（Linux 缺 appindicator、打包漏了 `public/icon-16.png`）时 `close` 会退化为真正退出，不会留下不可达的隐藏进程。

### 开机自动启动不生效

- 只有安装版会写系统启动项（`app.isPackaged`）；开发模式下设置页会提示，属预期。
- macOS 只支持普通登录启动；「只驻留托盘」是 Windows 专属（登录项 `args: ["--hidden"]`）。
- 安装版仍不生效时，看任务管理器「启动」里是否有 Prism；应用每次启动会用当前设置自愈登录项的路径与参数。
- 只驻留托盘的实例没有主窗口、没有渲染进程；要打开主界面点托盘图标或按「呼出主界面」快捷键（默认 `Ctrl+Shift+M`），要记录按全局快速记录快捷键。
- 全局快捷键无反应：先在「设置 → 快捷键」看是否有注册失败提示（组合被其他程序占用），换一个组合即可；全局快捷键由主进程注册，与主窗口是否可见无关。

## 路径与协议

### 图片/附件在阅读或编辑模式空白

- 图片通过 `prism-file://` 服务：只服务已注册的库、只认媒体扩展名。
- 解析顺序：笔记所在目录 → 库根 → 同库内 basename 扫描；检查引用路径与大小写。
- 私密库未解锁时返回 423；解锁后仍空白，检查文件是否真的在库内。
- 文件名含 `%` 时不要二次 `decodeURIComponent`（协议 handler 已经解码）。

### PDF 空白/一直加载

- PDF 通过 `prism-pdf://` 流式读取，只服务 `pdf_documents` 中且位于当前库内的行；重新扫描 PDF 库。
- `prism-asset://` 提供 pdf.js 的 cmaps/standard fonts/wasm；打包后缺失会导致 CJK/扫描件渲染异常，检查 `pdfjs-dist` 是否被正确打包。
- 封面问题：`userData/pdf-covers/<id>.jpg` 是否存在；`cover_version` 是否随封面更新。

### 路径被拒绝（`OUTSIDE_VAULT` / `VAULT_LOCKED`）

- 读取/保存必须落在已注册库内；`findOwningVault` 最长前缀、大小写不敏感。
- sidecar/白板库操作要求精确的库根，嵌套路径会被 `requireVaultRoot` 拒绝。
- 私密库锁定状态下不能读写；先解锁。

## 数据库

### 旧版本启动后数据异常

- `initDatabase()` 用手写 `PRAGMA table_info` + `ALTER TABLE` 迁移；看 `database.ts` 顶部迁移顺序。
- 改 schema 前备份 `prism.db`（WAL 模式还需 `-wal`/`-shm`）。
- 笔记索引可重建：删除 `notes` 行后重新扫描库；不要把笔记正文存在 DB 里当唯一副本。

### 数据库锁定 / 写入失败

- 确认没有同时运行两个 Prism 实例。
- WAL 文件残留时不要只拷 `prism.db`；备份整个 `userData` 目录更稳。

## 私密仓库

- 密码错误：主进程返回 `BAD_PASSWORD`，UI 显示错误；没有找回密码的后门。
- 迁移中断：`PVD1` magic 让已加密/未加密文件可区分，重新发起迁移会继续；不要手动改 marker。
- 锁定后标签被关：这是预期行为；解锁后重新打开。
- 锁定时机：空闲分钟数（`private_lock_minutes`）、锁屏、休眠、退出；调试时不要把空闲时间设得过短。
- 私密库不进 SQLite 索引；搜索不到是预期，不是 bug。

## 文件监听

### 外部改笔记后列表不刷新

- watcher 有 800ms 防抖；窗口 focus 会触发安全扫描（30s/5min 节流）。
- 点目录（`.prism`、`.git`）与非 `.md` 文件被忽略；确认文件在库内且不是隐藏目录。
- 网络盘/可移动盘可能丢 watcher；主进程会在 focus 时重建。
- 保存笔记时 DB 写入真实 mtime，避免自己的保存触发重复扫描。

### 自动保存覆盖外部修改

- `saveNote` 以当前编辑器内容为准；外部修改后编辑器通过 `Transaction.remote` 重载，不会自动写回。
- 冲突/外部变更时看编辑器提示；不要手动同时用外部编辑器写同一文件。

## 编辑器

- 阅读/编辑模式位置跳动：模式切换有视口中线锚点；检查是否在 `NoteEditor` 之外改了滚动容器。
- 块编辑点击无效/焦点错乱：先读 [编辑器](../architecture/editor.md) 的块会话与不变量；常见原因是绕过 `blockSession` 直接 focus 子编辑器。
- 表格/代码/callout 下方空行删除异常：方向键黑盒聚焦与原子范围逻辑在 `livePreview.ts`，不要只改 CSS。
- 粘贴图片路径不对：走 `saveAttachment` → `image_path_style`；不要自己拼绝对路径。
- CRLF：保存时按原文件换行风格写回；不要统一转 LF。

## 白板

- 白板标签切换后画布空白/不可见：画布标签用 `display:none` 隐藏（React Flow 会写内联 `visibility: visible`，祖先 visibility 无效）；不要改成 visibility 方案。
- 保存冲突：文件被外部修改后保存返回 conflict；选择重新加载或覆盖，不要静默丢弃。
- 分组异常：资料库分组在 `.prism/canvas-groups.json`；未分组 = 全部 − 各组；删除分组后成员回未分组。
- 节点目标失效：笔记/PDF/白板被移动或删除后，目标只保留标题/路径；打开时按当前库重新解析。

## 设置 / i18n / 主题

- 设置不生效：确认键已在 `src/shared/settings.ts` 注册；`SettingsProvider` 启动时批量载入，写入是异步的。
- 设置页不显示新项：检查 `Settings.tsx` 分类与对应 section。
- 文案 key 报类型错误：`en.ts` 必须与 `zh.ts` 同 key；`en: Translation` 会强制。
- 占位符不一致：`docs:check` 会校验 `{placeholder}` 集合。
- 颜色不跟随主题：检查是否硬编码颜色；应使用语义 token 或 `var(--accent*)`。

## 文档检查失败

| 报错 | 处理 |
|---|---|
| `stale generated file …` | `npm run docs` |
| `references missing path …` | 文档里的路径已改名/删除；更新文档或确认是否写错 |
| `broken link …` | 修相对链接；注意从当前 md 文件所在目录解析 |
| `references missing npm script …` | 命令已改名；更新文档或在 `package.json` 加脚本 |
| `table … is not documented` | 在 `docs/architecture/data-model.md` 补表名与语义 |
| `missing UI row for shortcut action` | 在 `ShortcutsSection.tsx` 加行 |
| `preload … no ipcMain.handle` | 补主进程 handler，或删掉多余 preload 方法 |
| `calls window.prism.xxx` | 方法名写错或没加到 preload |
| 行数超限 | 拆分文档/技能，或删减重复内容 |

## 当前环境的沙箱限制

如果在本会话的 Windows 沙箱里 `npm run lint` 因命名管道（`\\.\pipe\...`）失败，这是执行环境限制，不是项目问题。可等价执行：

```bash
node node_modules/typescript/bin/tsc --noEmit
node scripts/ai/check-docs.mjs
```

正常终端直接 `npm run verify`。
