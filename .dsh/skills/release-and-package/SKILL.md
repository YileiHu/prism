---
name: release-and-package
description: >-
  Prism release and packaging — use when bumping a version, updating the
  changelog, building the NSIS installer, committing, or pushing.
whenToUse: >-
  "release", "package", "build installer", "bump version", "changelog",
  "commit", "push"
user-invocable: true
---

# 发布与打包

## 何时用

- 发版、改版本号、写 changelog。
- 打 NSIS 安装包、检查 `release/` 产物。
- 提交/推送前核对。
- 需要回滚发布。

## 先读

- `docs/guides/verify-and-release.md`
- `src/data/changelog.ts`（版本与文案格式）
- `package.json`（version、scripts、electron-builder 配置）

## 发布清单

1. **changelog**：`src/data/changelog.ts` 顶部加新条目（`version`、`date`、`summary`、`highlights` 或 `changes`）。
2. **版本**：`package.json` 的 `version` 与 changelog 首条一致。
3. **验证**：
   ```bash
   npm run verify
   ```
   如果改了 IPC/设置/表结构，先 `npm run docs`。
4. **打包**：
   ```bash
   npm run release:win
   ```
   内部：`verify` → `vite build` → `electron-builder`（NSIS）。
5. **产物检查**：
   - `release/` 下有 `Prism Setup <version>.exe`、`.blockmap`、`latest.yml`；
   - `latest.yml` 的 `version`、`files[].url` 与实际文件名一致（历史上出现过不一致）；
   - 不要提交 `release/`（已 gitignore）。
6. **安装冒烟**：干净目录安装；启动后打开笔记库、笔记、PDF、白板、GTD、设置，确认无白屏/报错。
7. **提交**：
   ```bash
   git status
   git diff
   git add <files>
   git commit -m "Release vX.Y.Z with <主题>"
   ```
   提交风格沿用：`Release ...` / `Add ...` / `Polish ...`。
8. **推送**：`git push origin master`（先确认远端）。当前没有 tag 习惯；要打 tag 先问用户。
9. **外部仓库**：`D:\MyDocuments\MyNotes` 与构建无关；`Life/` 永不 `git add -f`。

## 日常提交（非发布）

- 文档/脚本改动：`Add ...` / `Update ...`。
- 修复：`Fix ...`；打磨：`Polish ...`。
- 不要把无关生成物、`debug.log`、`release/`、`node_modules` 加进提交。
- 默认不要自动 push；用户明确要求再推。

## 回滚

- 代码：`git revert <commit>` 或回退到上一个 release commit。
- 安装包：`release/` 保留历史版本，可重新分发旧包。
- 数据库迁移是向前兼容的手写 SQL；回滚代码前备份 `prism.db`（含 `-wal`/`-shm`）。

## 常见失败

| 现象 | 处理 |
|---|---|
| 打包后启动崩溃 | 检查 `better-sqlite3` 是否 rebuild；`dist-electron/main.js` 是否存在 |
| 版本/changelog 不一致 | `docs:check` 会报；改齐后重跑 |
| 安装包文件名与 `latest.yml` 不符 | 检查 electron-builder 配置/产物；必要时核对 yml |
| 文档检查失败 | `npm run docs`；再按报错修路径/链接/表名 |
| 沙箱里 npm 子进程报管道错误 | 用 `node node_modules/typescript/bin/tsc --noEmit` 等价检查；正常终端用 `npm run verify` |

## 不要做

- 不跑 UI 自动化；安装后由用户手动验收。
- 不删除用户 `userData` 数据。
- 不把 `Life/` 加入外部仓库。
- 不擅自改 `electron-builder` 的 appId/productName/target。
