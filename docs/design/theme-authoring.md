# 主题作者模型

> 目标：加一套主题（包括"金 + 黑 + 水蓝"这类非单色系、只做深色的主题）只需要在
> `src/shared/themes.ts` 里写一条数据，不碰组件、不碰 CSS、不改默认值；主题选择在重启、
> 首帧、原生窗口边缘三处都一致。

## 1. 为什么数据在 `shared/`

主题以前只活在渲染层（`src/theme/themes.ts`），主进程只能用两个写死的灰（`DARK_BG`/`LIGHT_BG`）
画窗口底色和快速记录小窗。于是任何偏黑的主题都会在启动一帧、窗口边缘、小窗上露出别人的颜色。

现在数据与解析都在 `src/shared/themes.ts`（纯数据 + 纯算术，无 DOM），渲染层与主进程调用同一个
`resolveAppearance()`，颜色只有一个来源。

## 2. 模型

```ts
interface ThemeDef {
  id: string;
  name: string;        // 中文名（数据字段，不进 i18n）
  nameEn: string;
  accent: string;      // 主色 hex
  accent2?: string;    // 装饰副色（可选，见 §6）
  primaryButtonText?: string; // 主按钮文字色（可选；缺省 = 当前模式的 primaryText）
  primaryButtonHoverText?: string; // 主按钮 hover/press 文字色（缺省 = primaryButtonText）
  modes: ColorModeName[]; // 生成字段：这个主题真正带了哪些模式
  dark?: ThemeVariant; // 只声明支持的模式才有
  light?: ThemeVariant;
}
```

`ThemeVariant` 是一套完整 token：`primaryHover/Muted/Text/Border` + 13 个 surface + 一份 `chrome` surface
（`base/surface/elevated/hover/tint/overlay`、`primary/secondary/tertiary/muted/faint`、`line/strong`）。

**省略即不支持**：`mode: "dark"` 的主题没有 `light`，不是一个缺数据的浅色主题。

## 3. 作者 API：`theme(seed)`

```ts
theme({
  mode: "dark",              // 必填：dark | light | both
  id: "genesis",
  name: "GENESIS",
  nameEn: "GENESIS",
  accent: "#d4a53a",         // 必填；推导出的中性色相也来自它
  emphasis: "#f0c75e",       // 可选：选中行/图表参考线重点色；缺省 = accent
  accent2: "#35c9d6",        // 可选：装饰副色
  primaryButtonHoverText: "#84d6df", // 可选：主按钮 hover/press 文字色（GENESIS 静止金色，悬停/按下青色）
  neutral: { hue: 28, chroma: 0.004 }, // 近黑、微暖；chroma≈0 就是纯中性
  ramp: "ink",               // soft | normal | punchy | ink
  radius: { chip: 0, control: 0, card: 0, pill: 0, segment: 0 }, // 可选：整主题方角
  fx: { pattern: { kind: "scanlines" }, glow: 10 }, // 可选装饰层，见 §6
  dark: { /* 只覆盖个别 token */ },
});
```

推导规则（`neutral` / `ramp` / `radius` 缺省时）：

| 产出 | 规则 |
|---|---|
| 深色 surface 阶梯 | `ramp` 的 OKLCH 明度表（`normal` ≈ 现有主题；`ink` ≈ 纯黑页 + 近黑卡），中性色相默认取 accent 色相，彩度默认 0.010（普通主题）；Graphite 显式 0.003 |
| 浅色 surface 阶梯 | 同一张表反推纸面明度（彩度按 0.35 收）；`surface` 按 accent 9% 混白、`elevated` 5.2% 混白，`base`/`hover` 另混 5.5–6% accent，避免纯白刺眼 |
| accent 变体 | `hover` = 明度 −0.05/−0.06，`text` 落在 0.72–0.88（深）/ 0.30–0.55（浅），`muted`/`border` = accent 的 alpha |
| 文字阶梯 | 深色 0.92/0.85/0.70/0.55/0.43；浅色 0.23/0.38/0.48/0.58/0.73（OKLCH 明度） |
| 圆角 | `chip 4 / control 8 / card 12 / pill 9999 / segment 5`（px）；`radius` 可只覆盖其中几项，0 = 方角 |
| 重点色 | `emphasis` 用于侧栏选中行光晕、图表参考线/不确定带；缺省等于 accent，建议选一个与主色区分的颜色 |

