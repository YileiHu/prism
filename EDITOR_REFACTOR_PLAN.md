# Prism 笔记编辑器：统一块容器与选区重构方案

## 1. 背景与目标

当前仓库笔记编辑模式中，普通标题、表格、代码块、Callout、公式和卡片之间存在点击无光标、第一次点击失效、方向键从旧位置移动等问题。

本次改造不继续零散修补事件，而是建立一套稳定、统一、可扩展的块编辑架构：

- **点哪里改哪里**：普通文本保持 CodeMirror 原生精确选区；块内容单击后直接编辑。
- **结构统一**：表格、代码、Callout、公式、Embed 共用块身份、会话、菜单、焦点和视觉生命周期。
- **性能稳定**：避免无关选区变化重建活动编辑器，减少全文扫描和重复渲染。
- **视觉一致**：保留 Markdown 数据源、现有右键菜单、Embed 卡片和主题体系。

已确认采用 **“直接编辑内容”**：表格点击进入单元格，代码、Callout、公式在原容器内编辑；右键继续提供源码和结构操作。不采用“单击后展开整段 Markdown 源码”的默认交互。

---

## 2. 当前实现的主要问题

### 2.1 原子块没有普通点击入口

`livePreview.ts` 将表格、代码、Callout、数学块和独占行 Embed 替换成非零宽 block widget，并加入 `atomicRanges`。

这些 widget：

- 根节点为 `contentEditable=false`。
- 默认忽略 CodeMirror 鼠标事件。
- 非编辑状态没有将点击位置映射到可编辑目标的逻辑。
- 方向键经过 CodeMirror 的 `skipAtoms`，会跨过整个块。

因此，点击块内内容没有正常 caret、方向键跨块是当前结构的直接结果。

### 2.2 主编辑器与子编辑器各自维护焦点和选区

当前同时存在：

- `BlockEditRange`：完整源码编辑。
- `ContainerEditRange`：保留卡片外观的局部输入。

`enterContainerEdit` 不同步主选区，textarea/input 随后通过 rAF 抢焦点；提交函数也只修改文档和退出状态，不恢复明确的主选区。

结果是完成编辑或点击外部后，方向键可能从进入容器前的旧位置继续移动。

### 2.3 外部点击在默认选区之前提交旧草稿

`NoteEditor.tsx` 的 `mouseDownCapture` 会先提交活动容器，旧块随即重建并可能调用 `view.focus()`，而浏览器尚未处理本次点击的选区。

这容易造成：

- 第一次点击只退出容器。
- 普通标题没有取得 caret。
- 需要第二次点击才能编辑。

### 2.4 块模型和菜单已经分叉

`blockModel.ts` 目前只识别 code/table/callout；math/embed 依赖 DOM dataset 和独立分支。

因此以下能力无法自然复用：

- 右键定位。
- 当前块重新解析。
- 范围映射。
- 编辑状态。
- 菜单骨架。
- 增量 decoration 重建。

### 2.5 普通标题还有独立问题

普通 ATX 标题不是原子块，不能完全归因于容器：

- HeaderMark 随选区显隐，点击后文字会水平移动。
- 阅读切换到编辑时没有主动恢复主编辑器焦点。
- Outline 等浮层在窄分屏下可能覆盖正文命中区域。
- `caretColor: rgb(var(--accent))` 与 hex 格式的 `--accent` 不匹配，声明无效。

### 2.6 性能热点

- 数学块在窗口计算和 decoration 构建中重复全文扫描。
- `sameContainerState` 没有比较完整范围，可能误复用旧编辑 DOM。
- replace 区间重叠检查在线性数组上执行，装饰密集时成本增加。
- 子编辑器 auto-grow 存在同步读写布局。

---

## 3. 总体架构

### 3.1 保留一个主 CodeMirror

不引入 Slate、Lexical、ProseMirror，不为每个块常驻一个嵌套 CodeMirror，也不将文档改成 HTML 状态。

- Markdown 源码仍是唯一持久化数据。
- 非活动块继续使用渲染 widget。
- 每个 EditorView 同一时间最多一个活动块会话。
- 只有当前被编辑的局部区域创建 input/textarea。
- 双分屏通过 EditorView 隔离各自会话。

