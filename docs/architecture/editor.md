# 编辑器子系统

> 读完本文应能回答：Markdown 如何变成阅读视图与编辑视图、两条管线哪些共享哪些不能合并、块编辑会话如何开始与结束、五类块容器各管什么、嵌入/图片/公式/提示卡在哪实现、改不同需求该看哪些文件、哪些不变量与坑不能碰。

## 1. 适用场景与相关文档

改动任何「笔记阅读/编辑」相关行为都从这里起步：Markdown 渲染、块级编辑（表格/代码/callout/公式/嵌入）、图片与附件、自动保存、阅读⇄编辑切换、大纲与折叠。编辑器目录约 30 个文件，是仓库里耦合最紧的部分，先判断改动属于阅读管线还是编辑管线，再按第 3 节的分组表定位。

- [架构总览](./overview.md)：进程模型、渲染层 Provider、工作区与文档标签。
- [渲染层](./renderer.md)：`NoteEditor` 如何被 `DocumentPane` 挂载，`focused`/`toolbarScope`/分屏从哪来。
- [UI 组件与视觉规范](../guides/ui-kit.md)：语义色 token、`Button`/`SegmentedToggle`/`ContextMenu`、i18n 约定。
- [改动配方](../guides/recipes.md)：新增块类型、设置项、快捷键的分步清单。
- [主进程](./main-process.md)：`prism-file://` 协议（图片能显示的原因）、`vault:save-attachment`、vault watcher。
- [编辑器块重构方案](../design/editor-block-refactor.md)：当前块会话架构的设计依据；历史文档，其中部分路径已变。

## 2. 数据源与双管线

**Markdown 源码是唯一持久化数据。** 打开笔记时 `window.prism.readNote` 返回字符串，保存时 `window.prism.saveNote` 把字符串写回 `.md` 文件；SQLite 里的笔记表只是索引。两条管线都从这同一个字符串出发，都不产生第二份文档状态。

| 管线 | 机制 | 产物 |
|---|---|---|
| 阅读 | markdown-it 一次性把源码渲染成 HTML 字符串 | React `dangerouslySetInnerHTML` + `hydrateMarkdown` 行为补挂 |
| 编辑 | 一个 CodeMirror 6 `EditorView`，doc 就是源码 | decoration 隐藏标记、block widget 显示卡片、局部 input/textarea 编辑块内容 |

**共享的逻辑**（改一处两边都会受影响）：

- `markdown.ts` 的 `renderMarkdown` / `renderInlineMarkdown`：阅读视图、`CalloutWidget`（callout 卡片正文）、`TableWidget`（单元格内联 markdown）共用。
- `markdownHydration.ts`：阅读视图、`TableWidget`、`CalloutWidget` 共用同一套后处理（callout 图标、嵌入卡片挂载、点击分发）。
- `callouts.ts`（类型别名/默认标题/正文前缀剥离）、`imageSize.ts`、`assetUrl.ts`、`imagePath.ts`、`taskToggle.ts`、`linkResolver.ts`。
- `src/components/embeds/model.ts`、`src/components/embeds/EmbedCard.tsx`、`src/components/embeds/embedMount.tsx`、`src/components/embeds/loader.ts`：嵌入的解析、卡片 UI 与加载缓存。
- `codeHighlight.ts`：markdown-it 的 `highlight` 选项与编辑态代码卡共用同一个 highlight.js core 实例。

**不能合并的原因**：

- 阅读的产物是 HTML 字符串；编辑需要保留源码位置、可映射的 `ChangeSet` 范围和增量重算。CM6 decoration 无法从 HTML 反推。
- 显隐规则不同：阅读无条件渲染一切；编辑只在选择不与某个构造相交时隐藏标记，块也只有「未失焦」时才被整块替换成卡片。
- 焦点模型不同：阅读没有 caret；编辑态容器会话里 DOM 焦点在局部控件上，主 CM 选区只是逻辑锚点。
- 加载时机不同：`MarkdownPreview` 是 `lazy(() => import("./MarkdownPreview"))` 独立 chunk；编辑态 widget 会懒加载 `markdown.ts`/`codeHighlight.ts`，缓存后必须同步渲染（否则离开块编辑会闪一帧空卡片）。
- 折叠状态不共享，见第 9 节。

## 3. 文件职责分组表

下表给完整路径；后文提到 `src/components/editor/` 下的文件时用相对该目录的简写（例如 `livePreview.ts`、`containers/registry.ts`），其它目录一律写仓库相对路径。

