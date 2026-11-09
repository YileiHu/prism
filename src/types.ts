export interface VaultEntry {
  name: string;
  path: string;
  // Preset id from lib/vaultIcons; undefined falls back to the library icon.
  icon?: string;
  // Hint only — the authoritative marker lives in <vault>/.prism/private.json.
  private?: boolean;
}
