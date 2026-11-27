---
name: ui-settings-i18n
description: >-
  Prism UI preferences and language — use when adding a setting, settings
  section, i18n string, keyboard shortcut, theme, or shared UI control.
whenToUse: >-
  "add a setting", "settings page", "add translation", "new shortcut",
  "new theme", "use semantic colors"
user-invocable: true
---

# UI、设置与 i18n

## 何时用

- 新增/修改设置项、设置分区。
- 新增界面文案、翻译、占位符。
- 新增快捷键、主题。
- 改共享控件、颜色 token、设置行布局。
- 不确定该用哪个按钮/弹窗/控件。

不适用：数据层/IPC（用 `ipc-and-data`）；编辑器/白板内部（用 `editor-and-canvas`）。

## 先读

- `docs/reference/ui-inventory.md`（共享控件/hook/token 机械清单）
- `docs/guides/ui-kit.md`（token、控件、覆盖层、命名）
- `docs/guides/recipes.md` 的「新增设置项 / 文案 / 快捷键 / 主题 / 设置分区 / 共享控件」
- `docs/reference/settings.md`（当前注册表）

## 步骤

### A. 新增设置项

1. `src/shared/settings.ts`：
   - `AppSettings` 加字段；
   - `DEFAULT_SETTINGS` 加默认值；
   - `SETTING_META` 加 kind（enum/number/boolean/string/color/json）与范围/选项；
   - JSON 值加 `JSON_NORMALIZERS` 和 `normalizeXxx`。
2. 消费方用 `useSettings().values.xxx`；写用 `set("xxx", value)`。
3. UI 放 `src/components/settings/<Section>.tsx`：
   - 行用 `SettingRow`，块用 `SettingBlock`；
   - 控件 `Toggle` / `Select` / `TextField` / `NumberInput` / `Slider`；
   - 分区标题 `SectionHeader`。
4. 文案：`i18n/zh.ts` + `i18n/en.ts` 双份。
5. `npm run docs` 更新 `docs/reference/settings.md`。

### B. 新增设置分区

1. `src/components/Settings.tsx`：`SettingsCategory`、`CATEGORIES`、`categories`、渲染分支。
2. 新建 `components/settings/<Name>Section.tsx`。
3. 设置项按 A 注册；i18n 双份。
4. 手测分类切换 + `localStorage` 记忆 + 重置。

### C. 新增文案

1. `i18n/zh.ts` 加 key（类型源）。
2. `i18n/en.ts` 加同 key；`en: Translation` 会在 `npm run lint` 检查。
3. 组件 `const { t } = useT()`，用 `t["key"]`；参数 `.replace("{count}", …)`。
4. 不硬编码中英文，不在组件里拼句子。

### D. 新增快捷键

1. `src/shared/shortcuts.ts`：`ShortcutAction`、`SHORTCUT_ACTIONS`、`DEFAULT_SHORTCUTS`。
2. `src/lib/useShortcuts.ts`：分发新动作。
3. `src/components/settings/ShortcutsSection.tsx`：`rows` 加一行 + i18n。
4. `npm run docs:check`（检查每个动作有 UI 行）。
5. 手测录制、冲突、保留键、重置。

### E. 新增主题

1. `src/shared/themes.ts` 用 `theme({...})` 加一条数据：`mode`（`dark` / `light` / `both`）、`id`、`name`、`nameEn`、`accent` 必填；`neutral` / `ramp` 决定中性色阶梯，`dark` / `light` 只覆盖个别 token。
2. 单模式主题省略另一套（`mode: "dark"`）：应用会锁定模式，设置页与快捷菜单禁用模式控件并提示；模型与解析规则见 `docs/design/theme-authoring.md`。
3. 组件不写主题特例；颜色走 CSS 变量（`--accent*` / `--c-*`；副色 `--accent-2` 只给装饰位）。
4. 装饰效果走 `fx`（`bloom` 渐变柔光 / `pattern` / `gloss` / `glow` / `blur`）：图案与柔光由 `src/shared/themeEffects.ts` 生成，消费点固定在共享层；新效果加生成器 + 一张表项，不要让主题传任意 CSS。
5. 手测：深浅色、锁定提示、首帧不闪、原生窗口边缘、装饰图案与光晕、编辑器标题/加粗、弹窗、菜单、PDF 背景。

### F. 选控件

先查 `docs/reference/ui-inventory.md` 和 `docs/guides/ui-kit.md`，再 `grep` 现有调用点；下表只是最常用入口。

