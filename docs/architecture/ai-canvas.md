# AI 白板桥接（MCP）

> 读完本文应能回答：AI 怎么在 Prism 里“画”白板、文件如何被发现/校验/写入、DSH 插件怎么装、哪些边界不能破、改工具或格式时先动哪里。

## 适用场景

- 在 DSH、Claude Desktop 等 MCP 客户端里让模型创建/修改白板。
- 修改桥接工具、参数 schema、自动布局或 vault 发现逻辑。
- 排查「MCP 连不上」「白板写不进去」或 Prism 侧看不到新文件。

相关文档：[白板子系统](./canvas.md)、[主进程](./main-process.md)、[IPC 参考](../reference/ipc.md)。

## 组成

桥接是一个**独立进程的 stdio MCP 服务**，不经过 Prism 的 IPC，也不修改 Prism 源码：

| 位置 | 作用 |
|---|---|
| `integrations/prism-canvas-mcp/server/server.js` | MCP 协议层：stdio 换行 JSON-RPC、`initialize`、`tools/list`、`tools/call` |
| `integrations/prism-canvas-mcp/server/vaults.js` | 读 Prism `prism.db` 的 settings、解析 vault/白板路径、原子读写 |
| `integrations/prism-canvas-mcp/server/tools.js` | 6 个工具的 schema 与处理逻辑 |
| `integrations/prism-canvas-mcp/server/layout.js` | `tree` / `mindmap` / `grid` 布局、卡片高度估算、视口适配 |
| `integrations/prism-canvas-mcp/server/lib/model.js`、`targets.js` | 由 `src/lib/canvas/model.ts`、`targets.ts` 编译出的 CommonJS，保证与渲染层同一份解析/清洗/序列化规则 |
| `integrations/prism-canvas-mcp/cordis.patch.yml` | DSH bundle：插入 `@deepseek-ai/dsh-mcp-client` 的 stdio 行 |
| `integrations/prism-canvas-mcp/locale`、`docs`、`icon.svg` | 插件市场/设置页的标题、说明、详情图与图标 |

服务端零依赖，只用 Node 内置模块（`node:sqlite` 需要 Node 22.5+）。格式层不能用 `JSON.parse` 直接读写业务字段：一律走编译后的 `parseCanvas` / `serializeCanvas`，否则会绕过夹取、v1 迁移和重复 id 修复。

## 数据流

1. DSH 以 `node --no-warnings integrations/prism-canvas-mcp/server/server.js` 启动服务；客户端先发 `server/discover`，服务端返回 `-32601`，客户端回落到 2025-era 的 `initialize` 握手。
2. 模型调用工具；服务端从 Prism 的 SQLite **只读**读取 `settings.vault_paths` 与 `settings.canvas_dir`，解析出目标仓库与白板目录。
3. 按标题或库内相对路径找到 `.json`，用 `parseCanvas` 解析（损坏文件拒绝写入）。
4. 修改文档、`serializeCanvas` 序列化，写同目录唯一临时文件后 `rename`；再 `stat` 得到新 mtime。
5. Prism 不监听白板目录：新文件在用户切换到「资料库 → 白板」或重启 Prism 后出现；文件本身是普通白板，可直接打开继续编辑。

## 仓库发现与路径安全

- `prism.db` 默认位置：Windows `%APPDATA%\prism\prism.db`，macOS `~/Library/Application Support/prism/prism.db`，Linux `${XDG_CONFIG_HOME:-~/.config}/prism/prism.db`。
- `vault_paths` 是 `[{ name, path, private?, icon? }]`；`canvas_dir` 走与 `resolveCanvasDir` 相同的清洗（去反斜杠、拒绝空/`..`/绝对路径/盘符，回退 `canvases`）。
- 私密仓库（`private: true` 或存在 `<vault>/.prism/private.json`）直接拒绝：内容是 PVD1 密文，外部进程无法安全读写。
- **没有默认仓库**：除 `canvas_vaults` 外，每个工具都要求 `vault`，缺失时错误里列出可用仓库名。
- 允许的读写范围与 `assertCanvasFile` 一致：`<vault>/<canvas_dir>/` 下的 `.json`，以及旧项目目录 `<vault>/Projects/<项目>/*.json`；新建只落在 `canvas_dir`。
- 标题转文件名沿用 `uniqueCanvasName`：非法字符 `<>:"/\|?*` → `-`，空标题 `Untitled`，重名追加 ` 1`、` 2`。

