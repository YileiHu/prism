# Architecture

## 进程模型

```
┌──────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                  │
│  electron/main.ts                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Window 管理   │  │ IPC Handlers │  │  database.ts  │  │
│  │ (BrowserWindow)│  │ (ipcMain)   │  │  (SQLite CRUD)│  │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│         │                  ▲                              │
│         │    contextBridge │ ipcRenderer.invoke           │
│         ▼                  │                              │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Renderer Process (Chromium)                     │    │
│  │  src/ (React SPA)                                │    │
│  │  ┌───────────┐ ┌────────────┐ ┌──────────────┐   │    │
│  │  │ App.tsx   │ │ Components │ │ i18n + Theme │   │    │
│  │  │ (Tab Nav) │ │ (3 panels) │ │ (Context)    │   │    │
│  │  └───────────┘ └────────────┘ └──────────────┘   │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

## 关键设计决策

### 安全模型
- `contextIsolation: true` + `nodeIntegration: false` — 渲染进程没有 Node.js 权限
- 所有数据库操作通过 `contextBridge.exposeInMainWorld` 暴露的有限 API 进行
- `ipcRenderer.invoke` 请求经 IPC 发往主进程处理

### 数据存储
- 数据库文件位于 `app.getPath("userData")/prism.db`
- 使用 WAL 模式提升并发读取性能
- 外键约束开启 (`foreign_keys = ON`)

### Obsidian 集成策略
- 不接管 Obsidian 的编辑功能
- 只做只读扫描：遍历目录 → 读取 `.md` → 解析 frontmatter #tags + 内联标签 → 写入 `obsidian_notes`
- 点击笔记通过 `obsidian://` URI scheme 在 Obsidian 中打开

## 目录结构

```
prism/
├── electron/               # 主进程 (Node.js)
│   ├── main.ts             # 窗口创建、IPC 注册、应用生命周期、扫描 Obsidian 仓库
│   ├── preload.ts          # contextBridge API 暴露给渲染进程
│   └── database.ts         # SQLite 初始化、CRUD、FTS 操作
├── src/                    # 渲染进程 (React)
│   ├── main.tsx            # React 入口，挂载 Provider
│   ├── App.tsx             # 顶部 Tab 导航（资源 / 知识库 / 搜索 / 设置）
│   ├── index.css           # Tailwind 指令 + CSS 变量 + 滚动条样式
│   ├── lib/api.ts          # window.prism 类型声明
│   ├── i18n/               # 国际化
│   │   ├── index.tsx        # LangProvider + useT hook
│   │   ├── zh.ts            # 中文翻译
│   │   └── en.ts            # 英文翻译
│   ├── theme/              # 主题
│   │   ├── ThemeProvider.tsx # ThemeProvider + useTheme hook
│   │   └── themes.ts        # 7 套预定义配色方案
│   └── components/
│       ├── WebResources.tsx  # 网页资源管理（增删改查、标签、搜索）
│       ├── ObsidianVault.tsx # Obsidian 知识库浏览（列表/树形视图）
│       ├── UnifiedSearch.tsx # 跨域全文搜索
│       └── Settings.tsx      # 设置页（知识库路径、外部程序、主题）
├── index.html
├── vite.config.ts          # Vite + vite-plugin-electron 配置
├── tsconfig.json
├── tailwind.config.js
└── postcss.config.js
```

## 构建流程

1. `vite` 处理 `src/` → `dist/` (渲染进程)
2. `vite-plugin-electron` 处理 `electron/` → `dist-electron/` (主进程 + preload)
3. `better-sqlite3` 作为外部模块被排除打包（native addon）
4. `electron-builder` 将两者打包为可分发的桌面应用

## 运行模式

- **开发**: `npm run electron:dev` → Vite dev server (localhost:5173) + Electron 窗口
- **生产**: `npm run electron:build` → TypeScript 检查 → Vite 构建 → electron-builder 打包
- **仅类型检查**: `npm run lint` → `tsc --noEmit`
