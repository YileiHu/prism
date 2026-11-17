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
4. 只有跨层改动才读 `.dsh/skills/ipc-and-data` 或 `ui-settings-i18n`。
5. 改完先 `npm run lint`；契约变化再 `npm run docs` + `npm run docs:check`；收尾 `npm run verify`。

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
| 发布/打包 | `docs/guides/verify-and-release.md` | `package.json`、`src/data/changelog.ts` |

完整索引与术语见 `docs/index.md`、`docs/ai/glossary.md`。

## 验证

- 默认：`npm run lint`。
- 契约变化：`npm run docs` → `npm run docs:check`。
- 收尾：`npm run verify`。
- Markdown 渲染改动：按 `docs/guides/verify-and-release.md` 的 smoke test 构建两个 bundle 后跑 `scripts/md-smoke-test.mjs`。
- 本会话沙箱若阻止 `npm` 子进程，等价执行 `node node_modules/typescript/bin/tsc --noEmit` 与 `node scripts/ai/check-docs.mjs`。