环境变量覆盖（测试/便携场景）：`PRISM_USER_DATA`、`PRISM_DB`、`PRISM_CANVAS_DIR`、`PRISM_CANVAS_VAULTS`（JSON 数组，替代数据库查找）。

## 工具

| 工具 | 关键参数 | 说明 |
|---|---|---|
| `canvas_vaults` | — | 列仓库、画布目录、是否私密、白板数量（只读） |
| `canvas_list` | `vault` | 列白板：标题、`relPath`、`modifiedAt` |
| `canvas_read` | `vault`、`canvas`（标题或相对路径） | 返回完整 `CanvasDoc` 与 `modifiedAt`，节点/连线 id 供后续编辑 |
| `canvas_create` | `vault`、`title`、`nodes`、`edges?`、`groups?`、`layout?` | 用本地 `key` 连边；服务端布局、写文件、返回节点 id 与摘要 |
| `canvas_edit` | `vault`、`canvas`、`addNodes?`/`updateNodes?`/`removeNodeIds?` 等 | 按 id 增删改；也可重新布局；带 mtime 冲突保护 |
| `canvas_layout` | `vault`、`canvas`、`mode` | 只重排，不改文字 |

约定：

- `canvas_create` 的 `edges.from`/`to` 用同一调用里的 `key`；`canvas_edit` 的 `from`/`to` 用 `canvas_read` 返回的 id。新加的节点可在同一次 `canvas_edit` 里用 `key` 引用。
- `canvas_create` 默认布局：有连线用 `tree`，无连线用 `grid`；`layout.mode` 可为 `tree` / `mindmap` / `grid` / `none`。
- 颜色只接受 `#rgb`/`#rrggbb` 之类的十六进制；空串表示主题默认。字号 10–48，节点尺寸由 `model.ts` 夹取。
- `groups.nodes` 传节点 key/id 时，容器在布局**之后**按卡片包围盒加 padding（左/上 40/56，右/下 80/96）生成；显式 `x/y/width/height` 只在没有 `nodes` 时生效。
- 没有「删除整张白板」工具：删除属于 Prism 资料库操作，避免模型误删文件。

## 布局

- `tree`：按有向边建树，列按深度对齐；`direction: "LR"`（默认）或 `"TB"`。每个连通分量纵向堆叠，孤立节点各自成列。
- `mindmap`：根节点水平居中，直接分支交替放左右两侧；两侧各自按子树高度堆叠并向两侧镜像排布。`layout.root` 可指定根 key。
- `grid`：按输入顺序铺 `columns` 列，默认 `ceil(sqrt(n))`。
- 卡片高度：未显式给 `height` 时按文本长度和字号估算（中文按 2 个拉丁字符宽），最小 44；布局只读不写这些尺寸。
- 连线端点：布局完成后按两卡中心相对位置写 `sourceHandle`/`targetHandle`（LR 用 right/left，TB 用 bottom/top），避免箭头绕回。
- 视口：`fitViewport` 按所有卡片与容器的包围盒给出 `{ x, y, zoom }`，zoom 0.2–1.2；新建/重排后都会更新。

## 写入安全

- 写前 `parseCanvas`，写后 `serializeCanvas`；文件里的字段、键序、两空格缩进与 Prism 自己保存的一致。
- 写入用同目录唯一临时文件 + `rename`，中途崩溃不会留下半截 JSON。
- `canvas_edit` / `canvas_layout` 在读时记录 mtime，写入前再 `stat` 一次；不一致返回 `CANVAS_CONFLICT`，要求重新读取，不静默覆盖。
- Prism 正在打开同一张白板时，外部写入不会推进它的内存副本；用户下次在 Prism 保存会走已有的「重新加载 / 覆盖保存」冲突弹窗。桥接不修改 Prism 的冲突逻辑。
- 私密库、损坏文件、越界路径、未知 id 都返回 `isError` 文本，模型能看到具体错误码而不是假成功。

