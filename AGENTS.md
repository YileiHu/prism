# Prism 项目约定

本地优先的个人知识管理桌面应用（Electron 43 + React 19 + TS + Vite + Tailwind + better-sqlite3）：笔记库、PDF 库、白板库、GTD、网页资源集中在单窗口里；笔记是普通 `.md` 文件。

**先读**：`docs/index.md`（任务定位表）、`docs/ai/memory.md`（决策与坑）。改编辑器/白板/数据层前，读对应 `docs/architecture/*` 与 `.dsh/skills/*`。

**改 UI 或通用逻辑前**：先在 `docs/reference/ui-inventory.md` 搜控件/hook/token，再 `grep` 现有用法；复用 > 扩展 > 新建。收尾说明写清复用了什么、新增了什么共享件。

## 命令

```bash
npm run electron:dev     # Vite + Electron 开发（固定 5173）
npm run lint             # tsc --noEmit
npm run docs             # 重新生成 docs/reference/*
npm run docs:check       # 文档/IPC/路径/版本/i18n + 复用/样式校验
npm run canvas:mcp:build # 编译白板格式层到 MCP 服务（改 src/lib/canvas/* 后）
npm run canvas:mcp:test  # 白板 MCP 服务自测（临时库，不碰真实仓库）
npm run verify           # lint + docs:check
npm run rebuild          # 为 Electron 重编译 better-sqlite3
npm run electron:build   # 打包 NSIS 安装程序
npm run release:win      # verify + electron:build
```

## 硬性规则

