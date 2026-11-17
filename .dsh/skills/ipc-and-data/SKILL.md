---
name: ipc-and-data
description: >-
  Prism IPC and data-layer changes — use when adding or changing an IPC channel,
  SQLite table/column, shared domain model, vault scan, or .prism sidecar.
whenToUse: >-
  "add IPC channel", "new database column", "change models.ts", "vault scan",
  "sidecar", "window.prism"
user-invocable: true
---

# IPC 与数据层改动

## 何时用

- 新增/修改 `window.prism` 方法或 `ipcMain.handle` 通道。
- 新增 SQLite 表/列/索引、迁移、CRUD、行映射。
- 修改 `src/shared/models.ts` 的跨进程模型。
- 改 vault 扫描、watcher、PDF 索引、`.prism` sidecar。
- 改私密仓库相关读写。

不适用：纯 UI 状态、样式、文案（用 `ui-settings-i18n`）。

## 先读

- `docs/architecture/main-process.md`（IPC、扫描、路径、私密仓库、协议）
- `docs/architecture/data-model.md`（表、sidecar、设置、事件）
- `docs/reference/ipc.md` / `docs/reference/database.md`（当前契约）
- `docs/guides/recipes.md` 的「新增 IPC」「新增表/列」

## 步骤

### A. 新增 IPC 请求通道

1. `src/shared/models.ts`：需要新结构时只加类型；命名用领域语言（`NoteBrief`、`PdfDocument`），不要暴露行结构。
2. `electron/database.ts`：需要落库时加 CRUD；行→模型映射在这里完成。
3. `electron/main.ts`：
   - 在 `registerIpcHandlers()` 加 `ipcMain.handle("域:动作", async (_e, …) => …)`；
   - 参数收窄（`String`、`Number`、数组过滤）；
   - 文件路径先 `findOwningVault`；库级 sidecar 用 `requireVaultRoot`；
   - 私密库读写前检查解锁态；
   - 返回领域模型，不返回行。
4. `electron/preload.ts`：在对应分组加方法，`ipcRenderer.invoke("域:动作", …)`；返回类型断言成模型。
5. 渲染层只调用 `window.prism.新方法`；失败用 `useToast()(…, "error")`。
6. `npm run docs` 更新 `docs/reference/ipc.md`。

### B. 新增 main → renderer 事件

1. 主进程 `mainWindow?.webContents.send("域:事件", payload)`。
2. `preload.ts` 加 `onXxx(cb)`，内部 `ipcRenderer.on`，返回取消订阅函数。
3. 渲染层 `useEffect` 订阅并 return 取消；payload 类型放 `models.ts`。
4. `npm run docs`；检查会验证 main 发的每个事件都有订阅。

### C. 新增表 / 列

1. `initDatabase()`：
   - 新表：`CREATE TABLE IF NOT EXISTS`；
   - 新列：`PRAGMA table_info` 判断后 `ALTER TABLE ... ADD COLUMN`；需要回填写 `UPDATE`；
   - 索引：`CREATE INDEX IF NOT EXISTS`。
2. 不要重排已有迁移；旧库升级必须可重复执行。
3. 加/改 CRUD；保持 snake_case + 0/1 在边界内。
4. `npm run docs`；在 `docs/architecture/data-model.md` 补表名与语义（检查要求每个表名出现）。
5. 手测旧库启动迁移；先备份 `prism.db`（含 `-wal`/`-shm`）。

### D. 改 vault 扫描 / watcher

1. 扫描：`scanVaultIncremental`（mtime diff、批量读、标签提取）。
2. watcher：`watchVault` / `scheduleVaultScan` / `rescanAndNotify`；点目录与非 `.md` 过滤。
3. 保存笔记时把真实 mtime 写入 DB，避免重复扫描。
4. 只推送实际变化（`{ upserted, deleted }`）。
5. 私密库不索引；嵌套私密库根要从父库扫描排除。

### E. 改 sidecar

1. 统一用 `readSidecar` / `writeSidecar`（临时文件 + rename）。
2. 库根校验：`requireVaultRoot`。
3. 损坏文件按「不存在」处理并留 `.bak`。
4. 数据结构有版本时保留 `version` 字段并做规范化。

## 不变量

- 渲染层零 Node API；所有 DB 经 IPC。
- 跨进程类型只在 `src/shared/models.ts`；不让 snake_case 泄漏。
- 路径必须经过拥有者校验；不要用字符串 `startsWith` 自己判断。
- 私密库：未解锁不读、不索引；不得把解密数据写入磁盘缓存。
- 事件订阅必须可取消；避免重复订阅。
- 生成物 `docs/reference/*` 不手改。
- 不改既有迁移顺序，不 destructive 迁移（先备份/回填）。

## 验证

```bash
npm run docs
npm run docs:check
npm run lint
```

手测（按改动取舍）：

- 新通道在渲染层能调用，错误路径有 toast。
- 事件推送后列表/状态增量更新，取消订阅后不再更新。
- 旧库迁移后启动正常；新列默认值正确。
- 外部改文件/增删笔记后列表与搜索更新。
- 私密库锁定/解锁/重启行为。
- `.prism` 文件损坏时应用不崩。

## 收尾

- 契约变化：`docs/reference/*` 已更新并提交。
- 整块功能：更新 `docs/architecture/main-process.md` / `data-model.md` 与 `docs/ai/memory.md`。
- 说明需要用户手测什么。