OKLCH 换算、sRGB 色域裁剪、WCAG 对比度在 `src/shared/themeColor.ts`，无第三方依赖。

覆盖是逐 token 的：传 `dark: { surfaces: { base: "…" } }` 只改那一个，其余仍走推导。
普通主题的主区 surface 由种子推导成近中性；chrome（侧栏/工具栏/tab 栏）保留旧版逐主题 palette（`CHROME_PALETTES`），通过 `--c-chrome-*` 注入并只作用在 `.app-header` / `.chrome-bg` / `.toolbar-band` 内。推导器接管
旧主题留到之后单独评审，避免未验收的视觉变化。

## 4. 单模式主题与锁定

`resolveAppearance(themeId, modeSetting, systemDark)` 是唯一的解析入口（渲染层、主进程共用）：

| `color_mode` | 主题支持解析出的模式 | 结果 |
|---|---|---|
| `dark` / `light` | 支持 | 直接用 |
| `dark` / `light` | 不支持 | 强制到主题支持的模式，`pinned = true` |
| `system` | 支持 | 跟随系统 |
| `system` | 不支持 | 强制到主题支持的模式，`pinned = true` |

不做"自动换搭档主题"：锁定比自动切换更可预测。

`useTheme()` 暴露 `resolvedMode`（真正生效的模式）与 `pinned`。锁定后：

- 设置页 `Select` 显示生效模式并禁用，说明行换成"当前主题仅支持深色/浅色"；
- 顶栏 `ThemeQuickMenu` 的三个模式项全部禁用，并补一行提示；
- 主题卡与菜单项用 `Badge` 标「仅深色 / 仅浅色」，预览色板取主题自己支持的变体。

## 5. 持久化与首帧

- `theme` 是注册设置项（`src/shared/settings.ts`，`enum` 的 options 来自 `THEME_IDS`），落 SQLite；
  `localStorage` 只做首帧镜像（`prism_theme` / `prism_mode` / `prism_appearance`）。
- `index.html` 的内联脚本先读 `prism_appearance`（`resolvedMode` + `base` 三元组），设
  `data-mode`、`color-scheme`、`--c-base`，所以深色专属主题在系统浅色时不会先闪一帧浅色。
- 主进程 `createWindow` / quick capture 用 `resolveAppearance` + `appearanceBaseHex` 画原生窗口；
  `settings:set` 收到 `theme` 或 `color_mode` 时重算，锁定模式下 `nativeTheme.themeSource` 也跟随生效模式。
- 默认 id 只有 `DEFAULT_THEME_ID` 一处；设置重置写入默认设置后调用 `setTheme(DEFAULT_THEME_ID)`。

## 6. CSS 变量契约

`applyAppearance()` 写：`--accent`、`--accent-hover`、`--accent-muted`、`--accent-text`、
`--accent-border`、`--accent-rgb`、`--accent-2`、`--accent-2-rgb`、`--emphasis` / `--emphasis-rgb` / `--emphasis-line`、
`--c-*`（13 个）、`--radius-chip` / `--radius-control` / `--radius-card` / `--radius-pill` /
`--radius-segment` 与 `--fx-*`，再设 `data-theme` / `data-mode` / `data-fx` / `data-fx-blur`。

`--accent-2` 在没有副色的主题里等于主色，所以消费点不需要分支。它只用于**装饰**（发光、
选中装饰），选中/激活/焦点仍然只认 `--accent`，不参与状态语义。

## 7. 装饰层（`fx`）