| 分组 | 文件 | 一句话职责 |
|---|---|---|
| 入口/会话 | `src/components/editor/NoteEditor.tsx` | 编辑器组件入口：读文件、建 `EditorView`、模式切换、自动保存、右键/插入菜单、大纲与滚动锚点。 |
| 入口/会话 | `src/components/editor/cmExtensions.ts` | CM6 扩展组装、主题与高亮、全局 keymap、粘贴/拖放图片。 |
| 入口/会话 | `src/components/editor/blockState.ts` | 会话与块聚焦的 StateField/StateEffect 定义，外加代码折叠状态。 |
| 入口/会话 | `src/components/editor/blockSession.ts` | 会话协调器：进入会话、写回草稿、选区映射、焦点兜底。 |
| 入口/会话 | `src/components/editor/blockFocus.ts` | 方向键/块边界聚焦、块级键盘协议、聚焦块描边。 |
| 模型/解析 | `src/components/editor/blockModel.ts` | 统一 `BlockRef` 联合类型与 `blockAt`（code/table/callout/math/embed）。 |
| 模型/解析 | `src/components/editor/tableModel.ts` | 表格行/列/单元格的精确范围、对齐与 `flatTableCells`。 |
| 模型/解析 | `src/components/editor/mathModel.ts` | `$$` 块索引 `mathBlocksField`，增量扫描。 |
| 模型/解析 | `src/components/editor/embedBlockModel.ts` | 单行内 `![[...]]`/`![](...)` 的收集、独占行判定。 |
| 模型/解析 | `src/components/editor/callouts.ts` | callout 类型族、默认标题、`parseCalloutLine`、正文 `>` 前缀剥离/还原。 |
| 模型/解析 | `src/components/editor/linkResolver.ts` | wikilink 目标解析与相对 `.md` 链接转绝对路径。 |
| 实时预览 | `src/components/editor/livePreview.ts` | decoration StateField、增量重建窗口、块 widget 挂载、`atomicRanges`。 |
| 实时预览 | `src/components/editor/codeHighlight.ts` | highlight.js 注册与 `highlightCode`（含大小上限）。 |
| 实时预览 | `src/components/editor/codeLanguages.ts` | 代码块语言候选列表（不引入 highlight.js）。 |
| 块会话 | `src/components/editor/blockActions.ts` | 结构操作与源码态操作：插入块/段落、表格行列、语言/折叠、删除块。 |
| 块会话 | `src/components/editor/blockMenu.tsx` | 右键菜单骨架，拼装 `ContainerSpec.menu` 与公共项。 |
| containers | `src/components/editor/containers/registry.ts` | 按 `BlockKind` 注册/查找 `ContainerSpec`。 |
| containers | `src/components/editor/containers/types.ts` | `ContainerSpec`/`ContainerEntry`/`ContainerMenuContext` 契约。 |
| containers | `src/components/editor/containers/bind.ts` | 所有容器字段统一的按键、焦点、auto-grow 协议。 |
| containers | `src/components/editor/containers/code.ts` 等五个 spec | 每类块的进入目标、源码锚点、专属菜单与删除文案。 |
| 渲染 | `src/components/editor/blockRender.ts` | code/table/callout 三类 block widget（卡片、局部编辑器、提交）。 |
| 渲染 | `src/components/editor/mathRender.ts` | 行内 `MathWidget` 与 `$$` 块 `MathBlockWidget`。 |
| 渲染 | `src/components/editor/calloutSubEditor.ts` | callout 正文的嵌套迷你 live-preview 编辑器。 |
| markdown | `src/components/editor/markdown.ts` | markdown-it 工厂：插件、core/inline/renderer 规则、frontmatter 与大纲。 |
| markdown | `src/components/editor/MarkdownPreview.tsx` | 阅读视图：渲染、标题折叠、大纲高亮、滚动容器。 |
| markdown | `src/components/editor/OutlineCard.tsx` | 浮层大纲卡片，两种模式共用外观。 |
| markdown | `src/components/editor/folds.ts` | 标题折叠状态（localStorage `prism_md_folds`）与折叠键生成。 |
| hydration | `src/components/editor/markdownHydration.ts` | 渲染后处理：callout 图标、嵌入卡片挂载、链接/任务点击分发。 |
| 工具 | `src/components/editor/taskToggle.ts` | 按序号翻转源码中的任务复选框。 |
| 工具 | `src/components/editor/InsertModal.tsx` | 插入图片/画布/笔记/PDF/链接，统一产出 `![[...]]`。 |
| 工具 | `src/components/editor/markdown-plugins.d.ts` | 第三方 markdown-it 插件的类型声明。 |
| 资源 | `src/components/editor/assetUrl.ts`、`imagePath.ts`、`imageSize.ts` | 本地资源 URL、附件引用风格、图片尺寸 token。 |
| 资源 | `src/components/embeds/model.ts`、`src/components/embeds/EmbedCard.tsx`、`src/components/embeds/embedMount.tsx`、`src/components/embeds/loader.ts` | 嵌入 spec 与卡片、独立 React root 挂载、按目标类型加载。 |

