# UI 组件与视觉规范

> 改界面前先查本页与 `docs/reference/ui-inventory.md`（共享控件/hook/token 机械清单）；不要在组件里重新发明按钮、设置行、弹窗或颜色。

## 复用与提取

- 决策阶梯：**直接用 → 给现有件加 prop/variant → 在共享层新建**。禁止为单个页面复制一份近似控件。
- 第二处出现就提取：逻辑/hook → `src/lib/`；跨模块视觉件 → `src/components/` 根目录；设置行/块 → `components/settings/controls.tsx`。模块内专用件放 `src/components/<module>/`，不要跨模块 import。
- 先搜再写：`grep` 现有调用点 + `docs/reference/ui-inventory.md`；样式先找语义 token 与「共用样式类」，不要为一次性效果往 `src/index.css` 加类。
- 新增/调整共享件：在本页补一行（`docs:check` 会检查根目录控件都被收录），跑 `npm run docs` 更新清单，再 `npm run verify`。

## 语义 token

- 表面：`base` / `surface` / `elevated` / `hover` / `tint` / `overlay`
- 文字：`primary` / `secondary` / `tertiary` / `muted` / `faint`
- 线：`line` / `strong`
- 状态：`accent` / `danger` / `success` / `warning` / `info`；前景 `on-accent` / `on-danger`
- 装饰（主题 fx）：`--fx-image` / `--fx-size` / `--fx-repeat`（页面图案与柔光图层）、`--fx-highlight` / `--fx-highlight-size` / `--fx-highlight-opacity`（ChipTabs 选中光晕的纹理来源）、`--chip-glow-image` / `--chip-glow-size` / `--chip-glow-opacity` / `--chip-glow-blur`（光晕合成结果）、`--chrome-tint`（大面 tint，默认主色，`chrome: "neutral"` 时为 muted 灰）、`--fx-glow` / `--fx-blur`；默认 `none` / `0`，只有共享层消费
- 字号：`meta` / `caption` / `control` / `body` / `section`
- 圆角：`chip` / `control` / `card`
- 阴影：`popover` / `modal` / `drag` / `toast`
- 层级：`menu-backdrop` / `menu` / `context` / `toast`

规则：

- **禁止**硬编码 `gray-*`、`red-*`、`#hex` 等；主色用 `bg-[var(--accent)]`、`text-[var(--accent-text)]`、`bg-[var(--accent-muted)]`，状态色用语义 token。副色 `--accent-2` 只做装饰（没定义时等于主色），不参与选中/激活/焦点语义。
- 两套模式共用 token；主题差异在 `src/shared/themes.ts` 的数据里，**不在组件里写 `themeId` 特例**（需要"某主题特殊"时先改数据/共享层，不写分支）。单模式主题（仅深色 / 仅浅色）由 `resolveAppearance` 锁定模式，组件只读 `resolvedMode`。
- 颜色数据（标签/资源/任务徽标）用 `src/lib/colors.ts` 的 `resolveTagColor` / `TAG_COLORS` / `hashColor` / `PALETTE`，选择菜单用 `ColorPicker.tsx`。

## 区域分层

