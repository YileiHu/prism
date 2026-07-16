const zh = {
  // App header
  "app.title": "PRISM",
  "nav.resources": "网页资源",
  "nav.obsidian": "知识库",
  "nav.settings": "设置",
  "lang.switch": "English",

  // Web Resources
  "resources.addUrl": "输入网址保存...",
  "resources.add": "添加资源",
  "resources.addTitle": "新建资源",
  "resources.title": "标题（可选，留空则自动获取）...",
  "resources.notes": "备注（可选）...",
  "resources.tags": "输入标签，回车添加...",
  "resources.tagsHint": "回车可添加多个标签",
  "resources.search": "搜索资源...",
  "resources.empty": '暂无资源，点击上方"添加资源"开始使用。',
  "resources.emptySearch": "没有匹配的资源。",
  "resources.editNotes": "备注...",
  "resources.editTags": "标签...",
  "resources.allTags": "全部",
  "resources.save": "保存",
  "resources.cancel": "取消",
  "resources.noTitle": "无标题",

  // Obsidian Vault
  "obsidian.selectVault": "选择 Obsidian 知识库",
  "obsidian.changeVault": "更换知识库",
  "obsidian.refresh": "刷新",
  "obsidian.search": "搜索笔记...",
  "obsidian.empty": "还未配置知识库。请先在设置中添加 Obsidian 知识库路径。",
  "obsidian.emptySearch": "没有匹配的笔记。",
  "obsidian.emptyVault": "此知识库中没有找到 Markdown 文件。",
  "obsidian.scanning": "正在扫描知识库...",
  "obsidian.openInObsidian": "在 Obsidian 中打开",
  "obsidian.view.list": "列表",
  "obsidian.view.tree": "树形",
  "obsidian.chooseVault": "选择知识库",

  // Settings
  "settings.title": "设置",
  "settings.catVaults": "知识库",
  "settings.catExternal": "外部程序",
  "settings.catAppearance": "外观",
  "settings.vaults": "Obsidian 知识库路径",
  "settings.vaultsDesc": "配置知识库路径后，可以在 Obsidian 面板中快速切换。",
  "settings.addVault": "添加知识库路径",
  "settings.vaultPath": "路径",
  "settings.vaultName": "名称",
  "settings.vaultNamePlaceholder": "给知识库起个名字...",
  "settings.removeVault": "移除",
  "settings.noVaults": "暂无配置的知识库。点击上方按钮添加。",
  "settings.external": "外部程序",
  "settings.externalDesc": "配置用于打开网页和笔记的外部程序。",
  "settings.browserPath": "浏览器路径",
  "settings.browserPathPlaceholder": "留空使用系统默认浏览器...",
  "settings.obsidianPath": "Obsidian 程序路径",
  "settings.obsidianPathPlaceholder": "留空使用系统默认程序打开...",
  "settings.selectFile": "选择文件",
  "settings.browserTest": "测试浏览器",
  "settings.obsidianTest": "测试 Obsidian",
  "settings.appearance": "主题配色",
  "settings.appearanceDesc": "选择你喜欢的主题配色方案。",
  "settings.currentTheme": "当前主题",

  // Collections
  "collections.new": "新建收藏集",
  "collections.namePlaceholder": "收藏集名称...",
  "collections.rename": "重命名",
  "collections.delete": "删除收藏集",
  "collections.deleteConfirm": "删除收藏集不会删除其中的笔记文件。确定删除吗？",
  "collections.emptyHint": "点击下方 + 按钮创建第一个收藏集",
  "collections.none": "暂无收藏集",
  "collections.allNotes": "全部笔记",
  "collections.noNotes": "此收藏集为空，从左侧拖入笔记或使用右键菜单添加。",
  "collections.back": "返回全部笔记",
  "collections.addTo": "添加到收藏集",
  "collections.removeFrom": "从收藏集中移除",
  "collections.addGroup": "添加分组",
  "collections.ungrouped": "未分组",
  "collections.dropNotesHere": "拖入笔记到此处",
  "collections.expandAll": "展开全部",
  "collections.collapseAll": "折叠全部",
  "collections.alreadyExists": "已存在，未重复添加",
  "collections.added": "已添加到 {name}",
  "collections.removed": "已从收藏集中移除",
  "collections.missing": "(已失效)",

  // Context menu
  "menu.openInObsidian": "在 Obsidian 中打开",
  "menu.showInExplorer": "在文件资源管理器中显示",
  "menu.rename": "重命名",
  "menu.addToCollection": "添加到收藏集",
  "menu.moveToTrash": "移动到回收站",

  // Rename
  "obsidian.renameTitle": "新名称...",
  "obsidian.renamed": "已重命名为 {name}",

  // Batch
  "batch.selected": "已选择 {count} 项",
  "batch.addToCollection": "添加到收藏集",
  "batch.delete": "移动到回收站",
  "batch.selectMode": "选择",
  "batch.cancelSelect": "取消",

  // New Note
  "obsidian.newNote": "新建笔记",
  "obsidian.newNoteTitle": "笔记名称...",
  "obsidian.newNoteCreated": "已创建 {name}",
  "obsidian.newNoteCollection": "收藏集（可选）",
  "obsidian.newNoteGroup": "分组（可选）",
  "obsidian.newNoteNoCollection": "不添加到收藏集",
  "obsidian.newNoteNoGroup": "不分组",

  // Default Notes Directory
  "settings.defaultNotesDir": "默认笔记目录",
  "settings.defaultNotesDirDesc": "新建笔记时存放位置（相对于知识库根目录），例如：inbox",
  "settings.defaultNotesDirPlaceholder": "例如：inbox",

  // Confirm
  "confirm.deleteFile": "确定要将 {name} 移动到回收站吗？",
  "confirm.deleteFiles": "确定要将 {count} 个文件移动到回收站吗？",
};

export default zh;
export type Translation = typeof zh;
