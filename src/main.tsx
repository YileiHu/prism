import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LangProvider } from "./i18n";
import { ThemeProvider } from "./theme/ThemeProvider";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <LangProvider>
        <App />
      </LangProvider>
    </ThemeProvider>
  </StrictMode>
);
