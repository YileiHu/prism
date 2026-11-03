import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LangProvider } from "./i18n";
import { ThemeProvider } from "./theme/ThemeProvider";
import { SettingsProvider } from "./lib/settings";
import { ToolbarProvider } from "./components/toolbar/ToolbarProvider";
import { PdfDocumentsProvider } from "./components/pdf/PdfDocumentsProvider";
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
              <WorkspaceProvider>
                <ContextMenuProvider>
                  <App />
                </ContextMenuProvider>
              </WorkspaceProvider>
            </PdfDocumentsProvider>
          </ToolbarProvider>
        </SettingsProvider>
      </LangProvider>
    </ThemeProvider>
  </StrictMode>
);
