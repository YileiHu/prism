import { BookOpen, Frame, Globe, Library, type LucideIcon } from "lucide-react";
import type { Translation } from "../../i18n/zh";

export type LibrarySourceKind = "note" | "canvas" | "pdf" | "resources";

export interface LibrarySourceDef {
  kind: LibrarySourceKind;
  labelKey: keyof Translation;
  icon: LucideIcon;
  /** Singleton sources are fixed sidebar rows; note/canvas follow a vault. */
  fixed: boolean;
  /** Sidebar section the source belongs to: note vaults or the fixed footer. */
  sectionLabelKey: keyof Translation;
  groupLabelKey: keyof Translation;
  allLabelKey: keyof Translation;
}

// Static metadata for the sources that live inside the library module. Keep
// behaviour (loading, search, opening) in source-specific hooks/components;
// this registry only removes label/icon/key switches from the shared UI.
export const LIBRARY_SOURCES: Record<LibrarySourceKind, LibrarySourceDef> = {
  note: {
    kind: "note",
    labelKey: "nav.library",
    icon: Library,
    fixed: false,
    sectionLabelKey: "library.noteVaults",
    groupLabelKey: "library.collections",
    allLabelKey: "collections.allNotes",
  },
  canvas: {
    kind: "canvas",
    labelKey: "canvas.section",
    icon: Frame,
    fixed: false,
    sectionLabelKey: "library.noteVaults",
    groupLabelKey: "library.collections",
    allLabelKey: "collections.allNotes",
  },
  pdf: {
    kind: "pdf",
    labelKey: "library.pdfLibrary",
    icon: BookOpen,
    fixed: true,
    sectionLabelKey: "library.globalLibraries",
    groupLabelKey: "library.collections",
    allLabelKey: "pdf.all",
  },
  resources: {
    kind: "resources",
    labelKey: "library.resourcesLibrary",
    icon: Globe,
    fixed: true,
    sectionLabelKey: "library.globalLibraries",
    groupLabelKey: "library.collections",
    allLabelKey: "library.allResources",
  },
};