## 4. 阅读管线

`MarkdownPreview` 调用 `renderMarkdown(content, assetContext)`，得到 `{ html, frontmatter, outline }`。各处理落在下面这些阶段；表格行的先后是 `markdown.ts` 里的书写/注册顺序，只有「行内规则」那一行同时就是匹配优先级。

| 阶段 | 处理 | 位置与符号 |
|---|---|---|
| 预处理（`md.render` 之前） | 剥离并解析 frontmatter（js-yaml，失败不报错） | `stripFrontmatter` / `FRONTMATTER_RE`；卡片 `FrontmatterCard`（受 `show_frontmatter` 设置控制） |
| 解析 · 插件（`md.use`） | `==高亮==`、任务列表、KaTeX 的 `$...$` 与 `$$...$$`（`throwOnError: false`） | `markdown-it-mark`、`markdown-it-task-lists`（`enabled: true, label: true`）、`@mdit/plugin-katex` |
| 解析 · 行内规则（按此优先级依次尝试） | `#tag` → `![[target\|label\|尺寸]]` 嵌入 → `[[target\|alias]]` wikilink → 标准 link | `tagRule`（`prism_tag`）、`embedRule`（`prism_wikilink_embed`）、`wikilinkRule`（`prism_wikilink`），都用 `inline.ruler.before` 插在 `link` 之前 |
| 解析 · core 规则（都挂在 `inline` 之后） | callout 块改写；独占行的图片/嵌入加居中 class；短表格单元格加 `md-cell-nowrap` | `transformCallouts`（`prism_callouts`）、`prism_standalone_images`、`prism_table_nowrap`；三者互不依赖，都只读已解析 token |
| 解析 · core 规则（`ruler.push`，排在 core 链末尾） | 标题 id 与大纲 | `prism_heading_outline`（写入 `env.outline`，id 形如 `hd-N`） |
| 渲染 · renderer 规则 | wikilink、嵌入、图片、tag 药丸、表格滚动框、代码高亮 | `wikilink` / `wikilink_embed` / `image` / `mdtag` / `table_open`+`table_close` 规则；代码高亮走 markdown-it 的 `highlight` 选项 → `highlightCode`（超过 `CODE_HIGHLIGHT_LIMIT` 只转义） |
| 后处理（React 侧） | 标题折叠、大纲高亮、行为补挂、任务点击 | `MarkdownPreview` 的 layout effect + `OutlineCard` + `hydrateMarkdown`（callout 图标、`.md-embed-pending` → `mountEmbedCard`、wikilink/链接/任务点击分发） |

图片的尺寸在这里确定：`md.renderer.rules.image` 用 `parseImageAlt` 从 alt 尾部取 `宽`/`宽x高` token，`imageSizeAttrs` 输出 `width`/`height`，本地 ref 由 `prismFileUrl` 变成 `prism-file://`；没有 `assetContext` 时输出 `md-img-missing`。嵌入尺寸同理走 `parseEmbedSpec`/`clampEmbedSize`。

要点：`renderMarkdown` 通过模块级 `assetCtx` 传上下文，**只在一次同步渲染期间有效**，不要跨调用缓存它。嵌入的 `canvas`/`note`/`pdf` 在 HTML 里只是 `.md-embed-pending` 占位，真正的卡片由 `hydrateMarkdown` 异步挂载；`image`/`link` 直接输出 HTML。任务勾选不修改 DOM，而是 `hydrateMarkdown` 算出局部序号交给 `NoteEditor.handleToggleTask`，再由 `toggleTaskInSource` 重写整篇源码。

## 5. 编辑管线

`NoteEditor` 用 `EditorState.create({ doc: note.content, extensions: [...buildExtensions(hooks, options), updateListener] })` 建唯一的编辑视图。`buildExtensions` 的顺序是有意的：

