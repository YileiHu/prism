# Prism

本地优先的个人知识管理桌面应用：Markdown 笔记库、PDF 资料库、网页书签与 GTD 事务集中在一个窗口里。笔记是存放在任意文件夹中的普通 `.md` 文件，不依赖外部编辑器，数据完全归你所有。

## 快速开始

### 环境要求

- Node.js 20+
- Windows（主要开发与测试平台）

### 安装与运行

```bash
npm install
npm run rebuild        # 为 Electron 重新编译 better-sqlite3
npm run generate-icons # 由 icon.svg 生成 icon.png（仅首次或图标变更时）
npm run electron:dev   # 启动开发环境
```

开发环境固定使用 5173 端口，Vite 会同时启动渲染进程与 Electron 主进程，修改渲染层代码即时热更新。

### 首次配置

1. 打开左侧底部 **设置**。
2. **知识库**：添加一个或多个 Markdown 文件夹路径，Prism 会递归扫描其中的 `.md` 文件。
3. **PDF**：选择 PDF 仓库文件夹，应用会扫描并生成封面索引；文件本身仍在系统资源管理器中维护。
4. 返回 **资料** 页，从侧栏选择仓库开始浏览；也可到 **网页资源** 添加第一条书签。

## 功能概览

### 模块导航

顶部左侧四个图标依次为主页、资料、事务、网页资源，右侧是设置与窗口按钮。点击图标显示对应模块页，已打开的文档标签会保留；再次点击文档标签即回到文档。

### 文档标签与分屏

- 笔记与 PDF 共用顶部同一条标签栏，可以来自不同仓库、同时打开。
- 标签支持拖拽排序、滚轮横向滚动、中键或 X 关闭；右键可关闭其他、关闭全部。
- 右键标签选择「在右侧分屏打开」，即可让笔记 + PDF、笔记 + 笔记或 PDF + PDF 左右并排；点击任一窗格聚焦，工具栏与侧栏跟随聚焦窗格。
- 重启后按设置恢复上次的标签、分屏与当前页面。

### 资料页

资料页合并了笔记库与 PDF 库：

- 侧栏分为 **仓库** 与 **收藏集** 两段，可分别折叠，内容过多时内部滚动。
- 笔记模式支持标题 / 正文搜索、收藏集与分组、拖拽归类、批量移入回收站。
- PDF 模式支持网格、封面、收藏集、排序与重新扫描。
- 切换仓库时保留当前内容并淡入新数据，不会出现空屏。

### 笔记编辑

- 阅读 / 编辑双视图，切换时以视口中线为锚点保持位置，默认视图可在设置中配置。
- 自动保存（延迟可调）、大纲、表格、图片尺寸、代码块与公式渲染。
- 支持 wikilink 跳转、图片附件目录、拼写与快捷键等编辑器偏好。

### 事务与网页资源

- **事务**：收集箱 → 项目 → 行动的三层 GTD 流程，支持项目颜色、行动拖拽排序与「下一步」。
- **网页资源**：保存网址、标题、备注与彩色标签，按标签筛选、拖拽排序。

### 设置

按「通用 / 知识库 / PDF / 编辑器 / 外部程序 / 外观 / 搜索 / 快捷键」分类。外观支持深色、浅色、跟随系统，可分别调节正文字号、行高、内容宽度以及 H1–H6 与加粗颜色；快捷键可录制并自动检测冲突。

默认快捷键（可在设置中修改）：

| 操作 | 快捷键 |
| --- | --- |
| 聚焦搜索 | `Ctrl+F` |
| 切换阅读 / 编辑 | `Ctrl+E` |

## 开发

```bash
npm run lint           # tsc --noEmit
npm run build          # tsc + vite build
npm run electron:build # 打包安装程序
```

技术栈：Electron + React 19 + TypeScript + Vite + Tailwind，主进程使用 better-sqlite3（WAL 模式）持久化事务、书签与索引，渲染进程通过 `window.prism` IPC 调用。

主要目录：

```text
electron/              主进程与 preload
src/lib/workspace/     文档标签、分屏与工作区持久化
src/components/library/资料页（笔记 + PDF）
src/components/workspace/文档工作区与分屏窗格
src/components/toolbar/全局自适应工具栏
src/shared/settings.ts 设置键、默认值与校验（渲染层与主进程共用）
scripts/               仓库维护脚本
```

## 仓库维护脚本

```bash
node scripts/migrate-attachments.mjs <vault...>           # 预览：图片重命名为日期-时间，引用统一为标准 ![](path)
node scripts/migrate-attachments.mjs <vault...> --apply   # 执行（先备份）
node scripts/prune-attachments.mjs <vault...>             # 预览：列出未被引用的图片
node scripts/prune-attachments.mjs <vault...> --apply     # 移动到 .prism-pruned-<ts>/
node scripts/verify-attachments.mjs <vault...>            # 检查所有图片链接是否可解析
```
