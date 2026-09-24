# Prism

Personal knowledge management desktop app — web bookmarks and local Markdown note libraries in one place. Fully standalone: notes are plain `.md` files in folders you choose, no external editor required.

## Dev

```bash
npm install
npm run rebuild        # rebuild better-sqlite3 for Electron
npm run generate-icons # generate icon.png from icon.svg
npm run electron:dev   # start dev server
```

## Vault maintenance scripts

```bash
node scripts/migrate-attachments.mjs <vault...>           # preview: rename images to date-time names
                                                           #   + rewrite note refs to standard ![](path)
node scripts/migrate-attachments.mjs <vault...> --apply   # execute (backs up first)
node scripts/prune-attachments.mjs <vault...>             # preview: list unreferenced images
node scripts/prune-attachments.mjs <vault...> --apply     # move them to .prism-pruned-<ts>/
node scripts/verify-attachments.mjs <vault...>            # check every image link resolves
```

## Build

```bash
npm run electron:build
```