1. `schemeCompartment` / `indentCompartment` / `wrapCompartment`（运行时可 reconfigure，不重建视图）。
2. `history()`、`dropCursor()`、`allowMultipleSelections`、`bracketMatching()`、`search({ top: true })`；**刻意不加 `drawSelection()`**，让选区严格贴合可见文字，不覆盖被隐藏的行首语法。
3. `markdown({ base: markdownLanguage, codeLanguages: languages })`：必须用 GFM 语言（`Table`/`TaskMarker`/`StrikethroughMark` 节点来自它）。
4. `syntaxHighlighting(highlightStyle)` + `editorTheme`：颜色全部来自 `src/index.css` 的 CSS 变量。
5. `livePreview(hooks)`：返回 `focusedBlockField`、`blockSessionField`、`codeFoldField`、`mathBlocksField`、decoration StateField、`parseViewportOnDemand()`、`atomicRanges`、Ctrl/Cmd+点击链接的 DOM handler。
6. 粘贴/拖放图片、`focusedBlockHighlighter`、`Prec.highest` 的块键盘处理、`Prec.high` 的 Tab/方向键 keymap、`Prec.highest` 的 `Mod-s`/`Mod-b`/`Mod-i`，最后才是 `defaultKeymap`/`historyKeymap`/`searchKeymap`/`indentWithTab`。

**decoration 计算**：`livePreview` 的 `decorationsField` 是 StateField——块级 decoration 不能来自 ViewPlugin。`buildDecorations` 分四段：语法树遍历（标题行 class、列表符号、任务框、行内链接、callout/table/code 的整块 replace、标记隐藏）、`mathBlockRefs` 的 `$$` 块、frontmatter 行、逐行 regex 与嵌入（`collectRegexDecorations` + `collectEmbeds`）。增量更新走 `needsFullRebuild`（结构字符、超 2000 字符、fold/source effect 触发全量）→ `computeWindow`（选择、变更、容器会话、折叠涉及的行窗口）与 `treeAdvanceWindow`（后台解析推进）→ `mergeDecorations` 只替换窗口内的装饰。`parseViewportOnDemand` 用 `forceParsing` 保证滚到未解析区域也能立刻出装饰。

**块 widget 与原子范围**：`CodeBlockWidget`、`TableWidget`、`CalloutWidget`、`MathBlockWidget`、`EmbedPreviewWidget` 都以 `Decoration.replace({ block: true, widget })` 形式替换整块源码；`atomicRanges` 只收集 `spec.block && spec.widget` 的 replace 区间，所以块被替换时方向键会跨过它，而源码会话或选中块时 replace 消失、原子性自动解除。widget 的 `eq` 按内容与语义比较（语言/正文/表格内容/session id/target），不比较整块绝对位置，因此上方编辑把 widget map 到新位置时不会重建正在编辑的块（行内 `MathWidget` 例外：它用构造时记录的点击锚点做比较）。

**选区与焦点映射**：会话里的 `anchor`/`restore` 是逻辑源码位置，`beginBlockSession`/`endBlockSession` 用 `caretOutsideBlock` 找块后的可见行；提交后用 `outsideCaretAfterChanges` 计算提交后的落点；`commitActiveBlock(view, focusView, preserveSelection)` 的 `preserveSelection` 让「点击别处」这类外部提交不覆盖刚设好的新选区。唯一持有 DOM 焦点的是当前活动的局部控件；主 CM 只在源码会话或普通文本时真正聚焦。

## 6. 块会话生命周期

`BlockSession`（`blockState.ts`）字段：`id`（单调递增，旧回调靠它失效）、`kind`、`mode`（`container` 卡片内编辑 / `source` 整块源码）、`from`/`to`（随 `ChangeSet` 映射）、`anchor`（逻辑锚点）、`restore`（无改动退出时光标回到哪）、`target`（具体单元格/行/标题/正文）。一个 `EditorView` 同时最多一个会话；`activeEditors` 是 `WeakMap<EditorView, ActiveBlockEditor>`，`registerBlockEditor` 由 widget 在 `toDOM` 时注册、`destroy` 时注销。

进入方式：

- **单击卡片**：`CodeBlockWidget`/`TableWidget`/`CalloutWidget` 的 `mousedown` 把点击点映射成 `BlockTarget`，再调 `activateBlockFromDom`（先提交已有会话，再用 `view.posAtDOM` 重新解析当前 `BlockRef`，最后 `beginBlockSession`）。
- **右键**：`NoteEditor.handleEditorContextMenu` 先判断是否点在 callout 正文的嵌套编辑器里（`EditorView.findFromDOM`），再由 `blockAt` + `blockMenuItems` 生成菜单；「编辑」= `enterBlockContainer`，「编辑源码」= `enterBlockSource`。
- **方向键**：`focusAdjacentBlock`/`blockBoundaryKeydown` 先把块标成 `focusedBlock`（描边、光标隐藏），再按 Enter 或 Ctrl/Cmd+Enter 由 `editFocusedBlock` 走 `ContainerSpec.entry`；`container: false` 的嵌入直接进源码会话。
- **嵌入**：卡片工具栏的 `onEditSource` 直接 dispatch 一个 `mode: "source"` 的会话。

