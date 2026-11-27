export interface VaultEntry {
  name: string;
  path: string;
  // Hint only — the authoritative marker lives in <vault>/.prism/private.json.
  private?: boolean;
}