主题可以带一个 `fx` 块，全部可选。**侧栏 hover 光晕对所有主题生效**：没有写 `fountain` 的主题由工厂自动派生一个主色平滑光（`texture: false`），GENESIS 则保留自己的青色方格矩阵。其余装饰默认关闭，不影响布局与对比度。

```ts
theme({
  // …
  fx: {
    // 大面是否吃主色：默认 accent；neutral 时侧栏/工具栏只用中性灰阶
    chrome: "neutral",
    // 页面柔光：可选（radial 光源 / linear 渐变，数组靠前的图层在上）
    bloom: [{ kind: "linear", color: "#d4a53a", opacity: 0.1, angle: 180, fade: 0.5 }],
    // 侧栏渐变：另一套可选消费位（本主题未用）
    sidebar: [{ kind: "linear", color: "#d4a53a", opacity: 0.55, angle: 180, fade: 0.85 }],
    pattern: { kind: "matrix", scale: 4, opacity: 0.06, color: "#35c9d6" },
    // 按钮/选中卡的矩阵高亮：整齐方格 + 径向渐隐
    highlight: { color: "#35c9d6", opacity: 0.6, scale: 4, weight: 2 },
    // 侧栏行 hover 喷泉：从 dock 边缘喷入，垂直高斯衰减，按下更亮
    fountain: { color: "#4fe0ea", selectedColor: "#f0c75e", opacity: 0.58, scale: 3, weight: 1, reach: 130, height: 70, flow: "breathe", flowDuration: 0.8 },
    // 侧栏行不要灰色 hover/选中底，只留喷泉（hover 蓝色、选中金色）
    sidebarRows: "flat",
    glow: 12,      // px，accent 高亮周围的副色光晕
    blur: 18,      // px，浮动面板的玻璃模糊
  },
});
```

**图案 kinds**（页面底纹，生成器在 `src/shared/themeEffects.ts`，全部确定、无随机）：

| kind | 形状 | 默认 `scale` | 平铺 |
|---|---|---|---|
| `grid` | 双向细网格（绘图纸） | 8 | repeat |
| `pixels` | 2×2 棋盘像素纹（屏幕像素） | 4 | repeat |
| `scanlines` | 单方向横线（CRT 扫描线） | 4 | repeat |
| `matrix` | 细密小方格阵列（96px 瓦片内约 23 个青色格子点亮） | 4 | repeat |
| `waves` | 正弦波线（声波纹） | 96 | repeat |
| `contours` | 不规则等高线环（三组中心） | 320 | cover，不重复 |

公共参数：`opacity`（0–0.4，上限保护正文可读性）、`color`（默认主色）、`weight`（线宽 0.5–3px）。
`matrix` 额外用 `color` 画稀疏亮格（每瓦片约 4% 的格子、透明度 0.2–0.55），底下的方格阵列固定是
白色 `opacity`；瓦片 24×24 格，换主题不会闪光或抖动。

**柔光（`bloom` / `sidebar`）**：一个 `BloomSpec` 或数组（数组靠前的图层在上），两种形态：
`kind: "radial"`（`x`/`y` 中心、`size` 半径百分比、`aspect` 纵向比例）和 `kind: "linear"`
（`angle` 角度）。共同参数 `opacity`（0–0.85）、`color`（默认主色）、`fade`（颜色消失位置，0.15–0.95）。
`sidebar` 画进侧栏 dock（叠在原有 accent 渐变之上），`bloom` 画在页面底纹下面——两者是同一套
数据形状，只是消费位置不同。

**大面中性（`chrome`）**：默认 `"accent"`，侧栏/工具栏的 2–12% tint 用主色；设为 `"neutral"` 时
`--chrome-tint` 换成主题的 `muted` 文字灰，于是侧栏、工具栏、页面都只剩中性灰阶，金色只出现在
交互与高亮上。

**高亮（`highlight`）**：一个 1 格/瓦片的 SVG（默认 4px 栅格、2px 方格），由 CSS 的径向 mask
渐隐成"一片光晕"，可画在 `ChipTabs` 选中项背后的 `.chip-tabs-thumb` 上。**可选**：不写
`highlight` 时 ChipTabs 用主色径向光晕；目前所有内置主题都用平滑光（GENESIS 也是金色光晕）。
它**不是**页面底纹：只出现在选中项背后，整齐排列、中心亮边缘淡。