写入与退出：

- 草稿只存在 DOM 里，不逐键 dispatch。提交时 widget 重新解析 `BlockRef`（`writeCodeBody`、`writeTableCell`、`writeCallout`、`writeMathBody`），把规范化后的文本与当前内容比较：**未变化走 `closeUnchangedSession`（不产生事务，恢复 `restore` 光标）**，有变化则一个事务里同时写 changes、`setBlockSession(null)`、提交后的选区（除非 `preserveSelection`）。
- 没有「丢弃草稿」的通用路径：容器字段的 Esc 也是提交（`bindContainerField`）；只有源码会话的 Esc（`exitBlockEdit`）只是关闭会话，因为源码本来就是实时编辑。表格已提交的单元格不会因后续取消而回滚。
- 焦点兜底：`commitContainerOnFocusOut` 在 rAF 后检查 session id 和真实 `document.activeElement`，编辑器外点击不调用 `view.focus()`，让侧栏/工具栏正常取焦点。`NoteEditor.handleEditorMouseDownCapture` 则在「有容器会话且点在普通文本上」时先 `preventDefault` 设好新选区，再以 `preserveSelection` 提交旧草稿——保证第一次点击就落到目标位置。

键位协议：

| 场景 | 键 | 行为 |
|---|---|---|
| 容器字段 | `Esc` / `Ctrl/Cmd+Enter` | 提交并退出（`commit(true)`） |
| 容器字段 | `Ctrl/Cmd+S` | 先提交，再 `hooks.onSave()` |
| 容器字段 | `Enter` | 按 `ContainerField.enter`：`newline`（代码正文）/ `focus`（callout 标题→正文）/ `commit`（表格单元格） |
| 容器字段 | `Tab` / `Shift-Tab` | 按 `tab`：`indent`（代码块缩进）/ `focus`（callout 标题↔正文）/ `cells`（表格相邻格，末格追加一行） |
| 聚焦块 | `Enter` | 上/下插入段落（Shift 反向） |
| 聚焦块 | `Delete`/`Backspace` | 删除整块（`deleteBlockSource`） |
| 聚焦块 | 方向键 | 离开块或跳到相邻块 |
| 聚焦块 | 其他单字符、`Tab` | 吞掉，避免改到卡片下面的隐藏源码 |
| 源码会话 | `Esc` | `exitBlockEdit`；选区离开块范围时 `blockSessionField` 也会自动清空 |

## 7. 容器注册表

`containers/registry.ts` 是唯一的按 kind 分发表：模块加载时 `registerContainer` 五个 spec，`containerSpec(kind)` 在缺注册时直接抛错，`containerEntry(ref, target)` 委托给对应 spec 的 `entry`。`ContainerSpec`（`containers/types.ts`）的职责都在这几个字段里：`kind`、`container`（是否有卡片内编辑模式）、`entry(ref, target)` → `{ target, anchor }`、`sourceAnchor(ref)`、可选的 `menu(ctx)`、`deleteLabel(t)`。公共菜单项（编辑/编辑源码/上下插段落/删除）由 `blockMenu.tsx` 拼装，spec 只追加自己的段落。

| spec | 文件 | 分工 |
|---|---|---|
| code | `containers/code.ts` | 进入正文起点；菜单：语言、复制、折叠 |
| table | `containers/table.ts` | 从 `[data-cell-row]`/`[data-cell-col]` 定位单元格；菜单：行列增删、对齐、删除 |
| callout | `containers/callout.ts` | 正文是主编辑面；标题靠点击标题进入（`target.part: "title"`），标题上 Tab/Shift+Tab 都前进到正文；菜单：类型切换 |
| math | `containers/math.ts` | 进入 TeX 正文偏移；无专属菜单 |
| embed | `containers/embed.ts` | `container: false`，只有源码入口；菜单：复制语法（源码态为空） |

`containers/bind.ts` 是所有容器共用的键位/焦点协议；`ContainerField` 的 `enter`/`tab` 策略与 `nextField`/`onTab` 回调决定了上面那张键位表。