**统一的是协议和生命周期，不是强迫所有块使用同一个 textarea。**

### 3.2 统一 BlockRef

公共范围：

```ts
interface BaseBlockRef {
  kind: "code" | "table" | "callout" | "math" | "embed";
  from: number;
  to: number;
  replaceFrom: number;
  replaceTo: number;
}
```

各类型扩展自己的信息并组成可判别 union：

- CodeBlockRef：fence、info、bodyFrom/bodyTo、语言、代码行。
- TableBlockRef：行、列、单元格和 pipe 的精确范围。
- CalloutBlockRef：类型、标题、正文和引用前缀范围。
- MathBlockRef：分隔符和 TeX 正文范围。
- EmbedBlockRef：语法范围、label/size 范围和 EmbedSpec。

每个块适配器只负责类型私有工作：

1. 解析 BlockRef。
2. 将 DOM 命中位置转换成 BlockTarget。
3. 创建渲染和局部编辑 DOM。
4. 读取、序列化和提交草稿。
5. 提供首/尾键盘进入目标。
6. 提供类型专属菜单。

公共层统一负责范围映射、session、事务、焦点、源码模式、原子范围、菜单骨架、上下插入段落和清理。

### 3.3 统一 BlockTarget

```ts
type BlockTarget =
  | { kind: "code"; part: "body"; line: number; offset: number }
  | { kind: "table"; row: number; col: number; offset: number }
  | { kind: "callout"; part: "title" | "body"; line?: number }
  | { kind: "math"; part: "body" }
  | { kind: "embed"; part: "label" | "source" };
```

点击映射只使用可验证的源码范围，不再用块边界猜测：

- 代码定位到具体行和字符偏移。
- 表格定位到具体单元格。
- Callout 区分标题和正文，正文定位到具体源码行。
- 公式定位到 TeX 正文。
- 富文本和 KaTeX 不从渲染 HTML 反推不可靠的字符级源码位置。

---

## 4. 单一 BlockSession

### 4.1 状态结构

将 `BlockEditRange` 和 `ContainerEditRange` 合并为一个会话：

```ts
interface BlockSession {
  id: number;
  kind: BlockKind;
  mode: "container" | "source";
  from: number;
  to: number;
  target?: BlockTarget;
  anchor: number;
}
```

字段含义：

- `id`：单调递增，忽略旧 rAF、旧异步渲染和重复 blur 提交。
- `mode`：区分容器编辑和完整源码编辑。
- `from/to`：随文档 ChangeSet 映射。
- `target`：当前单元格、标题或正文目标。
- `anchor`：进入和提交时对应的逻辑源码位置。

StateField 只保存可序列化描述。草稿留在活动 DOM 中，不在每次按键时 dispatch CM transaction。

### 4.2 会话协调器

将 `containerEdit.ts` 重写为统一的 `blockSession.ts`，每个 EditorView 用 WeakMap 注册当前 controller：

```ts
interface BlockSessionController {
  activate(...): void;
  switchTarget(...): void;
  commit(...): void;
  cancel(...): void;
  finish(...): void;
  dispose(...): void;
}
```

要求：

- 所有提交、取消和退出幂等。
- 销毁时只允许清理同一会话 id。
- Effect 中携带的新范围必须显式通过同一个 ChangeSet 映射。
- 完整比较 session id、from/to、mode 和 target。
- 旧会话的 blur、rAF、highlight、Markdown、KaTeX 回调不得抢回焦点。
- 有未提交草稿时，与 dirty 一样阻止 remote reload 静默覆盖。

---

## 5. 焦点与选区不变量

1. **普通文本**：只有主 CodeMirror 拥有焦点和选区，走原生鼠标、IME 和方向键流程。
2. **容器会话**：只有活动子控件拥有 DOM 焦点；主选区只是逻辑锚点，不再同时调用 `view.focus()`。
3. **源码会话**：块替换被移除，主 CodeMirror 在可见源码内拥有真实选区。
4. **无会话**：主选区不得停留在隐藏 replace range 内；退出时使用下一可见行，没有下一行则使用块前边界。
5. **先选区后焦点**：任何 `view.focus()` 前必须先确定合法 selection。
6. **旧回调失效**：旧会话的异步回调不能修改新会话焦点或草稿。

