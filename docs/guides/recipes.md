# 改动配方

> 每条配方都是「改哪些文件、按什么顺序、如何验证」。跨层改动优先按配方走，不要从 UI 反推数据层。

## 0. 通用起手与收尾

起手：

```bash
git status --short
npm run lint        # 先确认基线
```

改 UI 或通用逻辑时，先查 `docs/reference/ui-inventory.md` 与 [UI kit](ui-kit.md)，再 `grep` 一次现有实现；已有同职责的控件/函数/样式类时不要重造。

收尾：

```bash
npm run docs        # 只有契约变化时需要
npm run verify      # tsc + docs 检查
```

- 小改（调色、局部布局、单组件行为）不更新文档。
- 改了 IPC/设置/表结构/快捷键/主题/i18n 契约，必须 `npm run docs`，让 `docs/reference/*` 与源码一致。
- 整块功能完成后更新对应 `docs/architecture/*` 与 `docs/ai/memory.md`。

## 1. 新增 IPC 通道

### 请求/响应

1. `src/shared/models.ts`：如果跨进程需要新结构，在这里加**纯类型**；已有结构直接复用。
2. `electron/database.ts`：如果要落库，加 CRUD 与行→领域模型映射。
3. `electron/main.ts`：在 `registerIpcHandlers()` 里加 `ipcMain.handle("域:动作", async (_e, …) => { … })`。
   - 参数收窄：`String(...)`、数字/数组校验。
   - 文件路径先 `findOwningVault` 校验；库级 sidecar 用 `requireVaultRoot`。
   - 私密库读写前检查解锁态（`requireUnlocked` 或等价逻辑）。
4. `electron/preload.ts`：在 `api` 对应分组加方法，`ipcRenderer.invoke("域:动作", …)`；返回类型断言成领域模型。
5. 渲染层：只通过 `window.prism.新方法(...)` 调用；错误用 `useToast()(…, "error")` 呈现。
6. `npm run docs` 更新 `docs/reference/ipc.md`；`npm run verify`。

### 事件（main → renderer）

1. 主进程用 `mainWindow?.webContents.send("域:事件", payload)` 推送。
2. `preload.ts` 加 `onXxx(callback)`，内部 `ipcRenderer.on`，返回取消订阅函数。
3. 渲染层在 `useEffect` 里订阅并 **return 取消函数**；payload 结构放 `models.ts`。
4. `npm run docs`；检查脚本会校验「main 发的每个事件都有 preload 订阅」。

## 2. 新增数据库表 / 列

1. `electron/database.ts` 的 `initDatabase()`：
   - 新表：在 `db.exec` 建表 SQL 中加 `CREATE TABLE IF NOT EXISTS`；
   - 新列：用现有模式 `PRAGMA table_info(table)` 判断列是否存在，再 `ALTER TABLE ... ADD COLUMN`；需要回填的写 `UPDATE`。
   - 不要改已有迁移的顺序；旧库升级要能重复执行。
2. 如果需要索引，加 `CREATE INDEX IF NOT EXISTS`。
3. 在 `database.ts` 加/改 CRUD；行保持 snake_case + 0/1，返回 `src/shared/models.ts` 的 camelCase + boolean。
4. 如果 IPC 受影响：按配方 1 改 `main.ts` + `preload.ts`。
5. `npm run docs` 更新 `reference/database.md`；在 `docs/architecture/data-model.md` 补语义/迁移说明（检查脚本要求每个表名出现）。
6. 手测旧库启动迁移；必要时备份 `prism.db` 后再试。

## 3. 新增设置项

1. `src/shared/settings.ts`：
   - `AppSettings` 加字段；
   - `DEFAULT_SETTINGS` 加默认值；
   - `SETTING_META` 加 kind（enum/number/boolean/string/color/json）与范围/选项；
   - 如果是 JSON，加 `JSON_NORMALIZERS` 与 `normalizeXxx`（可参考 `normalizeCanvasPresets`）。
2. 消费方：`useSettings().values.xxx`；写用 `set("xxx", value)`。
3. UI：放到 `src/components/settings/<Section>.tsx`，用 `SettingRow` / `SettingBlock` + `Toggle` / `Select` / `TextField` / `NumberInput` / `Slider`；不要手写行布局。
4. 文案：`i18n/zh.ts` + `i18n/en.ts` 双份加 key。
5. `npm run docs` 更新 `reference/settings.md`。
6. 手测：修改后重启是否保留；重置设置是否回到默认；非法值是否被 clamp/回退。