- `.app-header`：标题栏层；`--header-bg` 用 `--c-chrome-surface` 混 `--c-chrome-tint`（深色 94/6），浅色直接用 `--c-chrome-surface`；tab 栏继承同一套 chrome palette。
- `.toolbar-band`：工具栏层。
- `.app-main`：主区。
- `.chrome-bg`：侧边栏唯一渐变层（深色顶部淡、向下渐浓；浅色顶部浓、向下渐淡）。令牌：`--header-bg` / `--chrome-bg` / `--chrome-flat` / `--sidebar-base` / `--sidebar-bg-top` / `--sidebar-bg` / `--sidebar-item-hover` / `--sidebar-item-active`；底色/文字来自 `--c-chrome-*`，主区仍用中性 `--c-*`。
- `body` 用 `--c-base` 纯色作全局底色（旧的 `--aurora` 渐变已移除），外壳自身透明。
- **装饰层**：主题可以带 `fx`（图案 / 顶缘高光 / 副色光晕 / 浮动面板模糊 / 侧栏喷泉），由 `ThemeProvider` 写成 `--fx-*` 并加 `data-fx` / `data-fx-blur`；消费点固定在 `body`、`.app-main`、`.app-header`、`.toolbar-band`、`.chrome-bg`、`.accent-ring`、`.panel-floating`、`.fx-fountain`（`NavItem`）。`data-fx` 未设置时不会挂 `background-attachment: fixed`，`data-fx-blur` 未设置时不会开 `backdrop-filter`；`sidebarRows: "flat"` 通过 `data-flat-rows` 去掉 `NavItem` 的灰色 hover/选中底。
- 共用效果类：`.theme-hover`（主题 hover 纹理：Button / SelectButton 触发器 / 未激活顶栏 tab / 菜单项；SegmentedToggle 与 ChipTabs 保留自己的滑轨/光晕）、`.tab-close`（tab 关闭：所有主题都无背景/边框/纹理，只保留 X，hover 变亮）、`.theme-hover-accent`（已选中项 hover：用主题强调色纹理/描边，保留自己的选中底；覆盖激活 tab、`Button active`、`DropdownMenuItem active`，GENESIS 为金色方格）、`.theme-active`（统一选中态：`accent-muted` 底 + `accent-text` + 1px `accent-border` inset；ChipTabs / SegmentedToggle / NavItem 用更高优先级覆盖为自己的选中语言）、`.theme-hover-danger`（danger 专用 hover：红色边框/点阵；只有 GENESIS 叠红色点阵，普通主题保留普通 danger hover）、`.active-bar` / `.active-bar-neutral` / `.selection-bar`、`.surface-inset` / `.surface-raised` / `.surface-raised-accent` / `.surface-raised-fill`、`.field-inset`、`.accent-ring`、`.accent-focus`、`.tab-fade-left/right`。
- 层级：`.field-inset` 用 `--field-*`，平面款：常态 1px 边 + `--field-bg`，不再加内/外阴影；`--inset-*` 只留给轨道/分组这类真正的凹槽，不要把两者混用。
- 浅色卡片：`surface` 由主题 accent 9% 混白、`elevated` 5.2%，`base`/`hover` 另混 5.5–6%；字段与菜单用 `elevated`，比卡片更浅一档。改这张"纸"的色调只动 `PAPER_ACCENT_RATIO` 以及对应的 base/hover 混色比例。
- 聚焦：`--field-focus-border`。平面款聚焦时用 1px 边框 + 1px 内侧同色线（视觉 2px），不再加 ring（不溢出，避免被 modal/滚动容器裁切），不改 `border-width`，所以文字不会位移。深色用 100% accent，浅色用 60% accent 混中性描边，避免浅底上出现荧光边。GENESIS 通过 `fx.focus` 使用 2px 视觉青色边框 + active 按钮同款的 3px/1px 青色方阵纹理（8%，`data-focus-fx`），不画四角、不叠金色内环；其他主题保持原 focus。
- 错误态：`.field-inset[aria-invalid="true"]` 把边框换成视觉 2px danger；控件传 `invalid` 时设置 `aria-invalid`，不要另加红框类。
- 全局 `input[type="range"]` 已统一，传 `--slider-progress` 即可。手柄是扁平款：18px 圆形 = 12px accent 芯 + 3px `surface` 厚边，无投影；hover/聚焦只用 3px 同色光晕，不放大。

## 基础控件（`src/components/`）

