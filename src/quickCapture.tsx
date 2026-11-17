import { StrictMode, useEffect, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { X, Zap } from "lucide-react";
import { LangProvider, useT } from "./i18n";
import { ThemeProvider } from "./theme/ThemeProvider";
import { ToastProvider } from "./lib/toast";
import InboxCapture from "./components/gtd/InboxCapture";
import "./lib/api";
import "./index.css";

const DRAG_REGION = { WebkitAppRegion: "drag" } as CSSProperties;
const NO_DRAG_REGION = { WebkitAppRegion: "no-drag" } as CSSProperties;

function QuickCaptureApp() {
  const { t } = useT();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape while an IME composition is active belongs to the IME.
      if (event.isComposing || event.key === "Process" || event.key !== "Escape") return;
      event.preventDefault();
      void window.prism.closeQuickCapture();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base p-3 text-primary">
      <header className="flex flex-shrink-0 items-center gap-2" style={DRAG_REGION}>
        <Zap size={14} className="flex-shrink-0 text-[var(--accent-text)]" />
        <span className="truncate text-caption font-medium text-secondary">
          {t["gtd.quickCaptureTitle"]}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => { void window.prism.closeQuickCapture(); }}
          title={t["common.close"]}
          aria-label={t["common.close"]}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-hover hover:text-primary"
          style={NO_DRAG_REGION}
        >
          <X size={14} strokeWidth={1.6} />
        </button>
      </header>

      <p className="mt-1 flex-shrink-0 text-meta leading-relaxed text-faint">
        {t["gtd.quickCaptureHint"]}
      </p>

      <div className="mt-2 min-h-0 flex-1">
        <InboxCapture
          autoFocus
          fill
          rows={2}
          className="h-full"
          placeholder={t["gtd.quickCapturePlaceholder"]}
          onSaved={() => { void window.prism.quickCaptureSaved(); }}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <LangProvider>
        <ToastProvider>
          <QuickCaptureApp />
        </ToastProvider>
      </LangProvider>
    </ThemeProvider>
  </StrictMode>
);