**共享 hover 纹理（`hover`）**：可选的 `HighlightSpec`（颜色 / 透明度 / 栅格 / 方格），
渲染成 `--fx-hover-image` / `--fx-hover-size` / `--fx-hover-opacity` / `--fx-hover-border`。
任何可交互元素加 `.theme-hover` 即可复用：`Button`（非 active / 非 danger）、`SelectButton` 触发器、未激活的顶栏 tab、`DropdownMenuItem` / `ContextMenu` 的非危险项。`SegmentedToggle` / `ChipTabs` 保留自己的 hover 语言，不叠纹理。`ChipTabs` 保留自己的 chip 光晕 hover，不叠加这层。
`::before` 在 hover 时铺纹理、`::after` 画 1.5px 边框（GENESIS 再压暗 30%）；GENESIS 的 `fx.hover` 用青色方格 + 青色边，
并给悬停项 5% 青色底；纹理透明度 0.26。`danger` / 危险菜单项和已激活项不套用。
没写 `hover` 的主题：纹理 `none`、边框透明，元素保持原来的 hover 样式。
danger 是动作而不是可持续选中态，**不参与 active**；`.theme-hover-danger` 只负责 hover 的红色点阵（仅 `[data-theme-hover]`/GENESIS 下发）和红色边框，普通主题保留普通 danger hover。
`selectedHover` 是同一套 `HighlightSpec`，只给“已选中元素”的 hover 用：消费方加 `.theme-hover-accent`，
它把 hover 层换成 `--fx-selected-hover-*`，并保留元素自己的选中底色。已接入：激活 tab、`Button active`（顶栏养成/仓库/设置图标）、`DropdownMenuItem active`（被选中的笔记库）。GENESIS 的当前 tab 用金色方格；它的 1.5px 边框和青色版一样与背景混 30% 压暗，亮度对齐。没有 `hover` / `selectedHover` 的普通主题：hover 不出现纹理，也不出现额外边框，只保留控件原来的 hover 填充。

**字段 focus（`focus`）**：可选 `{ color, textureOpacity }`，渲染成 `--focus-border-color` / `--focus-texture-opacity`。GENESIS 使用 2px 视觉青色边框 + active 按钮同款的 3px/1px 青色方阵纹理（8%）；不画四角、不叠金色内环。其他主题没有 `focus` 时保留视觉 2px 强调色边框，不加 ring。
**侧栏光晕（`fountain`）**：默认是主色平滑光（`texture: false`），GENESIS 用同一款方格瓦片。
mask 是"转 90° 的正态分布"——`radial-gradient(130% 70% at -2% 50%, …)` 以行左缘为中心，横向衰减、
纵向高斯，所以 hover 时像从 dock 边缘喷进来、越往里越散。挂在 `.fx-fountain`（`NavItem` 自带）的
`::before` 上：默认透明，`:hover` 是主色的 `opacity × 1.35`，选中行静止是 `emphasis` 的
`opacity × 1.15`，`:active` 再乘 1.7（按下最亮，hover 比选中常亮更亮）。
参数：`opacity` / `scale` / `weight` / `reach`（横向%）、`height`（纵向高斯半径%）、`texture`
（`false` = 平滑光，默认 `true` 方格）；`selectedColor` 单独给选中行换色（手写时缺省沿用 `color`，
自动派生时等于主题的 `emphasis`）。`color` 是 hover 的颜色，`selectedColor` 是选中行的常亮重点色；
文字和图标本身不加发光。
伪元素向左多伸 `--fx-fountain-bleed`（默认 32px），把渐变原点推到窗口外，被容器左缘裁掉后，
可见部分正好从窗口边缘开始喷——**不需要改任何边距或布局**。