| 需要 | 用 |
|---|---|
| 按钮 | `Button`（5 型见下）；尺寸 `xs` / `sm` / `icon-xs` / `icon-sm` |
| 输入 | `Input`（导出 `CONTROL_CLASSES`）、`Textarea`、`SearchInput`、`TagInput`（输入 + 建议下拉 + **固定高度的已选槽**：空槽是虚线占位、有标签是实线托盘，点槽聚焦输入）、`NumericInput`（数字：普通文本框 + 字符过滤 + `suffix` / `invalid`，**禁止** `type="number"` 的原生上下按钮）、`NumberInput`（`number \| null` + 失焦解析、`min`/`max` clamp、`allowEmpty`；表单和弹窗用这个） |
| 选择 | `SelectButton`（长列表用 `groups` 按领域分段、`emptyLabel` 提供「不关联」项；菜单按视口剩余高度自动限高滚动（`DropdownMenu` 统一处理，长选项换行不截断）、组标题吸顶；`variant="pill"` 是工具栏用的胶囊款：高 28px、`rounded-pill`（跟随主题，GENESIS 变直角）、12px 字号、加长宽度，其余交互一致）、`SegmentedToggle`（编辑/阅读、标题/正文等分段切换；透明托盘 + 贯穿整条的扁平滑轨光晕（12px 高、55%，复用 `--chip-glow-*`，按钮层在光晕之上）；选中项无胶囊/底色，只做字体强调：`accent-text` + `font-weight: 600` + 轻微 `letter-spacing`；选项等宽（`inline-grid` + `auto-cols-fr`）、2px 内边距、控件高 31px（27px 选项 + 4px 内边距）；未选中透明/灰字，option 一律 `leading-none`，避免 `text-caption` 的 1.4 行高把文字挤偏）、`ChipTabs`（**无底轨道 + 选中光晕**：轨道没有背景也没有边线；选中项背后是一片跟着主题色走的平滑光晕（`item.glow` 可覆盖，如成长领域用领域色），不是实心块；hover 时每个 chip 有同色光晕、按下更亮；chip 22px、`leading-none`；用于页内筛选/切换：可选「全部」、右侧元信息与主题色、横向滚动、尾部动作。溢出处理：`collapse` 按轨道宽度**自动**决定放几个（离屏测量每个 chip 的自然宽度），多余的进「更多」菜单，可见 chip 均分槽宽所以不会留空；chip 内一律 `whitespace-nowrap`，窄时标签先截断，不会把槽撑高。） |
| 日期 | `DateField`（受控的 `YYYY-MM-DD` 字符串，内嵌日历 + 今天/明天/一周后/清除预设）、`DateCalendar`（月历本体，任务与养成共用） |
| 标签 | `Badge`（variant / palette，见下）、`GlowBadge`（accent/warning 光晕，见下） |
| 列表行 | `ItemRow`（只有一种密度：`px-2 py-1.5` + `rounded-control`，hover 底色是圆角块；原先的 `list`/`dense` 两档已合并）、`NavItem`、`SortableList` |
| 多选 | `useMultiSelect`（`src/lib/`，选择态/hook）、`SelectModeButton`（工具栏开关）、`SelectionCheck`（行/卡勾选块，纯展示）、`BatchActionBar`（通用批量条，见「多选」） |
| 空/载入 | `EmptyState`、`Skeleton` / `SkeletonRows`、`Spinner` |
| 结构 | `Sidebar`、`CollapsibleSidebar`、`SidebarSection`（可折叠分节标题，配 `.sidebar-group` 凹槽框 + `useSidebarSection` 记忆开合）、`ScrollFade`（滚动区边缘渐隐，配 `useScrollEdges` / `useHorizontalScrollEdges`）、`SectionCard`、`ImageGallery`（水平图片条：滚轮横向滑动、左右渐隐、隐藏滚动条；单张铺满，多张滑动）、`BatchActionBar`、`ContentSearchView` |
| 资料库/复合 | `CollectionDetail`、`DragPreview`、`ImagePickActions`（选图 / 移除的实底图标按钮，调用方叠在图片右上角；选图为 `ImagePlus`、移除为 `Trash2`，文案只作为 `title` / `aria-label`；不要用透明 ring 款，照片上会看不清） |

- **选值一律 `SelectButton`**：不要用 `Button` + `DropdownMenu` 手拼下拉；`DropdownMenu` 只做自定义动作 / 排序菜单，允许使用它的文件登记在 `scripts/ai/lib/reuse.mjs`，新文件会被 `docs:check` 拦下。
- **`SectionCard` 的 `tintColor`**：只染 header（`PaletteColor.tint` 本来就是 header wash）；`accent` 是单卡激活强调（边框 / 标题 / header）。列表卡要按内容分类时用 `tintColor`，不要给 `SectionCard` 再加整卡 tone。
- `DropdownMenu` / `SelectButton` 的菜单由 `DropdownMenu` 按视口剩余高度自动封顶并滚动（与 `ContextMenu` 同一套「放得下→翻转→两侧都不够→取空间大的一侧滚动」逻辑）；长选项用 `min-w-0 break-words` 换行，调用点不要手写 `max-h-*` / `truncate`。`matchWidth` 时菜单宽度跟随触发器；菜单项由 `DropdownMenuItem` 统一行高。

