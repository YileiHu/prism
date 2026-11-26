import { StrictMode, useEffect, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { Plus, X, Zap } from "lucide-react";
import { LangProvider, useT } from "./i18n";
import { ThemeProvider } from "./theme/ThemeProvider";
import { ToastProvider, useToast } from "./lib/toast";
import Button from "./components/Button";
import Input from "./components/Input";
import "./lib/api";
import "./index.css";

const DRAG_REGION = { WebkitAppRegion: "drag" } as CSSProperties;
const NO_DRAG_REGION = { WebkitAppRegion: "no-drag" } as CSSProperties;

function QuickCaptureApp() {
  const { t } = useT();
  const showToast = useToast();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

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

  const save = async () => {
    const clean = title.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await window.prism.addGrowthTask({ title: clean });
      await window.prism.quickCaptureSaved();
    } catch {
      showToast(t["common.saveFailed"], "error");
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base p-3 text-primary">
      <header className="flex flex-shrink-0 items-center gap-2" style={DRAG_REGION}>
        <Zap size={14} className="flex-shrink-0 text-[var(--accent-text)]" />
        <span className="truncate text-caption font-medium text-secondary">
          {t["growth.tasks.quickTitle"]}
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
        {t["growth.tasks.quickHint"]}
      </p>

      <div className="mt-2 flex flex-1 flex-col gap-2">
        <Input
          autoFocus
          value={title}
          placeholder={t["growth.tasks.quickPlaceholder"]}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void save();
            }
          }}
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !title.trim()}
            onClick={() => void save()}
          >
            <Plus size={14} />
            {t["growth.tasks.add"]}
          </Button>
        </div>
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