---

## 6. 统一事件协议

### 6.1 单击块

1. 只接管左键文本目标；按钮、链接、复制、语言、折叠和 Embed 打开层继续执行自己的动作。
2. 块根在 mousedown 中处理原子 widget 点击。
3. 使用当前 `view.posAtDOM` 重新解析 BlockRef，避免使用旧位置。
4. 将事件目标映射到具体 BlockTarget。
5. 若已有会话，读取旧草稿但不聚焦主编辑器。
6. 旧草稿 changes、新块范围、新 session effect 和逻辑 anchor 尽量在同一个事务中提交。
7. 新活动控件在下一帧聚焦；旧 session id 的回调直接失效。

### 6.2 编辑容器时单击普通正文

替换当前“capture 阶段先 commit，再让浏览器尝试选区”的顺序：

1. 仅在有活动容器会话且目标位于当前块外时介入。
2. 对普通 CM 文本，先用 `posAtCoords` 取得点击位置并 `preventDefault`。
3. 将旧草稿 changes、结束 session、经 ChangeSet 映射后的点击 selection 放在同一事务中。
4. 事务完成后聚焦主编辑器。
5. 对另一个块，交给该块的激活流程。
6. 对菜单和按钮，不强行设置文本 caret。
7. 编辑器外点击由 focusout 兜底提交，不调用 `view.focus()`，保证侧栏等控件正常取得焦点。

由此保证第一次点击就能到达新位置。

### 6.3 完成、取消和切换

- **Done**：提交当前草稿，退出会话，焦点落到确定的块外可见位置。
- **外部点击**：提交旧草稿，同时焦点和选区落到新点击目标。
- **Escape**：只取消当前未提交草稿；表格此前已经提交的单元格不回滚。
- **Ctrl/Cmd+S**：先同步提交，再从最新 `view.state.doc` 保存。
- **Tab / Shift+Tab**：表格提交当前格并激活前/后一格；代码和 Callout 保持缩进语义。
- **blur/focusout**：仅作为兜底，先检查 session id 和实际新焦点，不与 Done、菜单、单元格切换重复提交。

### 6.4 方向键

- 未激活块仍为原子范围，不允许 caret 进入隐藏源码。
- 在主编辑器块边界增加高优先级方向键处理。
- 对 code/table/callout/math，朝块内移动时激活适配器提供的首/尾目标，而不是跳过整块或回到旧选区。
- 子编辑器内部方向键先走原生行为，到首尾边界再按协议离开。
- Embed 没有连续正文，保留为单个导航单元。

---

## 7. 各块的最终交互

| 块 | 单击默认行为 | 保留的专属能力 |
| --- | --- | --- |
| 代码 | 点击正文直接进入该代码行，保留卡片框和头部 | 复制、语言、折叠、Tab 缩进、编辑源码 |
| 表格 | 点击哪个单元格就编辑哪个，其他格继续渲染 | 行列、对齐、删除、Tab/Shift+Tab、编辑源码 |
| Callout | 点击标题改标题，点击正文改正文 | 类型、图标、正文 Markdown、编辑源码 |
| 公式块 | 点击公式进入同容器 TeX 编辑器，保留局部预览 | KaTeX 错误降级、编辑源码 |
| Embed | 保留打开、label 和尺寸编辑 | 复制语法、删除、尺寸、打开、编辑源码 |

公式编辑时，KaTeX 预览按 rAF 或短防抖更新，输入本身不触发全文 CM 更新。

Embed 只有独占一行时才是一等原子块；混合行仍保留源码和附加预览。

---

## 8. 普通标题与外围焦点

- 标题 `#` 标记不再随选区隐藏/显示而导致文字横向跳动。
- 编辑态固定显示弱化的标题标记，标题文字继续使用 `--md-h*`。
- 其它行内标记的构造级显隐暂不修改。
- `caretColor`、`.cm-cursor`、`.cm-dropCursor` 改用有效的 `var(--accent)` 或 `rgb(var(--accent-rgb))`。
- 阅读切编辑时恢复上次合法 selection 并聚焦。
- 切阅读前提交活动草稿，再生成 `docText`。
- 检查 Outline 等 absolute 浮层的实际命中区域，窄分屏下不能用透明区域遮挡正文。