新增一种块类型需要动的入口（只列位置，步骤见 [recipes](../guides/recipes.md)）：`blockState.ts` 的 `BlockKind`/`BlockTarget` → `blockModel.ts` 的 `BlockRef` 联合与 `blockAt` → 新模型文件（参照 `mathModel.ts`）→ `blockRender.ts` 或 `mathRender.ts` 的 widget → `livePreview.ts` 的 `buildDecorations`（新 replace 分支）、`computeWindow`/`renderBlockRangeAt`（增量窗口）→ 在 `src/components/editor/containers/` 新增 spec（参照 `containers/math.ts`）并在 `registry.ts` 注册 → `blockSession.ts` 的初始文本与写回函数 → i18n 文案与 `src/index.css` 卡片样式。

## 8. 嵌入、图片与附件

链路：`saveAttachment`/`pickAttachment` 落盘 → `imagePathFor` 生成引用 → 源码里写入 `![[target]]` → 渲染时 `assetUrl.ts` 转成 `prism-file://` URL；编辑态由 `embedBlockModel` 解析同一段源码。

- `window.prism.saveAttachment(vaultPath, ext, bytes)` 把剪贴板图片写成 `<vault>/<attachments_dir>/<YYYY-MM-DD-HHmmss>.<ext>`，返回 vault 相对、正斜杠的 ref；私有仓库走加密分支并要求已解锁。`InsertModal` 的「图片」用 `window.prism.pickAttachment`，效果相同。
- `imagePathFor` 按 `image_path_style` 设置生成 `note`（相对笔记目录，`../attachments/x.png`）、`vault`（库根相对）、`name`（仅文件名）三种引用。粘贴与插入统一得到 `![[...]]`，不是标准 `![](...)`。
- `assetUrl.ts` 的 `assetSrc`/`prismFileUrl` 把本地 ref 变成 `prism-file:///asset?vault=…&ref=…&dir=…&pv=…`；`bumpAssetEpoch` 在私密仓库锁定/解锁后让 URL 失效重建。
- 编辑态：`embedBlockModel.collectEmbeds` 同时识别 `![[...]]` 与 `![alt](src)`；独占整行的嵌入被 `EmbedPreviewWidget` 整行替换成卡片，混合行保留源码并在行尾挂一个预览 widget。卡片可以改尺寸/label（`commitEmbedChange` 改写源码）、复制语法、删除该嵌入语法（整行只剩它时连行一起删，`deleteEmbedAt`）、编辑源码（开源码会话）。
- 阅读态：`markdown.ts` 的 `embedRule`/`wikilink_embed` 规则对 `image`/`link` 直接输出 HTML，对 `canvas`/`note`/`pdf` 输出占位，再由 `hydrateMarkdown` → `mountEmbedCard` 挂独立 React root；`src/components/embeds/loader.ts` 负责解析目标、缓存与失效，打开动作通过 `EmbedOpenTarget` 交回工作区。
- 尺寸 token 由 `imageSize.ts` 的 `parseImageAlt`/`parseSizeToken` 解析（`宽` 或 `宽x高`），`withSizeInAlt`/`serializeEmbedSpec` 写回；渲染前经 `clampEmbedSize` 收敛到卡片预览范围。

## 9. 保存、CRLF、外部重载与视图切换

- **自动保存**：每次非 remote 的 `docChanged` 调 `scheduleSave`（置 dirty + `useAutosaveTimer` 重排，延迟取 `autosave_delay`）。`doSave` 先清定时器；**存在容器会话时只重排定时、不落盘**（避免保存半提交状态）；其余情况仅在 dirty 时保存，且在 `await` 之前清 dirty，期间的新编辑会重新排一次保存。失败时 `VAULT_LOCKED` 只 toast、其他错误按「笔记已删除」处理并回调 `onNoteGone`。
- **CRLF**：载入时用 `note.content.includes("\r\n")` 记住 `crlfRef`，CM doc 内始终是 LF；保存时统一替换成 `\r\n`。外部重载时先归一化成 LF 再比较。不要假设 `doc.toString()` 能原样写回文件。
- **Ctrl/Cmd+S**：CM keymap 的 `Mod-s` → `hooks.onSave` → `doSave`；容器字段内的 `Mod-s` 被字段自身拦下，先提交再保存。Unmount 时先 `commitActiveBlock`、再存一次、再 `destroy`。
- **外部重载/冲突**：`onVaultUpdated` 在 dirty 或存在容器会话时直接跳过；否则读文件、比较后以 `Transaction.remote` + `addToHistory: false` 整篇替换（外部改动不可撤销），`updateListener` 发现所有事务都带 `remote` 标注时不触发自动保存。目前没有「双方都改」的合并 UI：有未保存修改时外部改动被忽略。
- **阅读⇄编辑锚点**：切换前 `captureScrollAnchor(mode)` 记录「标题序号 + 段内比例 + 滚动比例 + 视口中线处的文本 token」；恢复在 `useLayoutEffect` 里做，编辑态先用比例粗定位、再 rAF 用 token 精修（CodeMirror 自己测量远距离块），阅读态同步测量（DOM 已在 layout effect 前提交）。标题索引两种模式含义一致（源文档 ATX 标题顺序 vs 渲染标题顺序），所以能跨模式对齐。
- **大纲**：阅读态用 `env.outline`（`hd-N` id）配合 `scrollend` 计算高亮；编辑态用 `sourceHeadings`（跳过 fenced code）把 1-based 行号当 id，`jumpToEditHeading` 用 `EditorView.scrollIntoView(..., { y: "start" })` 并加 `jumpLock` 防抖。编辑态只有「可能改到标题集合」的变更才重扫大纲。
- **折叠**：阅读态 `MarkdownPreview` 把每个标题的后续兄弟节点包进 `.md-fold-body`，状态由 `folds.ts` 持久化到 localStorage 的 `prism_md_folds`，键是 `h{level}:{text}#{occurrence}`；折叠体是 `display: none`，大纲跳转前先用 `unfoldRef` 展开。编辑态只有代码块折叠（`codeFoldField` + `toggleCodeFold`），`toggleCodeFoldAt` 会先把选区挪到块外，`needsFullRebuild` 对 fold effect 做全量重建。标题折叠目前只有阅读视图消费。