## 4. 新增界面文案

1. `src/i18n/zh.ts` 加 key（它是类型源）。
2. `src/i18n/en.ts` 加同 key；`en: Translation` 会在 `npm run lint` 时检查缺失/多余。
3. 组件里 `const { t } = useT()`，用 `t["key"]`；参数用 `t["key"].replace("{count}", String(n))`。
4. 不要硬编码中文/英文；不要在组件里拼 UI 句子。

## 5. 新增快捷键

1. `src/shared/shortcuts.ts`：
   - `ShortcutAction` 联合类型加动作；
   - `SHORTCUT_ACTIONS` 加动作；
   - `DEFAULT_SHORTCUTS` 加默认组合（遵循 `isValidShortcut` 规则：至少 Ctrl 或 Alt，不能 Ctrl+Alt）。
2. `src/lib/useShortcuts.ts`：在分发处加 `action === "新动作"` 的处理。
3. `src/components/settings/ShortcutsSection.tsx`：在 `rows` 加一行（action/label/description）；补 i18n。
4. `npm run docs`（如果 `reference/ipc.md`/设置表无变化，可只跑 `docs:check`；检查脚本会校验每个动作有 UI 行）。
5. 手测：录制、冲突提示、保留键（Ctrl+S 等）不可覆盖、重置。

## 6. 新增主题

1. `src/shared/themes.ts`：用 `theme({...})` 加一条数据。必填 `mode`（`"dark"` / `"light"` / `"both"`）、`id` / `name` / `nameEn` / `accent`；`neutral`（中性色色相/彩度）与 `ramp`（`soft` / `normal` / `punchy` / `ink`）决定表面阶梯，`dark` / `light` 只用来覆盖个别 token。
2. 单模式主题只声明支持的模式：省略的那一套不会生成，应用会锁定到支持的模式，设置页与顶栏的模式控件禁用并给出原因。细节见 [design/theme-authoring](../design/theme-authoring.md)。
3. 不写组件特例；颜色只走 CSS 变量（`--accent*` / `--c-*`；`--accent-2` 是装饰用副色）。装饰效果走 `fx`（`highlight` 按钮矩阵高亮 / `bloom` 页面柔光 / `pattern` / `glow` / `blur`），生成器与消费点见设计文档，不允许传任意 CSS。
4. `npm run lint`；手测：深浅色、锁定提示、首帧不闪、原生窗口边缘、编辑器标题/加粗色、弹窗/菜单、PDF 封面。
5. `theme` 已是注册设置项，纯数据改动不需要 `npm run docs`。


## 7. 新增模块页 / 导航项

1. `src/lib/workspace/types.ts` 的 `ModuleId` 加 id。
2. `src/App.tsx`：
   - `MODULES` 加图标 + `labelKey`；
   - `main` 里加一个常驻 pane（`paneStyle(moduleActive === id)`）；
   - 工具栏 `fallback` 与 `scopeKey` 逻辑按需调整。
3. 新组件目录 `src/components/<module>/`；如果需要侧栏，用 `<ModuleSidebar active>` portal，不要自己平铺。
4. 需要在 App 外共享状态时，才加 Provider；否则局部 `useState`/hook。
5. `i18n` 加导航与文案；`npm run lint`；手测模块切换、工作区互斥、快捷键。

## 8. 新增设置分区

1. `src/components/Settings.tsx`：`SettingsCategory` 联合、`CATEGORIES`、`categories` 列表、渲染分支。
2. 新建 `src/components/settings/<Name>Section.tsx`，用 `SectionHeader` + `SettingRow`/`SettingBlock`。
3. 新设置项按配方 3 注册；i18n 双份。
4. 手测分类切换、`localStorage` 记忆、重置。

## 9. 新增编辑器块 / 容器类型

先读 [编辑器](../architecture/editor.md)。典型顺序：