| 需要 | 用 |
|---|---|
| 按钮 | `Button`（variant/size） |
| 输入 | `Input`、`Textarea`、`SearchInput`、`TagInput`、`NumericInput`、`NumberInput`（数值 + `min`/`max` clamp） |
| 选择 | `SelectButton`、`SegmentedToggle` |
| 弹窗 | 先判三档：**快速** `sm/md`（确认 / 单输入 / 短表单）、**结构化** `lg`（多短字段表单）、**文档** `Modal layout="document"`（阅读详情 / 长文写作：铺满窗口、固定头尾、只滚正文）；脚手架 `PromptModal` / `ConfirmDialog` |
| 菜单 | `DropdownMenu`、`ContextMenu` + `useContextMenu` |
| 空/载入 | `EmptyState`、`Skeleton`、`Spinner` |
| 行/结构 | `ItemRow`（行尾不放操作：删除走右键 `menuItems`，编辑点整行；行间不加分割线）、`NavItem`、`SectionCard`、`Sidebar`。内容 modal 内不放删除入口，删除走触发行/卡片的右键菜单 + `ConfirmDialog` |
| 多选 | `useMultiSelect`（`src/lib/`，选择态）、`SelectModeButton`（工具栏开关）、`SelectionCheck`（行/卡勾选块）、`BatchActionBar`（动作写成 `BatchAction[]`） |
| 颜色 | `resolveTagColor`、`ColorSwatchPicker` |

### G. 新增共享控件 / 工具函数 / 效果类

新增 Button/共享控件的 variant 或 size 前，先提出请求并等待确认；不要边做边加。

1. 搜：`ui-inventory` + `grep` 现有实现；已有同职责的先复用。
2. 判定阶梯：直接复用 → 给现有件加可选 prop/variant → 共享层新建。一次性页面实现不要进根目录。
3. 放置：逻辑/hook → `src/lib/`；跨模块视觉件 → `src/components/` 根目录；设置行/块 → `components/settings/controls.tsx`；模块私有件 → `src/components/<module>/`。
4. 样式只用语义 token 与已有共用类；新增效果类前确认第二处会用到。
5. `docs/guides/ui-kit.md` 补一行（根目录控件必收录）→ `npm run docs` → `npm run verify`。

## 不变量

- 禁止硬编码颜色（含 `#hex`）；用语义 token / `var(--accent*)` / 已有共用类。
- 文案必须双份；不硬编码界面文字。
- 设置先注册再使用；不要在组件里存一份默认值。
- 设置行不要手写布局。
- 浮层用现成组件；portal 到 `document.body`。
- 异步列表保持三态；刷新不闪空。
- 可撤销操作用 toast `action`（约 5 秒）。
- 第二处使用必须提取；不跨模块 import 私有组件。
- 禁止原生 `type="number"`：只要字符过滤用 `NumericInput`，表单/弹窗的数值字段用 `NumberInput`（失焦解析 + 边界 clamp，别自己写 `Math.min/max`）。
- 禁止手写 `<button>` 做图标/文字操作；用 `Button`。原生 `<button>` 只用于基础控件、窗口 chrome、编辑器工具栏与自绘复合控件。
- 选值/下拉一律 `SelectButton`；`DropdownMenu` 只用于自定义动作或排序菜单（文件级 allowlist 由 `docs:check` 强制），不要用 `Button` + `DropdownMenu` 拼一个选择器。
- 弹窗先判档：详情/长文用 `Modal layout="document"`，不要用 `lg` + `max-h-[62vh]` 硬撑；文档型内容最大宽 1400、正文列 800（公告 960），分栏用 `useElementSize` 按容器宽度，不按 viewport。
- 渐变上下边界只用于整个 Modal 正文区（`ScrollFade` / `useScrollEdges` 只挂在 `Modal` 的正文滚动区，标题/页脚固定）；表单头尾固定交给 `Modal`，不要再包 `max-h` 内滚；弹窗内部的列表、`surface-inset` 内嵌框一律用普通滚动条，不要 `scrollbar-none` + 渐隐（媒体查看器 `ImageGallery` 例外：横向滚轮 + 左右渐隐）。

## 验证

```bash
npm run lint
npm run docs        # 设置/文案/控件契约变化时
npm run docs:check
```

`verify` 还会检查硬编码颜色、原生数字输入、重复导出与共享控件登记。手测：新设置修改后重启保留；重置回默认；非法值被 clamp；深/浅色；窄窗口；快捷键录制/冲突/保留键；i18n 中英切换。文档型弹窗另测：900 / 1200 / 1920 窗口与缩放、头尾固定、正文滚动、分栏切换、堆叠子弹窗；内嵌列表用普通滚动条、宽屏页面不出现整页滚动。

## 收尾

- 设置契约变化：`docs/reference/settings.md` 已更新。
- 新增/调整共享控件：`docs/guides/ui-kit.md` 有对应行，`docs/reference/ui-inventory.md` 已重新生成。
- 说明复用了哪些现有控件/函数、新增了哪些共享件，以及需要用户手测什么；不跑 UI 自动化。
