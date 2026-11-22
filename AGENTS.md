# Prism 项目约定

本地优先的个人知识管理桌面应用（Electron 43 + React 19 + TS + Vite + Tailwind + better-sqlite3）：笔记库、PDF 库、白板库、GTD、网页资源集中在单窗口里；笔记是普通 `.md` 文件。

**先读**：`docs/index.md`（任务定位表）、`docs/ai/memory.md`（决策与坑）。改编辑器/白板/数据层前，读对应 `docs/architecture/*` 与 `.dsh/skills/*`。

## 命令

```bash
npm run electron:dev     # Vite + Electron 开发（固定 5173）
npm run lint             # tsc --noEmit
npm run docs             # 重新生成 docs/reference/*
npm run docs:check       # 文档/IPC/路径/版本/i18n 校验
npm run canvas:mcp:build # 编译白板格式层到 MCP 服务（改 src/lib/canvas/* 后）
npm run canvas:mcp:test  # 白板 MCP 服务自测（临时库，不碰真实仓库）
npm run verify           # lint + docs:check
npm run rebuild          # 为 Electron 重编译 better-sqlite3
npm run electron:build   # 打包 NSIS 安装程序
npm run release:win      # verify + electron:build
```

## 硬性规则

- **自动验证只跑 `npm run verify`**（= `lint` + `docs:check`）。不要跑 CDP / Playwright / 截图类 UI 自动化，也不要另起隔离的 Electron 实例或开远程调试端口；UI 一律由用户手动验收，改完说明「需要手动验证什么」。
- **回复用中文**；代码、标识符、命令保持原样。
- **不要硬编码颜色**（`gray-*`、`red-*` 等），用 `src/index.css` / `tailwind.config.js` 的语义 token；界面文案一律走 `useT()` + `i18n/zh.ts` / `en.ts` 双份对齐。
- **所有 DB 访问走 IPC**：新通道同时改 `electron/main.ts` + `electron/preload.ts`；渲染层只经 `window.prism`，绝不在渲染层用 Node API。
- **跨进程模型只在 `src/shared/models.ts`** 定义类型；DB 行 snake_case + 0/1 在 `electron/database.ts` 边界映射成 camelCase + boolean。
- **路径安全**：读取/保存/附件/协议/白板访问统一由 `findOwningVault` / `requireVaultRoot` 把关。
- **设置项先在 `src/shared/settings.ts` 注册**，再写 `components/settings/<Section>.tsx` 的 UI。
- **异步列表**：首载无数据用 `Skeleton`，已加载且为空用 `EmptyState`，刷新时保留旧数据。
- **文档维护**：小改（调色、局部布局、单组件行为）不动文档；IPC/DB/settings/快捷键/主题/i18n 契约变化跑 `npm run docs`；整块功能/重构更新架构文档与 `docs/ai/memory.md`。`docs/reference/*` 是生成物，不手改。
- **外部仓库**：`D:\MyDocuments\MyNotes` 是独立 git 仓库（`master`，远端 `https://github.com/YileiHu/MyNotes`，私有），收录 `ComputerScience/`、`GameDeveloping/`；`Life/` 被 `.gitignore` 排除，永远不要 `git add -f` `Life/` 下的内容。

## 阅读路由

| 要改什么 | 先读 | 技能 |
|---|---|---|
| 外壳/标签/分屏/模块切换 | `docs/architecture/renderer.md` | `quickstart` |
| 笔记库/PDF/GTD/网页资源/设置 | `docs/architecture/features.md` | `quickstart` |
| Markdown/编辑器/块/嵌入 | `docs/architecture/editor.md` | `editor-and-canvas` |
| 白板/画布 | `docs/architecture/canvas.md` | `editor-and-canvas` |
| AI/MCP 画白板 | `docs/architecture/ai-canvas.md`、`integrations/prism-canvas-mcp/README.md` | `editor-and-canvas` |
| IPC/DB/扫描/私密仓库 | `docs/architecture/main-process.md`、`data-model.md` | `ipc-and-data` |
| 设置/文案/快捷键/主题/控件 | `docs/guides/ui-kit.md`、`recipes.md` | `ui-settings-i18n` |
| 发布/打包/提交 | `docs/guides/verify-and-release.md` | `release-and-package` |

查契约用生成物：`docs/reference/ipc.md`、`settings.md`、`database.md`、`code-map.md`。术语用 `docs/ai/glossary.md`。历史设计见 `docs/design/editor-block-refactor.md`。

## 验证收尾

1. `npm run lint`。
2. 契约变化：`npm run docs` → `npm run docs:check`。
3. 收尾：`npm run verify`。
4. 说明需要用户手测的路径（深/浅色、空态、键盘、分屏等）；不自行跑 UI 自动化。

> 本会话若 Windows 沙箱阻止 `npm` 子进程，等价执行 `node node_modules/typescript/bin/tsc --noEmit` 与 `node scripts/ai/check-docs.mjs`。
