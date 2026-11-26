# Prism 文档入口

> 面向 AI 与开发者的项目地图。先读本页，再按「任务定位」跳到对应文档；不要从这里开始通读全部文档。

## 阅读路径

| 场景 | 顺序 |
|---|---|
| 第一次接手项目 | 本页 → [架构总览](architecture/overview.md) → `quickstart` 技能 |
| 改一个具体功能 | 本页「任务定位」→ 对应 `architecture/*` → 源码 |
| 找可复用控件/函数/样式 | [ui-inventory](reference/ui-inventory.md) → [ui-kit](guides/ui-kit.md) → `grep` 现有调用点 |
| 看控件实物、对比尺寸/状态 | 运行 `npm run electron:dev` 后打开 `http://localhost:5173/showcase.html` |
| 新增跨层能力（IPC/DB/设置） | [recipes](guides/recipes.md) → 对应 skill → `reference/*` |
| 查 API / 设置键 / 表结构 | [IPC](reference/ipc.md) / [设置](reference/settings.md) / [数据库](reference/database.md) |
| 发布打包 | [verify-and-release](guides/verify-and-release.md) → `release-and-package` 技能 |
| 遇到历史决策或坑 | [memory](ai/memory.md) → [troubleshooting](guides/troubleshooting.md) |

## 信息分层

| 层 | 位置 | 内容 | 加载方式 |
|---|---|---|---|
| 路由 | `AGENTS.md` | 硬规则、命令、入口 | 每次会话自动 |
| 技能 | `.dsh/skills/*/SKILL.md` | 任务步骤清单 | 任务匹配时 |
| 深度文档 | `docs/**` | 流程、不变量、坑 | 按需 |
| 机械事实 | `docs/reference/*.md` | IPC、设置、表结构、代码地图 | 按需，由脚本生成 |

## 任务定位

| 想改什么 | 先读 | 主要文件 |
|---|---|---|
| 顶部导航、模块切换、应用外壳 | [renderer](architecture/renderer.md) | `src/App.tsx`、`src/components/AppSidebarSlot.tsx` |
| 文档标签、分屏、工作区恢复 | [renderer](architecture/renderer.md) | `src/lib/workspace/WorkspaceProvider.tsx`、`src/components/workspace/DocumentWorkspace.tsx` |
| 笔记列表、搜索、收藏集、拖拽 | [features](architecture/features.md) | `src/components/library/NoteLibraryContent.tsx`、`src/components/useCollections.ts` |
| PDF 库、阅读器、封面、收藏集 | [features](architecture/features.md) | `src/components/library/PdfLibraryContent.tsx`、`src/components/pdf/PdfReader.tsx` |
| 白板库、画布、节点/边/容器 | [canvas](architecture/canvas.md) | `src/components/canvas/CanvasEditor.tsx`、`src/lib/canvas/model.ts` |
| AI / MCP 画白板 | [ai-canvas](architecture/ai-canvas.md) | `integrations/prism-canvas-mcp/server/*`、`integrations/prism-canvas-mcp/cordis.patch.yml` |
| 任务：日期、分组、完成、快速记录 | [features](architecture/features.md) | `src/components/growth/GrowthTasksCard.tsx`、`src/lib/taskDates.ts`、`electron/database.ts` |
| 养成：能力量表 / 挑战・赛季・作品（内容与展示）/ 自知 / 编年史 | [growth](architecture/growth.md) | `src/components/growth/GrowthView.tsx`、`src/lib/growth.ts`、`electron/database.ts` |
| 网页资源、收藏集、标题抓取 | [features](architecture/features.md) | `src/components/library/ResourcesLibraryContent.tsx`、`src/components/library/useResourceLibrary.ts`、`electron/main.ts` |
| Markdown 阅读/编辑、块容器、嵌入 | [editor](architecture/editor.md) | `src/components/editor/NoteEditor.tsx`、`src/components/editor/livePreview.ts` |
| 设置项、设置页、快捷键 | [ui-kit](guides/ui-kit.md)、[recipes](guides/recipes.md) | `src/shared/settings.ts`、`src/components/settings/*` |
| 找可复用控件/函数/样式 | [ui-kit](guides/ui-kit.md)、[ui-inventory](reference/ui-inventory.md) | `src/components/`、`src/lib/` |
| 关闭行为、托盘、开机启动 | [main-process](architecture/main-process.md) | `electron/main.ts`、`src/components/settings/GeneralSection.tsx` |
| IPC 通道、数据库、跨进程模型 | [main-process](architecture/main-process.md)、[data-model](architecture/data-model.md) | `electron/main.ts`、`electron/preload.ts`、`electron/database.ts`、`src/shared/models.ts` |
| 私密仓库、解锁、加密迁移 | [main-process](architecture/main-process.md) | `electron/privateVault.ts`、`src/lib/vaultLock.tsx` |
| 主题、颜色、字号、视觉效果 | [ui-kit](guides/ui-kit.md) | `src/theme/themes.ts`、`src/index.css`、`tailwind.config.js` |
| 构建、打包、版本、发布 | [verify-and-release](guides/verify-and-release.md) | `package.json`、`vite.config.ts`、`src/data/changelog.ts` |
| 中文术语对应哪个代码名 | [glossary](ai/glossary.md) | — |