### Modal 的三种容器

写弹窗前先判档，不要先写 JSX：

| 档位 | 判定 | 容器 | 例子 |
|---|---|---|---|
| **快速** | 确认、单输入、≤4 个短字段 | `sm` 400 / `md` 520（未传 420） | 任务、预估、补实际、结算、赛季结束、证据、Prompt / Rename / Confirm |
| **结构化** | 多字段但以短输入为主，填完即走 | `lg` 600（必要时 `width="680px"`） | 能力编辑、赛季编辑、校准、他评、说明书、资源新增/编辑 |
| **文档** | 阅读正文或长文写作，有 1 个以上多行字段 | `layout="document"` | 版本公告、能力 / 挑战 / 作品详情、挑战 / 作品 / 年度编辑 |

文档型规则：

- 宽度 `calc(100vw - 128px)`、高度 `calc(100vh - 128px)`，四边 64px；`width` 仍可覆盖默认宽度。
- 标题栏与页脚固定，只有正文滚动；页面**不要**再写 `max-h-[62vh]` / 自己的滚动容器。
- 内容外层通常 `mx-auto w-full max-w-[1400px]`；卡片型详情（能力详情）直接铺满，左右与底部同为 16px 内边距；阅读/写作正文列 `max-w-[800px]`；版本公告 `max-w-[960px]`。
- 单栏/双栏用 `useElementSize`（返回 callback ref，正文后挂载也能测量）量**正文容器**，不看 viewport；阈值参考：能力 / 挑战 900、作品 880、年度 820。
- 写作型设 `closeOnBackdrop={false}`（Esc 仍可关），本轮不做脏检查。
- 面板变大不等于文本变宽：不要拉伸长文本，不要把短表单塞进文档型。
- 已退役：`GrowthModalScroll` 的 `max-h-[62vh]` 模式不再用于新代码。

### 弹窗里的滚动

- `layout="dialog"` / `layout="document"` 都固定标题与页脚，只滚**正文区**；区别是 `dialog` 高度随内容（最大 `100vh - 48px`），`document` 铺满窗口。
- 正文滚动区由 `Modal` 提供：`scrollbar-none` + `useScrollEdges` + `ScrollFade`（上下渐隐）；调用方不要再包一层 `max-h` / `overflow-y-auto`。
- **表单弹窗（`lg`）也用这个正文区**；标题/页脚固定由 `Modal` 负责，不要为了固定页脚自己造内滚。
- **弹窗内部的单个列表 / 内嵌框一律用普通滚动条**（默认 6px）：不要 `scrollbar-none`、不要 `ScrollFade` / `useScrollEdges`。渐变上下边界只属于整个 Modal 正文区，内部组件不享受这套。例外：`ImageGallery` 这类媒体查看器用左右渐隐 + 滚轮横向滑动。
- `useScrollEdges` / `useHorizontalScrollEdges` + `ScrollFade` 只挂在 `Modal` 的正文区或 `ImageGallery` 上；其他内部滚动区不要再嵌套渐隐。
- 菜单类下拉（`DropdownMenu` / `SelectButton` 的列表）保留默认细滚动条。

### 列表行（`ItemRow`）的行为约定