- **复用优先**：写新控件/函数/样式前，先查 `docs/reference/ui-inventory.md` 与 `docs/guides/ui-kit.md`，并 `grep` 现有用法。复用 > 扩展 > 新建；禁止为单个页面复制已有控件。同一逻辑/样式在第二处出现就提取——逻辑/hook → `src/lib/`，跨模块控件 → `src/components/` 根目录，设置行 → `components/settings/controls.tsx`；模块私有件留在 `src/components/<module>/`，不要跨模块 import。
- **自动验证只跑 `npm run verify`**（= `lint` + `docs:check`）。不要跑 CDP / Playwright / 截图类 UI 自动化，也不要另起隔离的 Electron 实例或开远程调试端口；UI 一律由用户手动验收，改完说明「需要手动验证什么」。
- **回复用中文**；代码、标识符、命令保持原样。
- **不要硬编码颜色**（`gray-*`、`red-*`、`#hex` 等），用 `src/index.css` / `tailwind.config.js` 的语义 token，优先复用已有共用样式类、不新增一次性类；界面文案一律走 `useT()` + `i18n/zh.ts` / `en.ts` 双份对齐。
- **数字输入**：禁止原生 `type="number"`，用 `NumericInput`；设置行/块用 `SettingRow` / `SettingBlock`，不手写布局。
- **不要手写原生操作按钮**：业务组件里的按钮/图标操作一律用 `Button`；`<button>` 只允许出现在基础控件实现（`SegmentedToggle` / `ChipTabs` / `TabStrip` / `DropdownMenu` / `ContextMenu` / `TagInput` / `ColorPicker` 等）、窗口 chrome、编辑器嵌入工具栏和自绘复合控件（行 / chip / checkbox / 色板）。禁止用原生 `<button>` 手写删除、关闭、编辑等图标操作。
- **列表行（`ItemRow`）不允许在行尾放操作**：删除、结算、移除等一律走右键菜单 `menuItems`（`MenuItem[]`，`danger: true` 标危险项）；编辑类操作点整行打开弹窗（`onPrimaryClick`）。`trailing` / `meta` 只放状态、徽章、时间等非交互内容，**不要**放 `Button`、图标按钮或用 `hoverActions` 做悬浮操作。
- **内容 modal 不放删除**：查看 / 编辑 / 详情 / 表单 modal 内不得直接放删除按钮、删除图标或 footer `ghost-danger`；删除入口放在触发它的行 / 卡片的右键菜单 `menuItems` 里（`danger: true`），最终确认走 `ConfirmDialog`。`ConfirmDialog` 自身是确认层，不受此限；modal 内的子项列表（如证据行）也走右键菜单。
- **渐变上下边界只属于整个 Modal 正文区**：`ScrollFade` / `useScrollEdges` 只用于 `Modal` 的正文滚动区（标题/页脚固定在外）；表单头尾固定由 `Modal` 负责，不要再包 `max-h` 内滚；弹窗内部的列表、内嵌框（`surface-inset`）一律用普通滚动条，不要 `scrollbar-none` + 渐隐（媒体查看器 `ImageGallery` 例外：横向滚轮 + 左右渐隐）。
- **控件映射（写 JSX 前先对照，禁止手拼）**：选一个值 / 下拉选择 → `SelectButton`；图标触发的动作或排序菜单 → `DropdownMenu`（只允许已登记文件，新文件会被 `docs:check` 拦下）；右键菜单 → `ContextMenu`；列表行 → `ItemRow`；分段 / 筛选 → `SegmentedToggle` / `ChipTabs`；开关 → `Toggle`；滑杆 → `Slider`；数字 → `NumberInput` / `NumericInput`；文本 → `Input` / `Textarea` / `SearchInput`；标签 → `Badge` / `GlowBadge`；按钮 → `Button`；空态 / 载入 → `EmptyState` / `Skeleton` / `Spinner`。**弹窗先判三档**：确认/单输入/短表单 → `sm/md`；多短字段表单 → `lg`；阅读详情或长文写作 → `Modal layout="document"`（固定头尾、只滚正文、按容器宽度分栏），判据见 `docs/guides/ui-kit.md`「Modal 的三种容器」。表里没有的控件：先 `grep docs/reference/ui-inventory.md`，再 `grep` 现有调用点；仍不确定就停下来问，**不要用共享 Button + 菜单拼一个"看起来像"的控件**。
- **行间不加分割线**：`ItemRow` 靠 hover 的圆角块区分行，不要给行加 `border-b` / `divide-y`；需要分组时用 section 标题或卡片间距，而不是每行一条线。
- **列表多选**：统一走 `useMultiSelect` + `SelectModeButton` + `BatchActionBar`（勾选块 `SelectionCheck`，行/卡传 `selectable` + `checked`），不要就地写 `selectMode` / `selectedPaths`；批量动作写成 `BatchAction[]`，删除入口 `ghost-danger` + `ConfirmDialog`。
- **资料库收藏集唯一归属**：笔记 / PDF / 网页资源在任意时刻最多属于一个收藏集（否则未分组）；文案与批量动作是「移动到收藏集 / 移出收藏集 / 删除」，不要写「加入收藏集」；新增来源必须同时做读取归一化与写入移动语义。
- **新增共享控件 variant/size 必须先请求审核**：包括 Button 的新 variant / size、其他共享控件的新视觉变体/尺寸、新的全局语义 token 或共用样式类。先说明语义、现有型为何不够、预计调用点、视觉规格与深浅色影响，得到确认后再改代码；不要边做边加。日常页面布局与一次性局部样式不在此列。
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
| 找可复用控件/函数/样式 | `docs/reference/ui-inventory.md`、`docs/guides/ui-kit.md` | `ui-settings-i18n` |
| 发布/打包/提交 | `docs/guides/verify-and-release.md` | `release-and-package` |

查契约用生成物：`docs/reference/ipc.md`、`settings.md`、`database.md`、`code-map.md`、`ui-inventory.md`。术语用 `docs/ai/glossary.md`。历史设计见 `docs/design/editor-block-refactor.md`。

## 验证收尾

1. `npm run lint`。
2. 契约变化：`npm run docs` → `npm run docs:check`。
3. 收尾：`npm run verify`（含生成物新鲜度与复用/样式检查）。
4. 说明需要用户手测的路径（深/浅色、空态、键盘、分屏等）；改 UI 时另写「复用了哪些现有件 / 新增哪些共享件」；不自行跑 UI 自动化。

> 本会话若 Windows 沙箱阻止 `npm` 子进程，等价执行 `node node_modules/typescript/bin/tsc --noEmit` 与 `node scripts/ai/check-docs.mjs`。