1. `src/components/editor/blockState.ts`：`BlockKind` 与 `BlockTarget` 加类型。
2. `src/components/editor/blockModel.ts`：在解析/扫描中识别该块，产出 `BlockRef`。
3. `src/components/editor/containers/`：新建 spec（`types.ts` 约定），在 `registry.ts` 注册；spec 负责入口定位、渲染/编辑、提交。
4. `src/components/editor/blockRender.ts`：如果需要新的静态 widget。
5. `src/components/editor/blockSession.ts`：只在会话协议需要新分支时改；优先复用。
6. `src/components/editor/livePreview.ts`：加入 decoration/atomic range，确保点击映射与方向键行为。
7. `src/components/editor/blockMenu.tsx`：右键菜单项（编辑/源码/删除等）。
8. `src/components/editor/markdown.ts` + `markdownHydration.ts`：阅读模式与 hydration 行为保持一致。
9. `npm run verify`；按 [编辑器](../architecture/editor.md) 的手测矩阵验收。

## 10. 新增白板节点/边类型或字段

先读 [白板](../architecture/canvas.md)。

1. `src/lib/canvas/model.ts`：加类型/字段、默认值、迁移/规范化、序列化。
2. `src/components/canvas/CanvasEditor.tsx` / `BoardFlow.tsx`：`nodeTypes`/`edgeTypes`、创建/删除/复制、选择与历史。
3. `src/components/canvas/nodes/` 或 `edges/`：渲染组件；必要时加详情面板。
4. 设置（默认尺寸/颜色/预设）放 `src/shared/settings.ts` + `CanvasSection.tsx`。
5. 嵌入预览/目标解析受影响时改 `embeds/*`、`targets.ts`。
6. `npm run verify`；手测保存/重开、冲突、分组、嵌入。

## 11. 新增维护脚本

1. 脚本放 `scripts/`，用 `.mjs`；只依赖 Node 内置模块（除非确实需要）。
2. 默认 dry-run，`--apply` 才写盘；写盘前打印目标并建议备份。
3. 路径参数用绝对路径；校验目标在库内。
4. 在 `README.md` 或 `docs/guides/verify-and-release.md` 补一行用法；如果是文档/契约脚本，加到 `package.json`。

## 12. 新增共享控件 / 工具函数 / 效果类

1. 搜：`docs/reference/ui-inventory.md` + `grep` 现有调用点；已有同名或同职责实现就先复用。
2. 判定阶梯：直接复用 → 给现有件加可选 prop/variant → 共享层新建。一次性页面内实现不要进 `src/components/` 根目录。要新增 variant / size / 全局样式类时，先按 [UI kit](ui-kit.md) 的请求流程提出并等待确认，不要边做边加。
3. 放置与命名：逻辑/hook → `src/lib/`；跨模块视觉件 → `src/components/` 根目录；设置行/块 → `components/settings/controls.tsx`；模块私有件 → `src/components/<module>/`。命名按 [UI kit](ui-kit.md) 的约定（`variant` / `palette` / `active` / `selected`）。
4. 样式只用语义 token 与已有共用类；确实要加效果类时，先确认第二处会用到。
5. 在 [UI kit](ui-kit.md) 补一行（根目录控件必须收录），跑 `npm run docs` 更新 `code-map.md` 与 `ui-inventory.md`。
6. `npm run verify`；UI 变更说明需要手测的路径（深/浅色、窄窗口、空态/加载态、键盘）。

## 13. 新增详情 / 写作弹窗

1. **先判档**（见 [UI kit](ui-kit.md)「Modal 的三种容器」）：确认/单输入/短表单 → `sm/md`；多短字段表单 → `lg`；阅读正文或长文写作 → `layout="document"`。不要用 `lg` + `max-h-[62vh]` 硬撑文档型。
2. 文档型：`<Modal layout="document">`，面板自动铺满窗口（四边 64px）、固定标题/页脚、只滚正文；页面不要再包滚动容器或 `ScrollFade`。
3. 内容外层 `mx-auto w-full max-w-[1400px]`；正文列 `max-w-[800px]`（公告 960），避免 1800px 行长。
4. 单栏/双栏：用 `useElementSize` 量**正文容器**，阈值参考 900（能力 / 挑战）、880（作品）、820（年度）；不要用 viewport 媒体查询。
5. 写作型 `closeOnBackdrop={false}`，长文本 `min-h-[34vh]`；本轮不做脏检查/写预览分栏。
6. `npm run docs` + `npm run verify`；手测 900/1200/1920、125%/150% 缩放、头尾固定、分栏切换与堆叠子弹窗。