文字和图标保持主题原本的颜色/对比度，不做 `text-shadow` 或 `drop-shadow` 发光；反馈只来自行背后的光晕。

**平底侧栏行（`sidebarRows`）**：现在**所有主题默认 `"flat"`**：根节点带 `data-flat-rows`，
`NavItem` 的灰色 hover/选中底都被去掉，hover 和按下都只有光晕，没有背景块。显式写 `"tint"`
可以退回旧的灰色行底。
选中行（`aria-current="page"`）静止时是 `emphasis` 重点色光晕，亮度 `opacity × 1.15`；
一旦 hover 就切回主色（hover 优先），移开后回到重点色。mask 在行右缘前收束
（约 94% 宽度处归零），纹理不会被行边界切断。
可选 `flow: "breathe"`：矩阵原地呼吸（GENESIS；`flowDuration` 是每个方向的时长，默认 0.8s，
所以一呼一吸约 1.6s）；按下时暂停呼吸、直接给按下亮度，`prefers-reduced-motion` 时关闭。

数值全部在 `normalizeThemeFx()` 里夹取，未知 kind / 非 hex 颜色在模块加载时直接报错。

**渲染管线**：`renderThemeFx(fx, accent)` 产出 CSS 变量（SVG 走 ASCII base64 data URI，等高线
约 17 KB，只在切主题时算一次），`ThemeProvider` 先清空 `FX_VAR_KEYS` 再写入，所以切回普通主题
不会残留图案。`data-fx="pattern"` 才让 `body` / `.app-main` 挂上图案（固定定位、与窗口对齐，
只出现在页面画布与留白，面板自身不透明），`data-fx-blur` 才开 `backdrop-filter`，避免没用
fx 的主题为合成层付费。首帧只有 `base` 纯色，图案在 React 挂载后生效——不把十几 KB 的 data URI
塞进 localStorage 快照。

**消费点**（共享层，只有这些）：

| 位置 | 令牌 | 默认表现 |
|---|---|---|
| `body` / `.app-main` 背景 | `--fx-image` / `--fx-size` / `--fx-repeat` | `none`，纯色底；三个列表一一对应（图案各层 + 柔光各层） |
| `.chrome-bg` / `.toolbar-band` 的大面 tint | `--chrome-tint`（默认 `var(--accent)`，`chrome: "neutral"` 时为 `rgb(var(--c-muted))`） | 主色淡洗 |
| `.chip-tabs-thumb`（ChipTabs 选中项） | `--chip-glow-image` / `--chip-glow-size` / `--chip-glow-opacity` / `--chip-glow-blur`（有 `highlight` 时取 `--fx-highlight` 纹理，否则用 accent 径向光） | 无背景、无光晕 |
| `.field-inset:focus` 的外框/方阵纹理 | `--focus-border-color` / `--focus-texture-opacity`（`data-focus-fx`） | 无外框/纹理，保留原 focus 环 |
| `.fx-fountain`（`NavItem`）的 `::before` | `--fx-fountain` / `--fx-fountain-size` / `--fx-fountain-opacity` / `--fx-fountain-mask` | 所有主题都有：默认主色平滑光，GENESIS 为方格纹理；无 `fx` 时自动派生 |
| `[data-flat-rows]`（仅 `NavItem`） | `data-flat-rows` 属性 | 所有主题默认开启；写 `sidebarRows: "tint"` 可恢复灰色行底 |
| chrome 顶缘高光 | 已移除（header / 侧栏 / 工具栏都不再画） | — |
| `.theme-hover` / `.theme-hover-accent` 的 `::before` / `::after`（Button / 顶栏 tab / 菜单项） | `--fx-hover-image` / `--fx-hover-size` / `--fx-hover-opacity` / `--fx-hover-border`（`data-theme-hover` 控制 hover 底色） | 无纹理、透明边，元素走原 hover |
| `.accent-ring` 外发光 | `--fx-glow` + `--accent-2-rgb` | 0px，无阴影 |
| `.panel-floating` 毛玻璃 | `--fx-blur` | 无 backdrop-filter |

