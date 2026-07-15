# Frontend Components

## 组件树

```
main.tsx
 ├─ ThemeProvider         (CSS 变量主题切换)
 │   └─ LangProvider      (中/英文切换)
 │       └─ App.tsx       (Tab 导航壳)
 │           ├─ WebResources.tsx    (Tab: 网页资源)
 │           ├─ ObsidianVault.tsx   (Tab: Obsidian 知识库)
 │           │   ├─ CollectionsSidebar.tsx    — 左侧收藏集列表 + 底部工具栏
 │           │   ├─ CollectionDetail.tsx      — 收藏集分组卡片视图
 │           │   ├─ ContextMenu.tsx           — 通用右键菜单
 │           │   ├─ CreateCollectionModal.tsx — 新建/重命名收藏集弹窗
 │           │   └─ BatchActionBar.tsx        — 批量操作浮动底栏
 │           ├─ UnifiedSearch.tsx   (Tab: 统一搜索)
 │           └─ Settings.tsx        (Tab: 设置)
```

## 状态管理

不使用状态库，策略：

| 状态类型 | 方案 | 示例 |
|----------|------|------|
| 组件本地状态 | `useState` | Tab 切换、表单输入、编辑模式、折叠状态 |
| 持久化设置 | `settings:get/set` IPC → SQLite | 知识库列表、浏览器路径 |
| 知识库视图数据 | `.prism/collections.json` | 收藏集、分组、排序 |
| 主题偏好 | `localStorage` + CSS 变量 | 当前主题色 |
| 临时 UI 状态 | `useState` | 下拉菜单、搜索查询、选中项 |

## 组件详解

### App.tsx — 导航壳

4 个 Tab: 资源 / 知识库 / 搜索 / 设置。`useState<Tab>` + 条件渲染，右上角语言切换。

### WebResources.tsx — 网页资源管理

列表视图、添加模态框、内联编辑、搜索 + 标签筛选、标签自动完成。

### ObsidianVault.tsx — 知识库浏览（收藏集）

**核心布局**: 左侧 CollectionsSidebar + 右侧主区域。

**全部笔记视图**: 平铺列表，搜索框 + 选择模式按钮，笔记行支持拖拽到侧边栏、右键菜单、选择模式复选框。

**收藏集详情视图**: 收藏集名 + 笔记数 + 展开/折叠全部按钮 → 分组卡片列表 + 未分组卡片 + 添加分组按钮。每个分组卡片有独立配色（5 色复古循环）、折叠/展开、重命名/删除菜单。

**底部批量操作栏**: 选中笔记后浮现，支持批量添加到收藏集和批量移动到回收站。

**自动分组**: 运行 `scripts/generate-collections.mjs` 根据 `.base` 文件自动生成收藏集和二级分组。

### CollectionsSidebar.tsx — 侧边栏

- 收藏集列表：拖拽排序、drop target（接受笔记拖入）、悬停 `⋯` 菜单
- 底部工具栏（4 个图标按钮）：📁 选仓库 / 🔄 刷新 / + 新建收藏集 / 🏠 全部笔记
- 仓库图标使用琥珀色突出显示

### CollectionDetail.tsx — 分组卡片视图

- 一级分组卡片：圆角边框 + 微色标题行、可折叠、`⋯` 菜单（重命名/删除）、内联重命名
- 未分组卡片：相同结构但中性灰配色，也支持折叠
- 笔记行：`≡` 拖拽手柄 + 纯标题 + 悬停 `✕` 移除
- 笔记跨组拖拽、组内排序拖拽、分组拖拽排序
- 展开/折叠全部按钮（状态由父组件管理）

### ContextMenu.tsx — 右键菜单

通用组件，支持：子菜单、选中标记 `✓`、分隔线、危险操作红色。自动适配屏幕边缘，Esc 或外部点击关闭。

### UnifiedSearch.tsx — 统一搜索

跨网页资源和 Obsidian 笔记的全文搜索，区分显示来源类型。

### Settings.tsx — 设置页

三栏布局（类别导航 + 内容区），分类：知识库 / 外部程序 / 外观（7 套预定义主题）。

## 通用交互模式

- **悬停显操作**: `opacity-0 group-hover:opacity-100`
- **空状态**: 每个面板都有空状态提示文案
- **加载动画**: 扫描时 "正在扫描..." + 旋转图标
- **Toast 提示**: 底部居中浮动，2.5s 自动消失
- **确认弹窗**: 危险操作前弹出确认对话框