---

## 9. 菜单、工具条和视觉

### 9.1 菜单

将 `NoteEditor.tsx` 中按块类型重复的右键分支提取到 `blockMenu.tsx`。

公共骨架统一生成：

- 编辑 / 完成编辑。
- 编辑源码。
- 上方插入段落。
- 下方插入段落。

适配器只追加专属项目：

- 表格行列、对齐和删除。
- 代码语言、复制和折叠。
- Callout 类型。
- Embed 复制、删除、尺寸和打开。

继续复用：

- `useContextMenu`
- `ContextMenu`
- `DropdownMenuItem`
- 现有 `MenuItem`

不新建另一套菜单体系。

### 9.2 工具条和 DOM

从 `blockRender.ts` 抽取公共原生 DOM frame/header/button/editor 生命周期。

- 普通块不新增 React root。
- Embed 保留现有独立 React root。
- 工具条沿用当前代码头部和 Embed toolbar 的视觉语言。
- 活动边框预留尺寸，避免激活时布局跳动。

### 9.3 样式

共用块边框、圆角、间距、头部高度、hover/focus/editing 状态。

继续复用：

- `.markdown-preview`
- `.md-table-wrap`
- `.callout`
- `.md-code`
- `.md-embed-*`
- 项目语义色 token

统一目前分散的 6px、1.7em 等块间距覆盖。新增文案同步 `i18n/zh.ts` 和 `i18n/en.ts`。

---

## 10. 共用渲染后处理

将 `MarkdownPreview.tsx` 的后处理提取为可清理的 `markdownHydration.ts`：

- Callout 图标。
- 异步 Embed 挂载。
- wikilink 和普通链接打开。
- 任务点击。
- React root 和事件 cleanup。

阅读器、TableWidget、CalloutWidget 都使用同一管线。

容器内 Embed 默认只读，避免嵌套第二套属性编辑会话。任务切换必须通过 source-aware 回调映射，不能直接套用阅读器的错误全局索引。

---

## 11. 性能方案

1. **数学块索引**：进入 StateField 或等价缓存；纯 selection 更新复用结果，普通输入映射旧范围，只有 `$$`/fence 等结构变化才重新扫描。
2. **同次更新只计算一次**：窗口计算和 decoration 构建共享数学块结果。
3. **保留窗口化 decoration**：继续复用现有增量更新和 viewport parsing。
4. **完整 Widget.eq**：比较完整 session，无关选区变化不拆活动输入框，旧 session 也绝不复用。
5. **replace 区间有序查询**：避免装饰密集时反复线性重叠检查。
6. **本地草稿**：子编辑器输入只更新本地 DOM，不持续产生 CM transaction。
7. **auto-grow 集中测量**：读写布局放入 rAF，避免连续同步布局。
8. **保留现有懒加载和缓存**：highlight、KaTeX、Markdown、Embed loader 不另造体系。

暂不引入 Worker、整个 CM 文档虚拟化或全文档块索引。

---

## 12. 文件级调整

### 核心重写

- `src/components/editor/blockState.ts`
  - 统一 BlockSession StateField。
  - 保留 codeFoldField。
- `src/components/editor/containerEdit.ts` → `blockSession.ts`
  - 唯一会话协调器。
  - 删除旧的单 commit WeakMap 接口。
- `src/components/editor/blockModel.ts`
  - 公共 BlockRef、BlockTarget、统一 `blockAt` 和适配器入口。
- `src/components/editor/blockRender.ts`
  - 公共 Widget/frame 生命周期。
  - 去掉重复的 textarea 焦点代码。
- `src/components/editor/livePreview.ts`
  - 只负责装饰编排。
  - 将块识别和 math/embed 特判移到适配器。

### 新增或拆分

- `mathModel.ts` / `mathRender.ts`
- `embedBlockModel.ts`
- `blockMenu.tsx`
- `markdownHydration.ts`

### 外围修改

- `NoteEditor.tsx`
  - 删除旧 capture commit 和大块右键分支。
  - 接入 session coordinator。
  - 处理模式切换和草稿 dirty。
- `cmExtensions.ts`
  - 块边界方向键、表格 Tab 新接口、光标颜色。
- `MarkdownPreview.tsx`
  - 改用共享 hydration。
