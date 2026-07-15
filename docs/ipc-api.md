# IPC API Reference

所有 IPC 通信通过 `ipcRenderer.invoke(channel, ...args)` 发起，由主进程 `ipcMain.handle(channel, handler)` 处理。

渲染进程通过 `window.prism` 调用，类型定义见 `electron/preload.ts` 和 `src/lib/api.ts`。

---

## 网页资源 (Resources)

### `resources:add`
添加新的网页资源。

| 参数 | 类型 | 说明 |
|------|------|------|
| url | `string` | 网页 URL |
| title | `string` | 标题（可传空字符串，由前端先调用 fetch:title 获取） |
| notes | `string` | 备注 |
| tags | `string[]` | 标签数组 |

返回: `Resource` 对象

---

### `resources:list`
获取所有资源，按 `created_at DESC` 排序。

返回: `Resource[]`

---

### `resources:update`
更新资源。

| 参数 | 类型 | 说明 |
|------|------|------|
| id | `number` | 资源 ID |
| title | `string` | 新标题 |
| notes | `string` | 新备注 |
| tags | `string[]` | 新标签数组（会替换全部旧标签） |

返回: `Resource | null`

---

### `resources:delete`
删除资源及其关联标签关系（CASCADE）。

| 参数 | 类型 |
|------|------|
| id | `number` |

返回: `boolean` (是否删除成功)

---

### `resources:search`
对资源执行 FTS5 全文搜索，按 rank 排序。

| 参数 | 类型 |
|------|------|
| query | `string` |

返回: `Resource[]`

---

### `fetch:title`
获取 URL 的 `<title>` 标签内容。通过 `electron.net.fetch` 实现。

| 参数 | 类型 |
|------|------|
| url | `string` |

返回: `string` (标题文本，获取失败则返回原始 URL)

---

### `resources:open-url`
在浏览器中打开 URL。优先使用设置中配置的浏览器路径（`browser_path`），否则使用系统默认浏览器。

| 参数 | 类型 |
|------|------|
| url | `string` |

返回: `void`

---

## Obsidian 知识库

### `obsidian:set-path`
设置当前知识库路径，触发完整扫描：递归遍历目录 → 读取所有 `.md` → 解析标签 → 写入 `obsidian_notes` 表（整个操作在一个事务中完成：清空旧数据 + 批量插入）。

| 参数 | 类型 |
|------|------|
| vaultPath | `string` |

返回: `number` (扫描到的笔记数量)

---

### `obsidian:list`
获取当前知识库中的所有笔记，按 `modified_at DESC` 排序。

返回: `ObsidianNote[]`

---

### `obsidian:search`
对 Obsidian 笔记进行 FTS5 全文搜索。

| 参数 | 类型 |
|------|------|
| query | `string` |

返回: `ObsidianNote[]`

---

### `obsidian:open`
在 Obsidian 中打开指定文件。使用 `obsidian://open?path=...` URI scheme。优先使用设置中配置的 Obsidian 路径，否则使用系统默认程序。

| 参数 | 类型 |
|------|------|
| filePath | `string` |

返回: `void`

---

## 统一搜索

### `search:unified`
跨资源 + 笔记的联合全文搜索。分别调用 `searchResources` 和 `searchNotes` 后合并结果。笔记的 snippet 截取前 200 字符。

| 参数 | 类型 |
|------|------|
| query | `string` |

返回: `SearchResult[]`

```typescript
interface SearchResult {
  type: "resource" | "note";
  id: number;
  title: string;
  snippet: string;
}
```

---

## 设置 (Settings)

### `settings:get`
获取单个设置值。存储于 `settings` 表 (key-value)。

| 参数 | 类型 |
|------|------|
| key | `string` |

返回: `string | null`

当前使用的 key:
- `vault_paths` — JSON 序列化的 `{name, path}[]`
- `last_vault_path` — 上次选择的知识库路径
- `browser_path` — 自定义浏览器路径
- `obsidian_path` — 自定义 Obsidian 路径

### `settings:set`
设置/更新单个设置值。使用 `INSERT OR REPLACE`。

| 参数 | 类型 |
|------|------|
| key | `string` |
| value | `string` |

返回: `void`

---

## 标签 (Tags)

### `tags:list`
获取所有标签及其关联资源数量，按 count DESC 排序。

返回: `{ name: string; count: number }[]`

---

## 收藏集 (Collections)

### `collections:load`
读取知识库的收藏集数据。

| 参数 | 类型 |
|------|------|
| vaultPath | `string` |

返回: `CollectionsData | null`（文件不存在或解析失败返回 `null`，损坏时自动备份为 `.bak`）

### `collections:save`
写入收藏集数据到知识库目录。

| 参数 | 类型 |
|------|------|
| vaultPath | `string` |
| data | `CollectionsData` |

返回: `void`（自动创建 `.prism/` 目录，格式化 JSON 输出）

---

## Shell 操作

### `shell:show-item-in-folder`
在系统文件管理器中定位并选中文件。

| 参数 | 类型 |
|------|------|
| filePath | `string` |

返回: `void`

### `shell:trash-file`
移动文件到系统回收站。

| 参数 | 类型 |
|------|------|
| filePath | `string` |

返回: `{ success: boolean; error?: string }`

### `shell:trash-files`
批量移动文件到回收站。逐文件操作，返回每个文件的结果。

| 参数 | 类型 |
|------|------|
| filePaths | `string[]` |

返回: `{ results: { path: string; success: boolean; error?: string }[]; allSuccess: boolean }`

---

## 系统对话框

### `dialog:select-directory`
打开原生文件夹选择对话框。

返回: `string | null` (选中路径或 null)

### `dialog:select-file`
打开原生文件选择对话框（用于选择可执行文件，如浏览器/Obsidian 路径）。

返回: `string | null` (选中文件路径或 null)

---

## 数据模型

### Resource
```typescript
interface Resource {
  id: number;
  url: string;
  title: string;
  notes: string;
  created_at: string;   // ISO datetime
  tags: string[];        // 运行时拼接，不直接存在 resources 表中
}
```

### CollectionsData
```typescript
interface NoteGroup {
  id: string;            // 8-char nanoid
  name: string;
  notePaths: string[];   // 相对路径（/ 分隔）
}

interface CollectionData {
  id: string;
  name: string;
  notePaths: string[];   // 未分组笔记
  groups?: NoteGroup[];  // 二级分组（v2）
}

interface CollectionsData {
  version: number;       // 当前: 2
  collections: CollectionData[];
}
```

### ObsidianNote
```typescript
interface ObsidianNote {
  id: number;
  path: string;          // 文件完整路径
  title: string;         // 文件名（不含 .md）
  content: string;       // 完整 Markdown 内容
  tags: string;          // 空格分隔的标签
  modified_at: string;   // 文件修改时间 ISO
}
```