- **行尾不放操作**：删除、移除、结算这类动作一律进右键菜单 `menuItems`（危险项加 `danger: true`）。行尾的 `Button`、图标按钮、`hoverActions` 悬浮操作都不允许。
- **编辑走整行**：编辑类动作（打开详情/弹窗/结算表单）用 `onPrimaryClick`，点行即触发，不必先进右键菜单。
- **行内勾选放 `leading`**：完成/重开这类就地状态切换用 `leading` 里的勾选控件（如养成任务行），`onClick` 必须 `stopPropagation()`，否则会同时触发整行编辑；行仍保留 `onPrimaryClick`。
- **行间不加分割线**：不要给行加 `border-b` / `divide-y`，行与行靠 hover 的圆角块区分；需要分组时用 section 标题或卡片间距。**分节之间**可以有一条规则线（如养成任务卡「已完成」上方），但同一列表的行之间不出现。
- **hover 高亮代表「可操作」**：能点开的行、以及只有右键菜单的行（如已结算的预测记录）都要有 hover 底色；完全没有操作的行（快照、成果明细）不高亮，避免暗示不存在的交互。
- `trailing` / `meta` 只放状态徽章、时间、数值等**非交互**内容。
- **多选态**：传 `selectable` + `checked`（勾选块由 `ItemRow` 渲染，行仍负责点击），`selected` 决定底色；`onPrimaryClick` 收到 click/keydown 事件，用 `event.shiftKey` 做范围选择。连续选中的行再传 `selectionEdge`（见「多选」），否则单行按 8px 圆角处理。需要 dnd ref 时用 `rowRef`，不要给行套 `forwardRef`。

### 多选（列表容器）

列表多选是一套共享件，不要在页面里重写 `selectMode` / `selectedPaths`：

- 状态：`useMultiSelect({ scopeKey, keys, containerRef })` → `active / selected / count / enter / exit / toggle / selectAll / clear / isSelected`。
- 列表滚动容器要可聚焦（`tabIndex={-1}` + `focus:outline-none`）并把 ref 传给 `containerRef`：`enter()` 把焦点移进去，`Ctrl/Cmd+A` 也只绑在这个容器上。
- 入口：工具栏 `SelectModeButton`；退出：同一按钮、`Esc`、批量条「取消」。
- 手势：选择模式下单击行/卡 = 切换；`Shift` + 单击 = 按 `keys` 顺序**追加**区间；`Ctrl/Cmd+A` = 全选当前可见项（只绑在列表滚动容器上，输入框/弹窗/编辑器内不劫持）。
- 作用域：`scopeKey` 变化（换库、换收藏集、搜索词/范围、标签）自动退出并清空；`keys` 收缩时自动剪掉已删除项，计数永远不超过可见项。
- 批量条：`BatchActionBar` 只负责布局与计数，动作由各模块以 `BatchAction[]` 提供（`menu` 渲染为 `Button` + `DropdownMenu`，删除入口用 `ghost-danger`，最终确认走 `ConfirmDialog`）。
- `SelectionCheck` 是纯展示 `span`（`aria-hidden` + `pointer-events-none`）：整行/整卡承担点击，避免卡片里出现嵌套按钮。视觉**平面**：选中 = `bg-accent` + 1px `border-accent`，未选 = 透明底 + `border-strong/60`；不要加 `surface-raised-fill` / `surface-inset`（浮雕感会和行底色打架）。
- **连续选中是一整块**：列表按显示顺序用 `selectionEdgeAt(keys, index, selected)` 算出 run 边（`only` / `first` / `middle` / `last`），只有首尾行保留 8px 外圆角，中间行 `rounded-none`；左侧指示用 `.selection-bar`（`inset 3px 0 0 var(--accent)`，随行高连续），不要用逐行的 `.active-bar`（60% 高的胶囊，堆叠时会出现断条）。虚拟化列表用完整 `keys` 计算，不要用渲染窗口，否则滚动时圆角会跳。
- 被外部删掉的条目（`missing`）可以选中，但删除类动作跳过它们并单独计数。

### 数字输入的三层

1. `Input`：只有样式（`CONTROL_CLASSES`），不碰值。
2. `NumericInput`：值固定是 `string`，过滤非法字符、给 `inputMode`；加 `suffix` 显示单位，`invalid` 显示错误态。输入中间态（`-`、`3.`、空）都能表示，解析留给调用方。
3. `NumberInput`：`number | null`，失焦时解析、按 `min`/`max` clamp、`allowEmpty` 控制能否清空。表单和弹窗优先用它，不要各自写 `Math.min(max, Math.max(min, …))`。

### Button 的 5 个型

按「强调层级 × 是否破坏」选，不要按颜色直觉选。

| 型 | 角色 | 用在哪 | 不要用在哪 |
|---|---|---|---|
| `primary` | 主操作 | 弹窗确认/保存、空态 CTA、表单唯一提交、解锁/创建 | 取消/关闭、工具栏普通图标、同一区域多个并列 |

