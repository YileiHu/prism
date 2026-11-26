---
name: quickstart
description: >-
  Prism architecture cheat sheet — use when starting a session, locating a
  feature, or checking conventions before editing.
whenToUse: >-
  "start a Prism session", "where is X", "which file should I edit",
  "project conventions", "how do I verify"
user-invocable: true
---

# Prism Quickstart — 会话起步

## 60 秒了解

Prism 是本地优先的个人知识管理桌面应用（Electron 43 + React 19 + TS + Vite + better-sqlite3）：笔记库、PDF 库、白板库、网页资源、GTD 共用一个窗口。笔记是普通 `.md`，白板是库内 `.json`，SQLite 只做索引/事务数据。

- 渲染层没有 Node 权限；所有 DB 访问走 `window.prism` IPC。
- 主进程入口 `electron/main.ts`；preload `electron/preload.ts`；DB `electron/database.ts`。
- 渲染入口 `src/main.tsx` → Provider 链 → `src/App.tsx` 外壳。
- 编辑器是项目最复杂的部分（CodeMirror + markdown-it + 块容器）。

## 会话起步

1. `git status --short`，确认工作区状态。
2. 非平凡任务先读 `docs/ai/memory.md` 的「当前快照 / 已定决策」。
3. 在 `docs/index.md` 的「任务定位」找到子系统，再读对应 `docs/architecture/*`。
4. 改 UI 或通用逻辑前，先查 `docs/reference/ui-inventory.md` 与 `docs/guides/ui-kit.md`，再 `grep` 现有调用点；复用 > 扩展 > 新建。
5. 只有跨层改动才读 `.dsh/skills/ipc-and-data` 或 `ui-settings-i18n`。
6. 改完先 `npm run lint`；契约变化再 `npm run docs` + `npm run docs:check`；收尾 `npm run verify`。

## 硬规则

1. 自动验证只跑 `npm run verify`（lint + docs 检查）；**不做** UI 自动化、截图、CDP、隔离 Electron 实例。UI 由用户手动验收，改完说明「需要手动验证什么」。
2. 回复用中文；代码、标识符、命令保持原样。
3. 禁止硬编码颜色（`gray-*`、`red-*` 等），用 `src/index.css` / `tailwind.config.js` 的语义 token。
4. 界面文案必须走 `useT()` + `i18n/zh.ts` / `en.ts` 双份，参数用 `.replace("{count}", …)`。
5. 新 IPC 通道同时改 `electron/main.ts` + `electron/preload.ts`；渲染层只经 `window.prism`。
6. 跨进程模型只在 `src/shared/models.ts`；DB 行在 `database.ts` 边界映射成 camelCase + boolean。
7. 读取/保存/附件/协议/白板路径统一由 `findOwningVault` / `requireVaultRoot` 把关。
8. 设置项先在 `src/shared/settings.ts` 注册，再写 `components/settings/<Section>.tsx`。
9. 异步列表：首载 `Skeleton`，已加载为空 `EmptyState`，刷新保留旧数据。
10. 小改不更新文档；IPC/设置/表结构/快捷键/主题/i18n 契约变化跑 `npm run docs`；整块功能更新架构文档与 `memory.md`。生成物 `docs/reference/*` 不手改。
11. 外部仓库 `D:\MyDocuments\MyNotes` 的 `Life/` 永不 `git add -f`。
12. 复用优先：禁止为单个页面复制已有控件/函数；同一逻辑/样式第二处出现就提取（`src/lib/`、`src/components/` 根目录、`components/settings/controls.tsx`），模块私有件不跨模块引用。
13. 数字输入禁止原生 `type="number"`：数值字段用 `NumberInput`（失焦解析 + `min`/`max` clamp），只需字符过滤用 `NumericInput`；设置行/块用 `SettingRow` / `SettingBlock`。
14. 禁止手写原生 `<button>` 做图标/操作按钮；用 `Button`。原生 `<button>` 只用于基础控件、窗口 chrome、编辑器工具栏与自绘复合控件。
15. 新增 Button/共享控件的 variant 或 size 必须先提出请求并得到确认，不能边做边加。
16. `ItemRow` 行尾不放任何操作按钮/图标（删除等走右键 `menuItems`，编辑点整行），行间不加分割线；`trailing` / `meta` 只放状态内容。内容 modal 内也不放删除按钮/图标或 footer `ghost-danger`，删除入口在行/卡片的右键菜单，确认走 `ConfirmDialog`。
17. 控件映射（先查再写）：选值/下拉 → `SelectButton`（**禁止** Button + DropdownMenu 手拼）；图标动作菜单 → `DropdownMenu`（新文件会被 `docs:check` 拦）；右键 → `ContextMenu`；开关 → `Toggle`；滑杆 → `Slider`；行 → `ItemRow`；分段/筛选 → `SegmentedToggle`/`ChipTabs`；列表多选 → `useMultiSelect` + `SelectModeButton` + `BatchActionBar`（勾选块 `SelectionCheck`）。不确定就查 `docs/reference/ui-inventory.md`，仍不确定就停下来问。

## 命令

```bash
npm install
npm run rebuild          # Electron 原生 better-sqlite3
npm run electron:dev     # 开发（固定 5173）
npm run lint             # tsc --noEmit
npm run docs             # 重新生成 docs/reference/*
npm run docs:check       # 文档/IPC/路径/版本/i18n 校验
npm run verify           # lint + docs:check
npm run electron:build   # NSIS 安装包
npm run release:win      # verify + electron:build
```

## 定位

| 改什么 | 先读 | 主要文件 |
|---|---|---|
| 外壳/导航/标签/分屏 | `docs/architecture/renderer.md` | `src/App.tsx`、`src/lib/workspace/` |
| 笔记库/收藏集/PDF/GTD/资源 | `docs/architecture/features.md` | `src/components/library/`、`pdf/`、`gtd/` |
| 编辑器/Markdown/块/嵌入 | `docs/architecture/editor.md` | `src/components/editor/` |
| 白板/画布 | `docs/architecture/canvas.md` | `src/components/canvas/`、`src/lib/canvas/` |
| IPC/DB/扫描/私密仓库 | `docs/architecture/main-process.md`、`data-model.md` | `electron/main.ts`、`database.ts`、`privateVault.ts` |
| 设置/文案/快捷键/主题/控件 | `docs/guides/ui-kit.md`、`docs/guides/recipes.md` | `src/shared/settings.ts`、`components/settings/` |
| 找可复用控件/函数/样式 | `docs/reference/ui-inventory.md`、`docs/guides/ui-kit.md` | `src/components/`、`src/lib/` |
| 发布/打包 | `docs/guides/verify-and-release.md` | `package.json`、`src/data/changelog.ts` |

完整索引与术语见 `docs/index.md`、`docs/ai/glossary.md`。

## 验证

- 默认：`npm run lint`。
- 契约变化：`npm run docs` → `npm run docs:check`。
- 收尾：`npm run verify`。
- Markdown 渲染改动：按 `docs/guides/verify-and-release.md` 的 smoke test 构建两个 bundle 后跑 `scripts/md-smoke-test.mjs`。
- 本会话沙箱若阻止 `npm` 子进程，等价执行 `node node_modules/typescript/bin/tsc --noEmit` 与 `node scripts/ai/check-docs.mjs`。
