---
name: editor-and-canvas
description: >-
  Prism editor and canvas internals — use when changing Markdown rendering,
  CodeMirror live preview, block containers, embeds, canvas nodes/edges, or the
  canvas file format.
whenToUse: >-
  "editor", "CodeMirror", "live preview", "block", "callout", "embed",
  "markdown render", "canvas", "whiteboard", "node", "edge"
user-invocable: true
---

# 编辑器与白板改动

## 何时用

- 改 Markdown 阅读渲染、callout、wikilink、KaTeX、代码高亮、图片尺寸、嵌入。
- 改 CodeMirror 实时预览、块 widget、块会话、右键菜单、键位。
- 改表格/代码/提示卡/公式/嵌入容器的行为。
- 改白板节点/边/容器、画布交互、保存冲突、预设、资料库白板分组。

不适用：普通页面布局/设置（用 `ui-settings-i18n`）。

## 先读

- `docs/architecture/editor.md`
- `docs/architecture/canvas.md`
- `docs/design/editor-block-refactor.md`（历史设计，路径可能已变）
- 相关 recipes：`docs/guides/recipes.md` 的「新增编辑器块/容器」「新增白板节点/边」

## 编辑器：核心不变量

1. **Markdown 源码是唯一持久化**；不要引入第二份文档状态/HTML state。
2. 只有一个主 `EditorView`；同一时刻最多一个活动块会话。
3. 阅读（markdown-it）与编辑（CM6 decoration）是两条管线；共享 hydration，不共享 DOM。
4. 块编辑必须走 `BlockSession` + `containers/*` spec；不要直接 focus 子编辑器。
5. widget 比较内容，不比较绝对位置；编辑上方内容不应重建打开的子编辑器。
6. `atomicRanges` + 方向键黑盒聚焦是块边界安全的一部分；不要只改视觉。
7. 子编辑器焦点由会话拥有；主 CM 选区是逻辑锚点。
8. 粘贴/插入图片走 `saveAttachment` → `imagePathFor` → `![[target]]`；不要自己拼路径。
9. 外部重载用 `Transaction.remote`，不自动写回；CRLF 保存时保持原风格。
10. callout 内嵌套内容与顶层共用容器协议，不要另写一套解析。

## 编辑器：改动路径

| 要改什么 | 先看 |
|---|---|
| 阅读渲染/插件 | `src/components/editor/markdown.ts`、`callouts.ts`、`imageSize.ts` |
| CM6 扩展组合 | `cmExtensions.ts` |
| 实时预览 decoration/块 widget | `livePreview.ts` |
| 块识别/范围 | `blockModel.ts`、`blockState.ts` |
| 会话/提交/焦点 | `blockSession.ts`、`blockFocus.ts`、`blockActions.ts` |
| 容器 spec | `containers/registry.ts` + `containers/*.ts` |
| 静态块渲染 | `blockRender.ts`、`mathRender.ts` |
| 右键菜单 | `blockMenu.tsx`、`NoteEditor.tsx` |
| 阅读/编辑共享后处理 | `markdownHydration.ts`、`calloutIcons.tsx` |
| 大纲/折叠/模式切换 | `OutlineCard.tsx`、`folds.ts`、`NoteEditor.tsx` |

新增块类型的完整顺序见 `docs/guides/recipes.md` 第 9 条。

## 白板：核心不变量

1. 文件是 `<vault>/<canvas_dir>/*.json`，`CanvasDoc` v2；不进 SQLite。
2. 路径为库内相对/绝对 JSON，保存带 `expectedModifiedAt`，冲突必须让用户选择。
3. 资料库分组（`.prism/canvas-groups.json`）与画布内部容器（`CanvasGroup` in `lib/canvas/model.ts`）是两个概念。
4. 未分组 = 全部导图 − 各组；删除分组后成员回未分组。
5. React Flow 会写内联 `visibility`；标签隐藏用 `display:none`，不要改 ancestry visibility。
6. 节点/边的目标引用可能失效；打开时按当前库重新解析。
7. 保存/加载/迁移/损坏兜底都在 `model.ts`；不要绕过它直接 `JSON.parse` 业务字段。
8. 画布编辑器的历史/几何/图操作在 `lib/canvas/*`；UI 组件不要复制算法。

## 白板：改动路径

| 要改什么 | 先看 |
|---|---|
| 文件格式/迁移/冲突 | `src/lib/canvas/model.ts`、`electron/main.ts` 的 `canvas:*` |
| 画布交互/节点/边 | `src/components/canvas/CanvasEditor.tsx`、`BoardFlow.tsx` |
| 节点/容器/边渲染 | `src/components/canvas/nodes/*`、`edges/*` |
| 详情面板 | `NodeDetailPanel.tsx`、`FrameDetailPanel.tsx`、`EdgeDetailPanel.tsx` |
| 预设 | `PresetBar.tsx`、`src/shared/settings.ts`、`CanvasSection.tsx` |
| 资料库白板视图 | `src/components/library/CanvasLibraryContent.tsx`、`useCanvasGroups.ts` |
| 嵌入缩略图 | `src/components/embeds/CanvasEmbedPreview.tsx`、`embeds/loader.ts` |

## 验证

```bash
npm run lint
npm run docs        # 契约/导出变化时
npm run docs:check
```

Markdown 渲染改动额外跑 smoke test（见 `docs/guides/verify-and-release.md`；需先构建 `out/md-test.mjs` 与 `out/task-toggle.mjs`）。

手测矩阵（按改动取舍）：

- 阅读/编辑切换、滚动位置、模式默认值。
- 表格：点单元格、Tab 加行、边界删除。
- 代码块：语言高亮、折叠、Tab 缩进、复制/剪切。
- 提示卡：标题/正文跳转、嵌套表格/代码/公式、Esc 提交/取消。
- 公式：行内/块级、编辑、主题色。
- 嵌入：图片/笔记/PDF/白板/外链、尺寸、点击打开。
- 图片粘贴、附件路径、外部修改重载。
- 白板：新建/重命名/删除、保存冲突、分组拖拽、节点/边/容器、嵌入预览、分屏。

## 收尾

- 整块行为变化：更新 `docs/architecture/editor.md` / `canvas.md`。
- 新块/节点类型：在 recipes 或架构文档补入口。
- 新坑：更新 `docs/guides/troubleshooting.md`。
- 说明需要用户手测什么；不跑 UI 自动化。