> 主按钮和危险按钮是平面版：`primary` 用 `accent-muted` 底 + `accent-border` 边，`danger` 用实心 `danger` 底；两者都不加 `surface-raised*` 阴影/高光，也不叠 `.theme-hover` 纹理。主按钮文字仍用 `--primary-button-text`；GENESIS 静止时是主题金色，hover/press 通过 `primaryButtonHoverText` 变青色。
| `secondary` | 次操作（描边） | 弹窗「取消/返回」、表单备用路径、设置页「选择/更改」 | 图标工具栏、纯链接、同一弹窗第二个主操作 |
| `ghost` | 工具操作 | 工具栏图标、切换/筛选（`active`）、面板头关闭、内联链接式动作 | 弹窗底部取消、最终危险确认 |
| `danger` | 危险确认 | 最终确认：`ConfirmDialog` 或自定义确认弹窗 | 入口按钮、行内删除、批量条触发 |
| `ghost-danger` | 危险入口 | 行/卡/批量条的删除入口（不在内容 modal 内），后面必须接确认 | 最终确认、非破坏性「清除」 |

选型顺序：破坏性？→ 最终确认 `danger`，否则 `ghost-danger`；非破坏 → 主操作 `primary`（每个可见区域最多 1 个）→ 弹窗/表单/设置里的次操作 `secondary` → 其余 `ghost`。


### 尺寸与形状

| size | 尺寸 | 形状 | 用在哪 | 不要用在哪 |
|---|---|---|---|---|
| `xs` | 文字 caption | `rounded-control` | 设置行、面板里的短操作 | 弹窗主操作 |
| `sm` | 文字 body | `rounded-control` | 弹窗主/次操作、表单提交、空态 CTA | 图标操作 |
| `icon-xs` | 24×24 | `rounded-pill`（默认圆形，主题可改方角） | 28–32px 标题栏、标签页、日历翻月 | 列表行删除/重置 |
| `icon-sm` | 32×32 | `rounded-control` | 工具栏、列表行删除/重置 | 28px 胶囊标签内（会溢出） |

> `rounded-chip` / `rounded-control` / `rounded-card` / `rounded-pill` / `rounded-segment` 都是主题 token
> （`--radius-*`）：默认 4/8/12/9999/5，主题可通过 `radius` 覆盖；GENESIS 全设为 0。

### 允许的组合

| variant | 文字 `xs` / `sm` | `icon-xs` | `icon-sm` |
|---|---|---|---|
| `primary` | ✓ | — | — |
| `secondary` | ✓ | — | — |
| `ghost` | ✓ | ✓ | ✓ |
| `danger` | ✓ | — | — |
| `ghost-danger` | ✓ | — | ✓ |

- 状态：default / hover / disabled 由 variant 定义；`active` 只用于 `ghost`（工具栏切换/持久选中），`danger` / `ghost-danger` 是动作，不能持续选中。GENESIS 的 `fx.hover` 通过共享 `.theme-hover` 层给普通按钮、未激活顶栏 tab、菜单项铺青色方格 + 1.5px 压暗青色边；已激活项走 `.theme-hover-accent`，用 `selectedHover` 的金色方格；danger 只保留红色 hover 反馈。没有 `fx.hover` 的普通主题不出现纹理或 hover 边框，只保留原有填充。
- loading 不单独做 variant：主/危险操作里放 `Spinner`，不要让按钮在异步中静默。
- 业务组件不要手写 `<button>` 做图标/文字操作，用 `Button`；原生 `<button>` 只允许基础控件实现、窗口 chrome、编辑器嵌入工具栏和自绘复合控件（行 / chip / checkbox / 色板）。
- `secondary` 不做纯图标；纯图标用 `ghost`，危险图标用 `ghost-danger`。
- `primary` 要有文字标签；一个可见区域最多一个。
- 图标按钮带 `aria-label` + `title`。
- 破坏性操作必须走确认：`ghost-danger` 触发 → `danger` 确认；不要把 `danger` 直接当入口。内容 modal 内不放删除入口（见「弹窗」一节）。
- 新 variant / 新 size 至少 5 个产品调用点 + 独立语义，且必须**先提出请求并得到确认**。请求包含：语义、现有型为何不够、预计调用点、视觉规格、深浅色/密度/可访问性影响；未确认前不要改 `Button` 类型或本页表格，也不要边做边加。

