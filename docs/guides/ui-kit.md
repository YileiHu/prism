# UI 组件与视觉规范

> 改界面前先查本页；不要在组件里重新发明按钮、设置行、弹窗或颜色。

## 语义 token

- 表面：`base` / `surface` / `elevated` / `hover` / `tint` / `overlay`
- 文字：`primary` / `secondary` / `tertiary` / `muted` / `faint`
- 线：`line` / `strong`
- 状态：`accent` / `danger` / `success` / `warning` / `info`；前景 `on-accent` / `on-danger`
- 字号：`meta` / `caption` / `control` / `body` / `section`
- 圆角：`chip` / `control` / `card`
- 阴影：`popover` / `modal` / `drag` / `toast`
- 层级：`menu-backdrop` / `menu` / `context` / `toast`

规则：

- **禁止**硬编码 `gray-*`、`red-*`、`#hex` 等；主色用 `bg-[var(--accent)]`、`text-[var(--accent-text)]`、`bg-[var(--accent-muted)]`，状态色用语义 token。
- 两套模式共用 token；主题差异在 `src/theme/themes.ts` 的数据里，不在组件里写 `themeId` 特例。
- 颜色数据（标签/资源/GTD）用 `src/lib/colors.ts` 的 `resolveTagColor` / `TAG_COLORS` / `hashColor` / `PALETTE`，选择菜单用 `ColorPicker.tsx`。

## 区域分层

- `.app-header`：标题栏纯色层。
- `.toolbar-band`：工具栏层。
- `.app-main`：主区。
- `.chrome-bg`：侧边栏唯一渐变层（深色顶部淡、向下渐浓；浅色顶部浓、向下渐淡）。令牌：`--header-bg` / `--chrome-bg` / `--chrome-flat` / `--sidebar-base` / `--sidebar-bg-top` / `--sidebar-bg` / `--sidebar-item-hover` / `--sidebar-item-active`。
- `body` 的 `--aurora` 是全局底色，外壳自身透明。
- 共用效果类：`.chrome-pill-active`、`.active-bar` / `.active-bar-neutral`、`.surface-inset` / `.surface-raised` / `.surface-raised-accent` / `.surface-raised-fill`、`.field-inset`、`.accent-ring`、`.accent-focus`、`.tab-fade-left/right`。
- 全局 `input[type="range"]` 已统一，传 `--slider-progress` 即可。

## 基础控件（`src/components/`）

| 需要 | 用 |
|---|---|
| 按钮 | `Button`：`primary` / `secondary` / `danger` / `danger-subtle` / `ghost` / `ghost-danger` / `info`；尺寸 `xs` / `sm` / `md` / `icon-sm` / `icon-xs` |
| 输入 | `Input`（导出 `CONTROL_CLASSES`）、`Textarea`、`SearchInput`、`TagInput` |
| 选择 | `SelectButton`、`SegmentedToggle`（编辑/阅读、标题/正文等分段切换） |
| 标签 | `Badge`（`palette={resolveTagColor(...)}`） |
| 列表行 | `ItemRow`、`NavItem`、`SortableList` |
| 空/载入 | `EmptyState`、`Skeleton` / `SkeletonRows`、`Spinner` |
| 结构 | `Sidebar`、`CollapsibleSidebar`、`SectionCard`、`BatchActionBar`、`ContentSearchView` |

## 设置控件（`src/components/settings/controls.tsx`）

- 行布局：`SettingRow`（左标签/描述，右控件）。
- 块布局：`SettingBlock`（标签/描述在上，控件在下）。
- 控件：`Toggle`（支持 `disabled`）、`Select`、`TextField`、`NumberInput`、`Slider`。
- 分区标题：`SectionHeader`。
- 设置页不要手写行布局；新增设置先看 [recipes](recipes.md) 的「新增设置项」。

## 覆盖层

| 需要 | 用 |
|---|---|
| 通用弹窗 | `Modal`（`icon` 收 `LucideIcon`，尺寸/配色统一） |
| 单输入弹窗脚手架 | `PromptModal`；`RenameModal` / `CreateCollectionModal` / `CreateGroupModal` / `CreateNoteModal` 都基于它 |
| 确认 | `ConfirmDialog` |
| 下拉菜单 | `DropdownMenu` / `DropdownMenuItem` / `DropdownMenuDivider` |
| 右键菜单 | `ContextMenu` + `useContextMenu()`（`MenuItem[]`） |
| 颜色选择 | `ColorSwatchPicker` / `buildColorMenuItem` |

浮层需要时 `createPortal` 到 `document.body`；不要自己算 fixed 坐标。

## 布局与外壳

- `AppSidebarSlotProvider` 提供 header 下方的全高侧栏槽位 + 右列；模块用 `ModuleSidebar` portal 进去，`active` 控制显隐且保持挂载。
- 模块内不要直接平铺侧栏；不要用条件渲染替换槽位内容。
- 工具栏用 `useToolbarContribution(scopeKey, contribution)`；`contribution` 用 `useMemo` 保持对象 identity。
- 工作区标签/分屏见 [renderer](../architecture/renderer.md)。

## 行为约定

- **设置**：先在 `src/shared/settings.ts` 注册，再 `useSettings().values/set/reset`；UI 放 `components/settings/<Section>.tsx`。
- **Toast**：`useToast()(msg, "error" | { type?, action?, duration? })`；写操作失败必须提示；可撤销操作用 `action`（约 5 秒）。
- **快捷键**：在 `src/shared/shortcuts.ts` 注册动作，`useGlobalShortcuts` 分发；同时在 `ShortcutsSection.tsx` 加一行。
- **拖拽**：一律 dnd-kit；纵向排序 `SortableList`；跨区 `DndContext` + `SortableContext`；点击与拖拽共存加 `useDragClickGuard`。
- **异步列表**：首载 `Skeleton`；空态 `EmptyState`；刷新保留旧数据。
- **i18n**：`useT()` + `i18n/zh.ts` / `en.ts` 双份；参数用 `.replace("{count}", …)`；禁止硬编码界面文字。
- **主题**：`useTheme()` 读 `themeId/mode/resolvedMode/setTheme/setMode`；新增主题只加 `theme/themes.ts` 数据。

## 命名约定

- 视觉枚举 prop 用 `variant`；数据驱动配色用 `palette`；单个开关保持 boolean。
- 选中态：`active` = 导航/当前项；`selected` = 列表行多选；`checked` = 复选框/勾选；`parentActive` = 选中子项的父级（只强调文字，不叠选中块）。
- 组件内局部 props 用 `interface Props`；需要导出或多类型并存时用 `XProps`。
- 路径参数：`vaultPath` 库根、`repoPath` PDF 库根、`notePath(s)` 笔记绝对路径、`filePath(s)` 通用文件、`relPath` 库内相对路径。

## 编辑器/白板相关

编辑器的块容器、嵌入卡片、Markdown 渲染有独立约定，见 [编辑器](../architecture/editor.md)；白板节点/边/容器见 [白板](../architecture/canvas.md)。不要在本页重复它们的内部结构。

## 验证

`npm run verify` 只能保证类型；视觉与交互由用户手动验收。改 UI 时在说明里列出需要手测的路径（深色/浅色、窄窗口、空态/加载态、键盘操作）。