- `src/index.css`
  - 统一块 frame、编辑态、间距和命中样式。
- `src/i18n/zh.ts` / `src/i18n/en.ts`
  - 对齐新增菜单和编辑文案。

### 直接复用

- `tableModel.ts`：cell range、`flatTableCells`、`tableCellAt`、`sameTableModel`。
- `blockActions.ts`：表格结构操作、代码语言/折叠、Callout 类型、上下插入段落。
- `callouts.ts`：`stripCalloutBody`、`prefixCalloutBody` 和类型定义。
- `codeHighlight.ts`、`codeLanguages.ts`、`markdown.ts`、`imageSize.ts`。
- `components/embeds/EmbedCard.tsx`、`embedMount.tsx`、`loader.ts`。
- `ContextMenu.tsx`、`DropdownMenu.tsx`、`useContextMenu.tsx` 和主题 token。

---

## 13. 实施顺序

### 阶段一：先修选区所有权

- 落地 BlockSession 和协调器。
- 接入现有 code/table/callout。
- 实现单击激活、首次外部点击、提交后选区和完整 session eq。

此阶段优先消除主要根因。

### 阶段二：补齐普通文本焦点

- 固定标题标记。
- 修正 caret。
- 修复模式切换和浮层命中。
- 统一主编辑器块边界方向键。

### 阶段三：统一五类块

- math/embed 纳入 BlockRef、菜单和会话。
- 增加 Callout 标题编辑。
- 增加公式容器编辑。
- 保留 Embed 现有卡片行为。

### 阶段四：统一呈现

- 抽取公共 frame、menu、hydration 和样式。
- 清理 dataset 定位和重复渲染路径。

### 阶段五：性能与收尾

- 数学索引、replace 区间和布局优化。
- 删除旧字段和旧提交路径。
- 类型检查及完整手工回归。

每阶段保持编辑器可用，并运行类型检查，避免把解析、视觉和性能重构混成一次不可定位的大切换。

---

## 14. 验证方案

自动检查仅运行：

```bash
npm run lint
```

不运行截图、CDP 或其它自动化 UI 测试。由用户通过 `npm run electron:dev` 手工验收：

1. **普通文本**：标题和段落的开始、中间、结尾均可点击输入；选择区、方向键和中文 IME 正常，标题不水平跳动。
2. **首次点击**：在 code/table/callout/math 编辑中单击普通标题、另一个块或当前块另一个目标；一次点击生效，旧草稿提交。
3. **块内编辑**：代码具体行、表格具体格、Callout 标题/正文、公式 TeX 可直接编辑；无关更新不重置 caret。
4. **退出协议**：Done、blur、Escape、Enter、Tab、Shift+Tab、Ctrl/Cmd+S 语义一致，无重复提交和旧 rAF 抢焦点。
5. **边界**：文档开头/末尾块、只有一个块、连续相邻块；方向键顺序确定，不进入隐藏源码。
6. **源码模式**：五种块均可编辑源码和完成；选择离开、文档变化、remote reload 后状态正确。
7. **既有功能**：表格行列/对齐、代码复制/语言/折叠、Callout 类型、Embed 打开/label/尺寸/复制/删除无回归。
8. **菜单焦点**：活动编辑器中打开右键菜单，不因 Portal blur 丢草稿。
9. **渲染一致性**：阅读与编辑的 Callout、表格、公式、嵌套 Embed、链接和任务外观一致；窄分屏无透明遮挡。
10. **保存与分屏**：容器草稿不被外部更新静默覆盖；Ctrl+S 保存最新草稿；双分屏互不抢焦点。
11. **性能**：长文档、多数学块、多行内装饰、大代码块、未闭合 `$$`/frontmatter 下连续输入流畅；普通选区变化不再触发数学全文扫描。

---

## 15. 明确不做

- 不更改 Markdown 文件格式、自动保存 IPC 或工作区数据结构。
- 不在本轮支持列表/引用内嵌套块的整行 widget；它们继续安全回退为源码。
- 不新增 Mermaid、音视频、脚注等块类型，不重写 Markdown 解析器。
- 不追求从任意 KaTeX/富文本 HTML 反推不可靠的字符级源码位置，以明确的源码行、单元格和正文范围为边界。