## DSH 安装与更新

- bundle 目录就是 `integrations/prism-canvas-mcp`；`package.json` 声明 `dsh.bundle.patch`，`cordis.patch.yml` 里 `serverName: prism_canvas`，工具名为 `mcp__prism_canvas__<tool>`。
- patch 里是**绝对路径** `E:/Projects/prism/integrations/prism-canvas-mcp/server/server.js`；仓库搬家后改这里并重新安装/重载 bundle。
- 安装：DSH 的 Plugins → Add plugin 选本地目录，或让 agent 用 `plugin_manager` 安装该目录。改完 `server/*.js` 后需要重载 bundle（或重启 DSH）才会启动新代码；改 `src/lib/canvas/*` 后要先 `npm run canvas:mcp:build`。
- bundle 的 `package.json` 是 `"type": "module"`，因此 `server/package.json` 显式声明 `"type": "commonjs"`；少了它 Node 会把 `server.js` 当 ESM，`require` 直接崩溃、客户端只看到 `Connection closed`。

## 验证

- `npm run canvas:mcp:test`：在临时仓库里跑完整 JSON-RPC 握手、创建/读取/编辑/布局、私密库拒绝、无默认仓库、节点不重叠、容器包围盒；用 `parseCanvas` 校验写出的文件。
- `npm run canvas:mcp:build`：`src/lib/canvas/model.ts` / `targets.ts` 变化后重新生成 `server/lib`。
- `npm run verify`：类型 + 文档契约（桥接本身不在 tsc 覆盖范围，靠上面两个命令）。
- 手测：在 DSH 里点名仓库让模型画一张白板 → 切到 Prism「资料库 → 白板」确认出现 → 打开、拖动/编辑、保存 → 再让 AI 修改同一张，确认 Prism 的冲突提示按预期出现。

## 改动地图

| 要改什么 | 先看 |
|---|---|
| 白板字段/版本/迁移 | `src/lib/canvas/model.ts`，然后 `npm run canvas:mcp:build` |
| 工具参数/返回/错误码 | `server/tools.js`、`server/server.js` |
| 仓库发现/路径/文件名 | `server/vaults.js`、`electron/main.ts` 的 `resolveCanvasDir` / `uniqueCanvasName` |
| 布局算法 | `server/layout.js` |
| DSH 连接/工具命名 | `cordis.patch.yml`、`server/server.js` 的 `initialize` / `tools/list` |
| 插件标题/说明/详情图 | `locale/*.json`、`docs/DETAIL*.md`、`integrations/prism-canvas-mcp/docs/preview.svg`、`icon.svg` |

## 不变量与坑

1. **JSON 是唯一持久化**：桥接不建表、不写 Prism 数据库，只读 settings；白板列表靠目录扫描。
2. **格式只有一份**：不要在 `server/` 里复制 `sanitize*`/`serialize` 逻辑；改格式先改 `model.ts` 再重新编译。
3. **mtime 是冲突令牌**：写入前必须比较；不要用「强制覆盖」绕过用户正在编辑的白板。
4. **私密库一律不碰**：`isPrivateVault` 的判定与 Prism 一致；不要尝试解密。
5. **没有目录 watcher**：Prism 侧看不到「实时刷新」是已知行为，别在文档里承诺；用户切换资料库或重启后可见。
6. **MCP 现代协议未实现**：故意只做 2025-era `initialize`，靠 `server/discover` 失败回落到 legacy；升级协议时要同时改 `server.js` 和自测。
7. **绝对路径是 bundle 的一部分**：仓库移动会让 DSH 启动失败（`Connection closed`），先改 patch 再重装。