**扩展规则**：新效果 = 在 `themeEffects.ts` 加一个生成器 + 一张 kinds 表项 + 必要时给共享类加
一个消费点；**不要**让主题传任意 CSS（`fx` 是类型化白名单），也不要新增 `themeId ===` 分支。
菜单/弹窗暂时不做玻璃：它们各自背景层不同，等真有主题需要时再按同一套路加 `data-fx` 钩子。
`fx` 目前是整主题一份；若以后需要分模式（浅色主题用更淡的图案），把它扩成 `{ dark, light }`，
解析在 `resolveAppearance` 里完成，消费点不变。

### 已实现的示例：GENESIS（`genesis`）

内置主题里带完整 `fx` 的一条（其他主题只有自动派生的侧栏光晕），也是“中性大面 + 金色交互 + 侧栏矩阵喷泉”的参考实现：

- 仅深色（`mode: "dark"`）：浅色模式下应用会锁定深色并显示「仅深色」。
- **大面全部中性**：`chrome: "neutral"`，侧栏/工具栏的 tint 换成 `muted` 灰；页面是纯色炭灰
  `base #080809`，面板 `surface #0e0e10`、浮层 `elevated #161619`、线 `line #1c1c20`。
  没有侧栏渐变、没有页面图案。
- 金 `#d4a53a`（强调 `#f0c75e`）只出现在交互上：当前标签/链接/焦点/边框，`primaryMuted` 12%、`primaryBorder` 30%；
  胶囊和选中卡片就是金色 tint + 金色边，**不叠任何纹理或光晕**；侧栏与 ChipTabs 的选中光晕都统一用
  金色平滑光；按钮 hover 例外，用 `hover` 的青色方格 + 青色边，当前 tab hover 用 `selectedHover` 的金色方格。
- **整主题方角**：`radius` 全 0，按钮、输入框、卡片、菜单、标签页、分段控件与图标按钮（`rounded-pill`）都没有圆角；
  其他主题保持默认 4/8/12/9999，不受影响。

- **侧栏 hover 喷泉**：`fountain` 让侧栏每一行（`NavItem`）hover 时从 dock 左缘喷入方格，
  纵向按高斯衰减、横向向里扩散，按下时亮度 ×1.7；`sidebarRows: "flat"` 去掉了灰色 hover/选中底，
  选中行静止时是金色喷泉，hover 时切回蓝色。
- 喷泉的左缘是伪元素向左多伸 32px、被容器裁出来的，**没有改任何 padding/margin**，所以其他主题
  的布局完全不受影响。
- `blur 12`（白板浮动详情面板）。
- 想更亮/更暗：改 `accent`、`fountain.opacity`（0.4–0.7）、`fountain.flowDuration`（0.6–2）；
  想换成另一套质感：把 `highlight` 换成 `pattern`（页面底纹）或 `sidebar`（侧栏渐变）。

## 8. 尚未做

1. `docs:check` 的主题校验（id 唯一、缺键、WCAG 对比度）与生成的主题参考页。
2. 普通主题的 canvas / chrome 分层的逐套视觉验收（主区近中性，侧栏保留 accent）。
3. 菜单/弹窗的玻璃变体（当前只有 `.panel-floating`）。

## 9. 手测清单

- 切换主题：深浅两套都立即生效，重启保留。
- 单模式主题：模式控件禁用且提示正确；系统模式切换不改变生效模式。
- 首帧：深色专属主题 + 系统浅色启动，不闪浅色；窗口边缘/快速记录小窗同色。
- 设置页主题卡：预览色板取主题支持的变体，徽章正确。
- 装饰：加 fx 的主题能看到图案（页面留白处、不压面板）、ChipTabs 选中项的副色光晕、侧栏 hover 光晕、浮动面板模糊；
  切回普通主题后图案/模糊消失，侧栏光晕改成该主题主色的平滑光。
- 编辑器标题/加粗、弹窗、菜单、PDF 封面在主题下仍可读（图案不降低正文对比度）。