## 文档清单

### 架构

| 文档 | 职责 |
|---|---|
| [总览](architecture/overview.md) | 产品、技术栈、进程模型、启动链、目录和不变量 |
| [主进程](architecture/main-process.md) | IPC、vault/PDF 扫描、watcher、私密仓库、协议、窗口 |
| [渲染层](architecture/renderer.md) | Provider、App 外壳、工作区、侧栏槽位、工具栏、异步模式 |
| [数据模型](architecture/data-model.md) | SQLite、sidecar、设置、workspace、路径约定、事件 |
| [功能域](architecture/features.md) | 资料库、PDF、白板库、任务、网页资源、设置 |
| [养成](architecture/growth.md) | 能力量表、挑战/赛季/作品（内容记录与卡片墙展示）、预测与自知度 |
| [编辑器](architecture/editor.md) | Markdown 双管线、块会话、容器、嵌入、自动保存 |
| [白板](architecture/canvas.md) | 画布格式、模型、编辑器、资料库分组、冲突 |
| [AI 白板桥接](architecture/ai-canvas.md) | MCP 服务、vault 发现、工具/布局、DSH 安装与写入安全 |

### 指南

| 文档 | 职责 |
|---|---|
| [UI 组件与视觉规范](guides/ui-kit.md) | 语义 token、基础控件、覆盖层、行为、命名约定 |
| [改动配方](guides/recipes.md) | IPC、DB、设置、i18n、快捷键、主题、模块、块类型的步骤 |
| [验证与发布](guides/verify-and-release.md) | 开发、检查、md smoke test、打包、版本、Git |
| [排错](guides/troubleshooting.md) | 原生模块、端口、路径、watcher、私密仓库、白板等常见问题 |

### 参考资料（自动生成）

| 文档 | 来源 |
|---|---|
| [IPC](reference/ipc.md) | `electron/preload.ts`、`electron/main.ts` |
| [设置](reference/settings.md) | `src/shared/settings.ts`、`src/components/settings/*.tsx` |
| [数据库](reference/database.md) | `electron/database.ts` |
| [代码地图](reference/code-map.md) | `src/**`、`electron/**`、`scripts/**` |
| [共享控件与样式清单](reference/ui-inventory.md) | `src/components/*.tsx`、`src/lib/**`、`src/index.css`、`tailwind.config.js` |

### 记忆与历史

| 文档 | 职责 |
|---|---|
| [项目记忆](ai/memory.md) | 快照、已定决策、硬坑、待办、更新协议 |
| [术语表](ai/glossary.md) | 中文 UI 术语 ↔ 代码名 ↔ 文件 |
| [网页资源并入资料库](design/web-resources-as-library.md) | 唯一无路径来源的合理性、备选方案与数据流 |
| [编辑器块重构](design/editor-block-refactor.md) | 历史设计依据（路径可能已变，仅作背景） |

## 写作约定

- 中文叙述；代码、标识符、路径、命令保持原文。
- 只写源码里读不出来的东西：入口、数据流、不变量、坑、验证方式。
- **不写行号**；定位用「文件 + 符号名/注释标题」。行号只允许出现在生成物中（当前也不生成）。
- 手写文档 ≤300 行；超了就拆或删。
- 仓库路径用反引号，链接用相对路径；`npm run docs:check` 会校验路径、链接和脚本名。
- 同一事实只写一处：IPC → `reference/ipc.md`；设置 → `reference/settings.md`；表结构 → `reference/database.md`；其余交叉链接。
- `docs/reference/*.md` 是生成物，顶部有 Banner，不要手改；改源码后跑 `npm run docs`。

## 上下文预算

| 读取项 | 目标 |
|---|---|
| `AGENTS.md` | ≤120 行（常驻） |
| `quickstart` 技能 | ≤120 行（会话起步） |
| 单篇深度文档 | ≤300 行（按需） |
| 生成参考 | 按小节读，不整篇塞进上下文 |

## 维护矩阵

| 变化 | 必须做 |
|---|---|
| 调色、局部布局、单组件行为、普通 bugfix | 只改代码，不动文档 |
| IPC / DB / 设置 / 快捷键 / 主题 / i18n 契约变化 | `npm run docs` + `npm run docs:check` |
| 一整块功能或重构完成 | 更新对应架构/功能文档 + `ai/memory.md` |
| 发布 | 更新 changelog 与版本 + `ai/memory.md` + `npm run release:win` |
| 文件/目录改名 | `docs:check` 会报路径错误，修所有引用 |
| 发现新坑 | 追加 `troubleshooting.md` 与 `memory.md` |