## 10. 不变量与坑

1. **每个窗格只有一个主 `EditorView`**；不要为块新建常驻 CM 视图。唯一例外是 callout 正文的嵌套视图（`calloutSubEditor.ts`），它有自己的会话与 decoration 栈；分屏是两个独立 `EditorView`，会话互不影响。
2. **Markdown 源唯一**：widget/会话不保存内容，提交必须写回 CM doc，保存只序列化 doc。不要为卡片另建状态再「同步」。
3. **阅读视图渲染 `docText` 快照**，只在切换模式、外部重载、任务勾选时刷新；不要指望阅读态实时反映编辑中的 doc。
4. **widget 比较内容而非绝对位置**：`eq` 比语言/正文/表格内容/session/target（行内 `MathWidget` 是例外，它比点击锚点），块位置一律在提交时用 `view.posAtDOM` + `blockAt` 反查。存绝对位置会在上方编辑后指向错误内容。
5. **同一 `EditorView` 最多一个活动块**：`activateBlockFromDom` 先提交旧会话，`blockSessionField` 只存一个。父 callout 提交前必须 `nested.flushActiveBlock()`，否则子块草稿丢失。
6. **块是黑盒**：`focusedBlockKeydown` 吞掉可打印字符与 `Tab`；块边界 Backspace/Delete 第一次只聚焦、第二次才删；删除统一走 `deleteBlockSource`（会连带吃掉相邻换行），不要自己拼 `from`/`to`。
7. **方向键不能进入隐藏源码**：`atomicRanges` 只覆盖整块 replace；渲染态表格的 `tableTab` 返回 `true` 但不移动光标；块内移动由 `focusAdjacentBlock`/`moveOutOfBlock` 负责。
8. **callout 正文是独立编辑器**：`escapePolicy` 只在子编辑器内部没有活动块/聚焦块时才把 Esc、Ctrl/Cmd+Enter 交给父会话；`onCommit` 用 `queueMicrotask` 推迟，避免在自身 keydown 中销毁 widget。
9. **粘贴/插入图片产出 `![[target]]`**（不是 `![]()`）；ref 是库内正斜杠相对路径，显示时才转 `prism-file://`；私有仓库未解锁会 toast 失败，别吞异常。
10. **React 严格模式**：`MarkdownPreview` 的折叠 effect 有幂等 guard 和 `foldBuildKeyRef`，`mountEmbedCard` 用 rAF 延后 `createRoot`（react#37804），`NoteEditor` 的建视图 effect 用 `cancelled` 防泄漏。重跑 effect 不能重复包折叠体或重复挂 React root。
11. **块级 decoration 必须来自 StateField**（`decorationsField`），不能由 ViewPlugin 动态给出；ViewPlugin 只做 `parseViewportOnDemand`、聚焦高亮这类无 block decoration 的事。
12. **外部重载不写回**：`Transaction.remote` 的 update 不排自动保存；有 dirty 或容器会话时 watcher 更新被忽略；会话字段遇到 remote 事务直接清空。
13. **任务勾选是整篇替换**：`handleToggleTask`/`toggleTaskInSource` dispatch 一个覆盖全文的 change，撤销粒度是整篇，不是单行。
14. **表格提交要重新解析**：`writeTableCell` 用当前 DOM 反查 model；追加行与单元格写入必须在同一事务里，分开 dispatch 会让 widget 中途被拆掉。

