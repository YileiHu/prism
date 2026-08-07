import type { Translation } from "./zh";

const en: Translation = {
  "app.title": "PRISM",
  "nav.resources": "Web Resources",
  "nav.settings": "Settings",

  "resources.addUrl": "Enter URL to save...",
  "resources.add": "Add Resource",
  "resources.addTitle": "New Resource",
  "resources.editTitle": "Edit Resource",
  "resources.title": "Title (optional, auto-fetched if empty)...",
  "resources.tags": "Type a tag and press Enter...",
  "resources.search": "Search resources...",
  "resources.empty": 'No resources yet. Click "Add Resource" to get started.',
  "resources.emptySearch": "No resources match your search.",
  "resources.allTags": "All",
  "resources.save": "Save",
  "resources.cancel": "Cancel",
  "resources.urlExists": "This URL is already saved",

  "obsidian.search": "Search notes...",
  "obsidian.emptySearch": "No notes match your search.",
  "obsidian.emptyVault": "No markdown files found in this vault.",
  "obsidian.scanning": "Scanning vault...",
  "obsidian.uncategorized": "Uncategorized",
  "obsidian.notesCount": "{count} notes",
  "obsidian.deleteFailed": "Failed to delete: {error}",
  "obsidian.renameFailed": "Rename failed",
  "obsidian.vaultNotFound": "Vault not accessible",
  "obsidian.vaultNotFoundDesc": "The path {path} does not exist or is not readable. Check that the drive is connected, or update the path in Settings.",
  "obsidian.retry": "Retry",

  "settings.catVaults": "Vaults",
  "settings.catExternal": "External",
  "settings.catAppearance": "Appearance",
  "settings.vaults": "Obsidian Vault Paths",
  "settings.vaultsDesc": "Configure vault paths to quickly switch between them in the Obsidian panel.",
  "settings.addVault": "Add Vault Path",
  "settings.vaultPath": "Path",
  "settings.vaultNamePlaceholder": "Name your vault...",
  "settings.vaultExists": "This path is already added",
  "settings.noVaults": "No vaults configured. Click the button above to add one.",
  "settings.saved": "Saved",
  "settings.external": "External Programs",
  "settings.externalDesc": "Configure external programs for opening resources and notes.",
  "settings.browserPath": "Browser Path",
  "settings.browserPathPlaceholder": "Leave empty to use system default browser...",
  "settings.obsidianPath": "Obsidian Path",
  "settings.obsidianPathPlaceholder": "Leave empty to use system default app...",
  "settings.selectFile": "Select File",
  "settings.browserTest": "Test Browser",
  "settings.obsidianTest": "Test Obsidian",
  "settings.appearance": "Theme",
  "settings.appearanceDesc": "Choose a color theme for the interface.",
  "settings.language": "Language",
  "settings.languageDesc": "Change the interface language. Takes effect immediately.",

  // Collections
  "collections.new": "New Collection",
  "collections.namePlaceholder": "Collection name...",
  "collections.rename": "Rename",
  "collections.delete": "Delete Collection",
  "collections.deleteGroup": "Delete Group",
  "collections.deleteConfirm": "Deleting a collection will not delete the note files. Are you sure?",
  "collections.emptyHint": "Click the + button below to create your first collection",
  "collections.none": "No collections",
  "collections.allNotes": "All Notes",
  "collections.noNotes": "This collection is empty. Drag notes from the left or use the right-click menu to add.",
  "collections.addGroup": "Add Group",
  "collections.ungrouped": "Ungrouped",
  "collections.dropNotesHere": "Drop notes here",
  "collections.expandAll": "Expand All",
  "collections.collapseAll": "Collapse All",
  "collections.alreadyExists": "Already exists in collection",
  "collections.added": "Added to {name}",
  "collections.moved": "Moved to {name}",
  "collections.removed": "Removed from collection",
  "collections.missing": "(missing)",

  // Context menu
  "menu.openInObsidian": "Open in Obsidian",
  "menu.showInExplorer": "Show in File Explorer",
  "menu.rename": "Rename",
  "menu.addToCollection": "Add to Collection",
  "menu.moveToTrash": "Move to Trash",
  "menu.removeFromCollection": "Remove from Collection",
  "menu.moveTo": "Move to",
  "menu.delete": "Delete",
  "menu.openInBrowser": "Open in Browser",
  "menu.edit": "Edit",

  // Rename
  "obsidian.renameTitle": "New name...",
  "obsidian.renamed": "Renamed to {name}",

  // Batch
  "batch.selected": "{count} selected",
  "batch.addToCollection": "Add to Collection",
  "batch.delete": "Move to Trash",
  "batch.selectMode": "Select",
  "batch.cancelSelect": "Cancel",
  "batch.deleted": "Deleted {count} files",
  "batch.deleteFailed": "Failed to delete {count} file(s)",

  // New Note
  "obsidian.newNote": "New Note",
  "obsidian.newNoteTitle": "Note title...",
  "obsidian.newNoteCreated": "Created {name}",
  "obsidian.newNoteCollection": "Collection (optional)",
  "obsidian.newNoteGroup": "Group (optional)",
  "obsidian.newNoteNoCollection": "No collection",
  "obsidian.newNoteNoGroup": "No group",

  // Default Notes Directory
  "settings.defaultNotesDir": "Default Notes Directory",
  "settings.defaultNotesDirDesc": "Where to place new notes (relative to vault root), e.g., inbox",
  "settings.defaultNotesDirPlaceholder": "e.g., inbox",

  // Changelog
  "changelog.title": "Changelog",
  "changelog.button": "Changelog",

  // Confirm
  "confirm.deleteFile": "Move {name} to trash?",
  "confirm.deleteFiles": "Move {count} files to trash?",
};

export default en;
