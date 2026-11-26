import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LangProvider } from "./i18n";
import { ThemeProvider } from "./theme/ThemeProvider";
import { SettingsProvider } from "./lib/settings";
import { ToolbarProvider } from "./components/toolbar/ToolbarProvider";
import { PdfDocumentsProvider } from "./components/pdf/PdfDocumentsProvider";
import { VaultLockProvider } from "./lib/vaultLock";
import { WorkspaceProvider } from "./lib/workspace/WorkspaceProvider";
import { ContextMenuProvider } from "./lib/useContextMenu";
import App from "./App";
import "./lib/api";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <LangProvider>
        <SettingsProvider>
          <ToolbarProvider>
            <PdfDocumentsProvider>
              <VaultLockProvider>
                <WorkspaceProvider>
                  <ContextMenuProvider>
                    <App />
                  </ContextMenuProvider>
                </WorkspaceProvider>
              </VaultLockProvider>
            </PdfDocumentsProvider>
          </ToolbarProvider>
        </SettingsProvider>
      </LangProvider>
    </ThemeProvider>
  </StrictMode>
);