## 11. 改动地图

| 要改什么 | 先看哪个文件 |
|---|---|
| 阅读视图的 Markdown 语法/输出 | `src/components/editor/markdown.ts`（core/inline/renderer 规则），再看 `src/components/editor/MarkdownPreview.tsx` |
| 编辑态显隐、卡片替换、性能 | `src/components/editor/livePreview.ts`（`buildDecorations`、`computeWindow`、`needsFullRebuild`） |
| 某类块的点击进入/写回/焦点 | 对应 widget（`src/components/editor/blockRender.ts`、`mathRender.ts`）+ `src/components/editor/blockSession.ts` |
| 右键菜单项 | `src/components/editor/blockMenu.tsx` + `src/components/editor/containers/` 下对应 spec 的 `menu` |
| 键盘行为（Esc/Enter/Tab/方向键） | `src/components/editor/containers/bind.ts`（容器内）、`blockFocus.ts`（块聚焦）、`cmExtensions.ts`（全局 keymap） |
| 新增一种块类型 | 第 7 节入口清单，起点 `src/components/editor/blockState.ts` 与 `blockModel.ts` |
| 嵌入卡片行为/加载/缓存 | `src/components/embeds/EmbedCard.tsx`、`src/components/embeds/loader.ts`、`src/components/embeds/model.ts`；编辑态在 `livePreview.ts` 的 `EmbedPreviewWidget` |
| 图片路径/尺寸/附件 | `src/components/editor/imagePath.ts`、`imageSize.ts`、`cmExtensions.ts` 的粘贴/拖放、`electron/main.ts` 的 `vault:save-attachment` |
| 自动保存/CRLF/外部重载 | `src/components/editor/NoteEditor.tsx`（`doSave`/`scheduleSave`/`onVaultUpdated`）、`src/lib/useAutosave.ts` |
| 阅读⇄编辑锚点、大纲、折叠 | `src/components/editor/NoteEditor.tsx`（`captureScrollAnchor`）、`MarkdownPreview.tsx`（`jumpToHeading`）、`folds.ts` |

## 12. 验证

自动检查只有一条：

```bash
npm run verify
```

它等于 `npm run lint`（`tsc --noEmit`）+ `npm run docs:check`（文档路径、链接、IPC/设置/i18n 契约、生成物新鲜度）。UI 行为不做自动化测试，由用户执行 `npm run electron:dev` 手动验收。

Markdown 渲染冒烟测试（`scripts/md-smoke-test.mjs` 从 `out/` 导入，所以必须先构建两个 bundle，再运行脚本）：

```bash
npx esbuild src/components/editor/markdown.ts --bundle --format=esm --platform=node --outfile=out/md-test.mjs
npx esbuild src/components/editor/taskToggle.ts --bundle --format=esm --platform=node --outfile=out/task-toggle.mjs
node scripts/md-smoke-test.mjs
```

它覆盖 frontmatter、callout 家族与标题/正文拆分、wikilink/嵌入、KaTeX、图片尺寸、代码高亮、表格 nowrap、HTML 转义与任务切换。改动 `markdown.ts`、`callouts.ts`、`imageSize.ts`、`embedBlockModel.ts`、`taskToggle.ts` 后应重跑。

UI 手测清单（按风险排序）：

1. 阅读⇄编辑各切一次，长文档来回切换位置不跳；无标题文档退回滚动比例。
2. 表格：点单元格直接编辑、Tab/Shift-Tab 跨格、末格 Tab 追加行、行列/对齐菜单、编辑源码。
3. 代码：点具体行进入、语言切换、复制、折叠/展开、Tab 缩进、编辑源码。
4. callout：点标题改标题、点正文按行定位、类型切换、正文里嵌套表格/代码/公式/嵌入。
5. 公式：行内 `$…$` 可点、`$$` 块点击进入 TeX 编辑、KaTeX 出错不炸页面。
6. 嵌入：图片/note/canvas/PDF/链接各一张，打开、改尺寸、改 label、复制语法、删除、编辑源码。
7. 图片：剪贴板粘贴、拖放、插入弹窗三条路径都能落盘并显示，引用风格随 `image_path_style` 变化。
8. 自动保存：输入后等 `autosave_delay`、Ctrl/Cmd+S、外部改文件、切走再切回；CRLF 文件保存后仍是 CRLF。
9. 分屏：两个窗格各自打开块编辑、互不抢焦点，工具栏与模式切换只作用于聚焦窗格。
