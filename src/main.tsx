import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LangProvider } from "./i18n";
import { ThemeProvider } from "./theme/ThemeProvider";
import { SettingsProvider } from "./lib/settings";
import App from "./App";
import "./lib/api";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <LangProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </LangProvider>
    </ThemeProvider>
  </StrictMode>
);