### Badge 的边界

`Badge` 是只读、单行、内联的元信息标签，不是按钮、筛选器或可编辑标签。

| variant | 语义 | 例子 |
|---|---|---|
| `neutral` | 类型 / 元数据 | 证据类型、任务关联能力 |
| `outline` | 中性描边标签（极淡 tint 底） | 半衰期、可迁移性、作品类型 |

- `palette` 只表达身份色（集合 / 标签 / 预测类型），必须来自 `colors.ts`；**不要和 `variant` 同时传**。
- 字号与高度：所有 `Badge` 固定 `h-5`（20px）/ `text-meta`，不再提供任何尺寸 prop；领域标签也不单独放大。
- `outline` 不是纯透明：固定 `border border-strong/40` + 极淡 `bg-tint/[0.05]`，所以在任何父背景上都有可辨识的浅底；`neutral` 则是更实的 `bg-hover/50`。
- 符号属于内容和文案：需要 `◆` / `▲` 时直接写进 children，不要为它加专用结构。
- 交互：`Badge` 只读，不接受点击；需要点击筛选/跳转时用 `ChipTabs` 或专用 Chip/Button，不要给 Badge 加 `onClick`。
- 可删除的已选标签由 `TagInput` 复合实现，不复制这套结构。
- `danger` / `accent` / `warning` 不再作为 Badge variant：`danger` 已删除；`accent` / `warning` 由 `GlowBadge` 承担。
- `ConfidenceBadge` 是 C0–C5 计量条，内部复用 `GlowBadge`；它仍是领域组件，不当作通用标签推广。

### GlowBadge

`GlowBadge` 是**单条强调/警示**的发光徽章，不表达身份色。

| tone | 用在哪 | 例子 |
|---|---|---|
| `accent` | 需要被看见的高亮 | 更新日志版本号 |
| `warning` | 需要关注，但没坏 | 笔记「未分类」、能力「stale」 |

- `intensity`：0–1，控制背景透明度/光晕强度；默认 0.35。
- `muted`：无光晕、虚线、透明底、50% 透明度；用于 C0「还没有证据」。
- 尺寸与 `Badge` 一致：固定 `h-5`（20px）/ `text-meta`，没有 size prop。
- 同一区域不要堆多个 glow；它只适合单条重点信息。
- 不接 `palette`；需要身份色用 `Badge palette`。

## 设置控件（`src/components/settings/controls.tsx`）

- 行布局：`SettingRow`（左标签/描述，右控件）。
- 块布局：`SettingBlock`（标签/描述在上，控件在下）。
- 控件：`Toggle`（支持 `disabled`）、`Select`、`TextField`、`Slider`；数值字段用共用的 `NumberInput`（`src/components/NumberInput.tsx`），不要在设置里另写 clamp。
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

- `Modal` 默认**垂直居中**；`position="top"` 只作为显式特例保留，新增弹窗不要依赖默认值碰运气。
- `Modal` 支持 `headerActions`：只放**非破坏性图标动作**（如打开链接、编辑），显示在标题右侧、关闭按钮之前；标题单行截断。内容区不要重复这些动作，也不要把删除放进 `headerActions`（内容 modal 不放删除，删除走触发行的右键菜单）。
- `layout="document"` 是详情/长文容器：铺满窗口、固定头尾、只滚正文；判档见上文「Modal 的三种容器」，不要在文档型里再包 `max-h` 滚动。
- **内容 modal 不放删除入口**：查看 / 编辑 / 详情 / 表单弹窗内不得直接放删除按钮、删除图标或 footer `ghost-danger`；删除入口放在打开它的行 / 卡片的右键 `menuItems`（`danger: true`），最终确认走 `ConfirmDialog`。`ConfirmDialog` 自身是确认层，不受此限；modal 内的子项列表（如证据行）同样用右键菜单。
- `Modal` 共用 `src/lib/modalStack.ts` 的对话框栈：**Esc 只关最上层**，下层自动 `inert` / `aria-hidden`，z-index 按栈深递增（仍低于菜单 `z-menu` 与 `toast`）。新增弹窗直接用 `Modal` 即可，不要再手写 document 级 Esc 或层级判断。
- 叠层时保留下层遮罩，上层遮罩照常 `anim-overlay` 淡入、`anim-exit` 淡出：背景会从一层约 60% 平滑压到两层约 84%（三层更暗），用更暗的背景换过渡，不会出现“先亮一下再压暗”。
- 菜单/右键菜单/下拉属于轻层，不进入 Modal 栈；它们继续用 capture 阶段处理 Esc，以便先于底层 Modal 关闭。

