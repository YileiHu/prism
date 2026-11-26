# 验证与发布

> 日常只跑 `npm run verify`；UI 由用户手动验收。发布前按本文清单逐项过。

## 环境与首次安装

要求：Node.js 20+（当前开发环境 Node 22）、Windows 为主。

```bash
npm install
npm run rebuild          # 为 Electron 重编译 better-sqlite3
npm run generate-icons   # 仅首次或改图标时
npm run electron:dev     # Vite + Electron，固定 5173
```

`npm run electron:dev` 会同时启动渲染进程与主进程；Vite 使用 `strictPort`，5173 被占用会直接失败而不是换端口（换端口会导致 Electron 加载空白页）。

## 自动检查

| 命令 | 内容 | 何时跑 |
|---|---|---|
| `npm run lint` | `tsc --noEmit` | 每次改完 |
| `npm run docs` | 重新生成 `docs/reference/*` | 改 IPC/设置/表结构/导出后 |
| `npm run docs:check` | 生成物、IPC、链接、路径、版本、i18n、复用/样式检查（调色板/hex、原生数字输入、重复导出、共享控件登记） | 提交前 |
| `npm run verify` | `lint` + `docs:check` | 默认收尾 |
| `npm run build` | `tsc` + `vite build` | 需要验证生产构建时 |
| `npm run electron:build` | `vite build` + `electron-builder`（NSIS） | 出安装包 |
| `npm run release:win` | `verify` + `electron:build` | 正式发版 |

> 本仓库没有测试框架、没有 CI；不要新增 Playwright/CDP/截图类 UI 自动化。

### Markdown 渲染 smoke test（可选）

`scripts/md-smoke-test.mjs` 需要先构建两个 bundle。项目没有内置 esbuild 依赖，`npx` 首次会临时下载：

```bash
npx esbuild src/components/editor/markdown.ts --bundle --format=esm --platform=node --outfile=out/md-test.mjs
npx esbuild src/components/editor/taskToggle.ts --bundle --format=esm --platform=node --outfile=out/task-toggle.mjs
node scripts/md-smoke-test.mjs
```

覆盖 frontmatter、callout、任务列表、表格换行、图片尺寸、嵌入、公式、代码高亮、HTML 转义、CRLF 任务切换等。改了 `markdown.ts` / `callouts.ts` / `imageSize.ts` / `taskToggle.ts` 时建议跑。

### 手动 UI 验收

自动检查不覆盖视觉与交互。改完代码后，在说明里列出需要手测的路径，例如：

- 深色/浅色、窄窗口、侧栏折叠；
- 阅读/编辑切换、表格/代码/callout/公式/嵌入；
- 笔记库切换、搜索、收藏集拖拽、回收站；
- PDF 打开/翻页/封面、白板保存冲突；
- 分屏左右聚焦、标签恢复、冷启动固定养成-能力总览、托盘/隐藏启动恢复现场、任务日期分组、私密库锁定。

## 发布清单

1. **写 changelog**：`src/data/changelog.ts` 顶部加新版本（`version`、`date`、`summary`、`highlights` 或 `changes`）。
2. **改版本**：`package.json` 的 `version` 与 changelog 首条一致；`npm run docs:check` 会校验。
3. **跑验证**：`npm run verify`。
4. **打包**：`npm run release:win`（内部先 verify，再 `vite build && electron-builder`）。
5. **检查产物**：`release/` 下应有 `Prism Setup <version>.exe`、`.blockmap`、`latest.yml`；确认 `latest.yml` 里的 `version` 与 `files[].url` 对得上实际文件名（历史上出现过文件名与 yml 不一致的情况）。
6. **安装冒烟**：在干净目录安装；启动后依次打开笔记库、笔记、PDF、白板、养成、设置，确认无白屏/报错。
7. **提交**：`git status` → `git diff` → `git add`；提交信息沿用现有风格：`Release vX.Y.Z with <主题>`，功能提交用 `Add ...` / `Polish ...`。
8. **推送**：`git push origin master`。当前仓库没有打 tag 的习惯；如要打 tag，先和用户确认。
9. **不要动外部笔记仓库**：`D:\MyDocuments\MyNotes` 与构建无关；`Life/` 永不 `git add -f`。

## 回滚

- 代码：`git revert <commit>` 或切回上一个 release commit。
- 安装包：`release/` 保留历史版本，可重新分发旧安装包；不要删除用户 `userData/prism.db`。
- 数据库迁移是向前兼容的手写 SQL；回滚代码前先备份 `prism.db`（含 `-wal`/`-shm`）。

## 常用诊断

| 现象 | 先查 |
|---|---|
| 启动即崩溃/白屏 | `npm run rebuild` 是否跑过；Electron 版本是否升级；5173 是否被占用 |
| 类型检查通过但文档检查失败 | 先 `npm run docs`；再看 `docs:check` 的具体路径/链接 |
| 构建产物打不开 | `vite build` 是否成功；`dist-electron/main.js` 是否存在；`package.json` 的 `main` 是否指向它 |
| 安装包文件名与 `latest.yml` 不一致 | 检查 electron-builder 配置与产物；必要时手动核对 `latest.yml` |
| 沙箱环境 `npm` 子进程报管道错误 | 用 `node node_modules/typescript/bin/tsc --noEmit` 等价执行类型检查；正常终端用 `npm run verify` |

更多问题见 [排错](troubleshooting.md)。
