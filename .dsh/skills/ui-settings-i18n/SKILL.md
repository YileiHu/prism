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

- `docs/guides/ui-kit.md`（token、控件、覆盖层、命名）
- `docs/guides/recipes.md` 的「新增设置项 / 文案 / 快捷键 / 主题 / 设置分区」
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

1. `src/theme/themes.ts` 加数据（`id`/`name`/`nameEn`/`primary`/`dark`/`light`）。
2. 组件不写主题特例；颜色走 CSS 变量。
3. 手测深/浅色、编辑器标题/加粗、弹窗、菜单、PDF 背景。

### F. 选控件

| 需要 | 用 |
|---|---|
| 按钮 | `Button`（variant/size） |
| 输入 | `Input`、`Textarea`、`SearchInput`、`TagInput` |
| 选择 | `SelectButton`、`SegmentedToggle` |
| 弹窗 | `Modal`、`PromptModal`、`ConfirmDialog` |
| 菜单 | `DropdownMenu`、`ContextMenu` + `useContextMenu` |
| 空/载入 | `EmptyState`、`Skeleton`、`Spinner` |
| 行/结构 | `ItemRow`、`NavItem`、`SectionCard`、`Sidebar` |
| 颜色 | `resolveTagColor`、`ColorSwatchPicker` |

## 不变量

- 禁止硬编码颜色；用语义 token / `var(--accent*)`。
- 文案必须双份；不硬编码界面文字。
- 设置先注册再使用；不要在组件里存一份默认值。
- 设置行不要手写布局。
- 浮层用现成组件；portal 到 `document.body`。
- 异步列表保持三态；刷新不闪空。
- 可撤销操作用 toast `action`（约 5 秒）。

## 验证

```bash
npm run lint
npm run docs        # 设置/文案契约变化时
npm run docs:check
```

手测：新设置修改后重启保留；重置回默认；非法值被 clamp；深/浅色；窄窗口；快捷键录制/冲突/保留键；i18n 中英切换。

## 收尾

- 设置契约变化：`docs/reference/settings.md` 已更新。
- 新增控件/模式：必要时更新 `docs/guides/ui-kit.md`。
- 说明需要用户手测什么；不跑 UI 自动化。
