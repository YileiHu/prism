# i18n & Theme

## 国际化 (i18n)

### 架构

使用 React Context 实现的轻量级 i18n，无第三方依赖。

```
src/i18n/
├── index.tsx    # LangProvider + useT hook + langNames
├── zh.ts        # 中文翻译 (默认语言)
└── en.ts        # 英文翻译
```

### 核心类型

```typescript
// zh.ts 导出翻译对象并作为类型来源
const zh = { "app.title": "PRISM", ... };
export type Translation = typeof zh;

// en.ts 实现相同类型
const en: Translation = { "app.title": "PRISM", ... };
```

所有组件通过 `useT()` hook 获取翻译函数：
```typescript
const { t, lang, toggleLang } = useT();
// t["resources.add"] → "添加资源" | "Add Resource"
```

### 添加新翻译

1. 在 `zh.ts` 中添加新的 key-value
2. 在 `en.ts` 中添加对应的英文翻译
3. TypeScript 会自动检查 `en.ts` 是否完整实现了 `Translation` 类型

### 翻译键命名规范

- `app.*` — 应用级文案
- `nav.*` — 导航
- `lang.*` — 语言切换相关
- `resources.*` — 网页资源面板
- `obsidian.*` — Obsidian 知识库面板
- `search.*` — 统一搜索
- `settings.*` — 设置页
  - `settings.catVaults/catExternal/catAppearance` — 设置分类标签

### 带参数的翻译

```typescript
// 定义时用占位符
"search.noResults": '未找到与 "{query}" 相关的结果。'

// 使用时手动替换
const text = t["search.noResults"].replace("{query}", query);
```

## 主题系统

### 架构

```
src/theme/
├── ThemeProvider.tsx    # React Context, 通过 CSS 变量切换主题
└── themes.ts           # 7 套预定义配色方案
```

### 主题数据结构

```typescript
interface ThemeColors {
  id: string;            // 内部标识符 (violet, ocean, emerald, ...)
  name: string;          // 中文名
  nameEn: string;        // 英文名
  primary: string;       // 主色调
  primaryHover: string;  // 悬停态
  primaryMuted: string;  // 半透明背景
  primaryText: string;   // 文字色
  primaryBorder: string; // 边框色
}
```

### CSS 变量桥接

`ThemeProvider.applyTheme()` 将选中的主题写入 5 个 CSS 变量：

```css
--accent         /* primary */
--accent-hover   /* primaryHover */
--accent-muted   /* primaryMuted - 用于背景 (rgba) */
--accent-text    /* primaryText */
--accent-border  /* primaryBorder */
```

组件使用 `var(--accent)` 等变量，实现一键换肤。

### 预设主题

| ID | 中文名 | 色系 |
|----|--------|------|
| violet | 紫罗兰 | 紫色 (默认) |
| ocean | 海洋蓝 | 蓝色 |
| emerald | 翡翠绿 | 绿色 |
| sunset | 日落橙 | 橙色 |
| rose | 玫瑰粉 | 粉色 |
| amber | 琥珀金 | 金色 |
| slate | 岩板灰 | 灰色 |

### 持久化

主题选择存储在 `localStorage` 的 `prism_theme` 键中，页面加载时恢复。

### 使用方式

```typescript
import { useTheme } from "../theme/ThemeProvider";

const { theme, setTheme, themeId } = useTheme();
setTheme("ocean"); // 切换到海洋蓝主题
```
