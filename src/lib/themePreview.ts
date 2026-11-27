import type { ThemeDef } from "../shared/themes";

/**
 * Preview fill: solid accent for ordinary themes; 50/50 accent + accent2
 * only for dual-colour themes (GENESIS).
 */
export function themeAccentFill(theme: Pick<ThemeDef, "accent" | "accent2">): string {
  return theme.accent2
    ? `linear-gradient(90deg, ${theme.accent} 0 50%, ${theme.accent2} 50% 100%)`
    : theme.accent;
}
