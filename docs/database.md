# Database

## 基本信息

- **引擎**: SQLite via better-sqlite3 (同步 API)
- **文件位置**: `app.getPath("userData")/prism.db`
- **配置**: WAL 模式 + 外键约束开启
- **搜索**: FTS5 虚拟表（全文索引）
- **知识库视图数据**: JSON 文件存储在 `<vault>/.prism/collections.json`（非 SQLite）

## 数据存储职责

| 存储 | 内容 | 迁移 |
|------|------|------|
| SQLite `prism.db` | 全局配置、网页资源、Obsidian 笔记索引 | 绑定机器 |
| `.prism/collections.json` | 收藏集、分组、排序（知识库维度） | 随仓库文件迁移 |

### `collections.json` (v2)

```json
{
  "version": 2,
  "collections": [{
    "id": "...", "name": "...",
    "notePaths": ["ungrouped.md"],
    "groups": [{ "id": "...", "name": "...", "notePaths": ["..." ] }]
  }]
}
```

自动保存（300ms 防抖），相对路径，`/` 分隔符，跨平台兼容。

## 完整 Schema

### `resources` — 网页资源

```sql
CREATE TABLE resources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  url        TEXT NOT NULL UNIQUE,          -- URL 唯一约束
  title      TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `tags` — 标签字典

```sql
CREATE TABLE tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
```

### `resource_tags` — 资源-标签多对多关系

```sql
CREATE TABLE resource_tags (
  resource_id INTEGER NOT NULL,
  tag_id      INTEGER NOT NULL,
  PRIMARY KEY (resource_id, tag_id),
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)      REFERENCES tags(id)      ON DELETE CASCADE
);
```

### `resources_fts` — 资源全文索引 (FTS5)

```sql
CREATE VIRTUAL TABLE resources_fts USING fts5(
  title, notes, url,
  content='resources',      -- 内容来自外部表
  content_rowid='id'
);
```

### `obsidian_notes` — Obsidian 笔记快照

```sql
CREATE TABLE obsidian_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  path        TEXT NOT NULL UNIQUE,       -- 文件完整路径
  title       TEXT NOT NULL,              -- 文件名（不含 .md）
  content     TEXT NOT NULL DEFAULT '',   -- 完整 Markdown 内容
  tags        TEXT NOT NULL DEFAULT '',   -- 空格分隔的标签
  modified_at TEXT NOT NULL               -- 文件修改时间 ISO
);
```

### `obsidian_fts` — 笔记全文索引 (FTS5)

```sql
CREATE VIRTUAL TABLE obsidian_fts USING fts5(
  title, content, tags,
  content='obsidian_notes',
  content_rowid='id'
);
```

### `settings` — 键值配置

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
```

## FTS 同步触发器

两个 FTS5 虚拟表通过触发器与主表保持同步：

```
resources: AFTER INSERT → INSERT INTO resources_fts
resources: AFTER DELETE → INSERT INTO resources_fts(... 'delete' ...)
resources: AFTER UPDATE → DELETE old + INSERT new

obsidian:  同样的 INSERT/UPDATE/DELETE 触发器
```

这是 FTS5 内容同步的标准模式 —— 数据变化时 FTS 索引自动更新。

## 关键操作

### 标签管理逻辑

标签采用"先到先得"的自动创建策略：

1. `INSERT OR IGNORE INTO tags (name) VALUES (?)` — 标签不存在则创建
2. `SELECT id FROM tags WHERE name = ?` — 获取标签 ID
3. `INSERT INTO resource_tags (resource_id, tag_id) VALUES (?, ?)` — 建立关联

更新资源标签时的策略：先 `DELETE FROM resource_tags WHERE resource_id = ?` 清除所有旧关联，再重新建立。

### Obsidian 仓库刷新策略

`setVaultNotes()` 使用全程事务：

```
BEGIN TRANSACTION
  DELETE FROM obsidian_notes          -- 清空所有旧数据
  INSERT INTO obsidian_notes (...)     -- 逐条插入新笔记
COMMIT
```

原因：FTS 索引在 DELETE 时会自动更新，事务保证原子性 —— 不会出现"清空后崩溃导致数据丢失"的中间状态。

### 资源查询 enrichment

每个资源查询后，通过 `enrichResource()` 补充标签数组：

```typescript
SELECT t.name FROM tags t
JOIN resource_tags rt ON t.id = rt.tag_id
WHERE rt.resource_id = ?
```

## 数据库初始化时机

在 `app.whenReady()` 中调用 `initDatabase()`，早于 `createWindow()` 和 `registerIpcHandlers()`，确保 IPC 处理器被调用时数据库已就绪。