浮层需要时 `createPortal` 到 `document.body`；不要自己算 fixed 坐标。

## 外壳专用（App 直接使用）

| 需要 | 用 |
|---|---|
| 文档标签条 / 窗口按钮 | `TabStrip`（`TabStripItem` 为单个标签） |
| 主题/深浅色快捷菜单 | `ThemeQuickMenu`（2 列紧凑列表，按色系相似度排序，特殊主题前加分隔线；设置页为 3 列紧凑卡） |
| 更新日志模块 | `ChangelogView`（侧栏大版本卡 + 右侧 patch 版本页） |
| 启动画面 | `SplashScreen` |
| 渲染错误兜底 | `ErrorBoundary` |

这些是外壳组成部分，新功能页不要直接复用；模块页从 [文档入口](../index.md) 的对应架构文档开始。

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
- **资料库收藏集**：笔记 / PDF / 网页资源都只能属于一个收藏集（否则未分组）；文案与批量动作统一为「移动到收藏集 / 移出收藏集 / 删除」，不要出现「加入收藏集」。新增来源必须同时做读取归一化与写入移动语义。
- **异步列表**：首载 `Skeleton`；空态 `EmptyState`；刷新保留旧数据。
- **i18n**：`useT()` + `i18n/zh.ts` / `en.ts` 双份；参数用 `.replace("{count}", …)`；禁止硬编码界面文字。
- **主题**：`useTheme()` 读 `themeId/mode/resolvedMode/pinned/setTheme/setMode`；新增主题只在 `src/shared/themes.ts` 用 `theme()` 加数据（单模式、种子推导、覆盖、`fx` 装饰层见 [design/theme-authoring](../design/theme-authoring.md)）。

## 命名约定

- 视觉枚举 prop 用 `variant`；数据驱动配色用 `palette`；单个开关保持 boolean。
- 选中态：`active` = 导航/当前项；`selected` = 列表行多选；`checked` = 复选框/勾选；`parentActive` = 选中子项的父级（只强调文字，不叠选中块）。
- 组件内局部 props 用 `interface Props`；需要导出或多类型并存时用 `XProps`。
- 路径参数：`vaultPath` 库根、`repoPath` PDF 库根、`notePath(s)` 笔记绝对路径、`filePath(s)` 通用文件、`relPath` 库内相对路径。

## 编辑器/白板相关

编辑器的块容器、嵌入卡片、Markdown 渲染有独立约定，见 [编辑器](../architecture/editor.md)；白板节点/边/容器见 [白板](../architecture/canvas.md)。不要在本页重复它们的内部结构。

## 控件预览页

`showcase.html` + `src/dev/ControlShowcase.tsx` 是常驻的开发预览页，不参与打包：

- 运行 `npm run electron:dev` 后，用浏览器打开 `http://localhost:5173/showcase.html`。
- 按组件列出 Button / Badge / GlowBadge / 输入 / 选择 / 日期 / 行 / 设置控件 / 覆盖层，标出名称与状态。
- 新增或调整共享控件时同步更新本页；它是“实物对照表”，不是一次性的审查工具。
- 不要删除；`vite build` 的入口不包含它。

## 验证

`npm run verify` 会检查生成物新鲜度、硬编码颜色、原生数字输入、跨文件重复导出，以及根目录共享控件是否已在本页登记；视觉与交互仍由用户手动验收。改 UI 时在说明里列出需要手测的路径（深色/浅色、窄窗口、空态/加载态、键盘操作），并写清复用了哪些现有件。
