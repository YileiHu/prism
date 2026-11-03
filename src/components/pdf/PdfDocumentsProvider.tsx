import { createContext, useContext, type ReactNode } from "react";
import { usePdfLibrary } from "./usePdfLibrary";

type PdfDocumentsValue = ReturnType<typeof usePdfLibrary>;

const PdfDocumentsContext = createContext<PdfDocumentsValue | null>(null);

// One repository scan shared by the library page, the document workspace and
// the tab titles. Keeping it at the root also means readers stay resolvable
// while the library module is hidden.
export function PdfDocumentsProvider({ children }: { children: ReactNode }) {
  const value = usePdfLibrary(true);
  return <PdfDocumentsContext.Provider value={value}>{children}</PdfDocumentsContext.Provider>;
}

export function usePdfDocuments(): PdfDocumentsValue {
  const value = useContext(PdfDocumentsContext);
  if (!value) throw new Error("usePdfDocuments must be used inside PdfDocumentsProvider");
  return value;
}
