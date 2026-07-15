# Prism Documentation

Prism 是一个个人知识管理桌面应用 —— 为个人知识系统提供索引和管理层。它不替代已有工具（如 Obsidian），而是作为补充层，提供统一的收集、组织和搜索能力。

## 文档索引

| 文档 | 内容 |
|------|------|
| [architecture.md](./architecture.md) | 整体架构、进程模型、技术栈、项目结构 |
| [ipc-api.md](./ipc-api.md) | IPC 通信接口完整参考（含收藏集和 Shell 操作） |
| [database.md](./database.md) | SQLite Schema + `.prism/collections.json` 数据模型 |
| [components.md](./components.md) | 前端 React 组件树、状态管理、数据流（含收藏集组件） |
| [feature-collections.md](./feature-collections.md) | 收藏集功能设计文档（数据模型、交互、组件拆分） |
| [i18n-theme.md](./i18n-theme.md) | 国际化 (i18n) 与主题系统 |

## 快速上手

```bash
npm install
npm run rebuild        # 为 Electron 的 Node 版本重编译 better-sqlite3
npm run electron:dev   # 启动开发环境
```

## 技术栈一览

- **桌面壳**: Electron 43
- **前端**: React 19 + TypeScript 7 + Vite 8
- **UI**: Tailwind CSS 3.4 + lucide-react 图标
- **数据库**: SQLite (better-sqlite3) + FTS5 全文搜索
- **后期计划**: Chrome 扩展（快速保存网页）
