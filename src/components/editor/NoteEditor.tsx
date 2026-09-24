import { useCallback, useEffect, useRef, useState } from "react";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { BookOpen, Pencil, RefreshCw, Table, TextQuote } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { type MenuItem } from "../ContextMenu";
import Button from "../Button";
import { buildExtensions } from "./cmExtensions";
import MarkdownPreview from "./MarkdownPreview";
import { toggleTaskInSource } from "./markdown";
import { resolveRelativeLink } from "./linkResolver";

type EditorMode = "edit" | "read";

// Path inserted for a pasted image, per the image_path_style setting:
// "note" (default) = relative to the note's folder (../attachments/x.png),
// "vault" = vault-root-relative, "name" = filename only
async function markdownImagePath(ref: string, vaultPath: string, notePath: string): Promise<string> {
  let style = "note";
  try { style = (await window.prism.getSetting("image_path_style")) || "note"; } catch { /* default */ }
  let target = ref;
  if (style === "name") {
    target = ref.split("/").pop() ?? ref;
  } else if (style === "note") {
    const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    const vaultN = norm(vaultPath);
    let dir = norm(notePath);
    dir = dir.slice(0, dir.lastIndexOf("/")); // note's folder
    if (dir === vaultN) dir = "";
    else if (dir.startsWith(vaultN + "/")) dir = dir.slice(vaultN.length + 1);
    const from = dir ? dir.split("/") : [];
    const toL = ref.toLowerCase().split("/");
    let i = 0;
    while (i < from.length && i < toL.length - 1 && from[i] === toL[i]) i++;
    target = "../".repeat(from.length - i) + ref.split("/").slice(i).join("/");
  }
  // Angle brackets keep paths with spaces/parens valid markdown
  return /[\s()]/.test(target) ? `<${target}>` : target;
}

interface Props {
  vaultPath: string;
  notePath: string;
  title: string;
  onNoteGone: (path: string) => void;
  onOpenWikilink: (target: string) => void;
}

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const AUTOSAVE_DELAY = 1000;

export default function NoteEditor({ vaultPath, notePath, title, onNoteGone, onOpenWikilink }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const { onContextMenu } = useContextMenu();

  // Prefix every line overlapping the selection with "> " (blank lines get a
  // bare ">") — or strip one level of ">" when adding is false
  const applyQuotePrefix = useCallback((add: boolean) => {
    const view = viewRef.current;
    if (!view) return;
    const { state } = view;
    const main = state.selection.main;
    const fromLine = state.doc.lineAt(main.from);
    // A selection ending exactly at a line boundary shouldn't touch that line
    const endPos = main.to > main.from && main.to === state.doc.lineAt(main.to).from ? main.to - 1 : main.to;
    const toLine = state.doc.lineAt(Math.max(main.from, endPos));
    const changes: { from: number; to: number; insert: string }[] = [];
    for (let n = fromLine.number; n <= toLine.number; n++) {
      const line = state.doc.line(n);
      if (add) {
        changes.push({ from: line.from, to: line.from, insert: line.text.trim() ? "> " : ">" });
      } else {
        const m = /^> ?/.exec(line.text);
        if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: "" });
      }
    }
    if (changes.length === 0) return;
    // Selection maps through the changes automatically
    view.dispatch({ changes, scrollIntoView: true, userEvent: "input" });
    view.focus();
  }, []);

  // Insert a 2×2 table skeleton; the cursor lands in the first cell
  const insertTableSkeleton = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const { state } = view;
    const main = state.selection.main;
    const line = state.doc.lineAt(main.head);
    const before = state.sliceDoc(line.from, main.head);
    const prefix = before.trim() ? "\n" : "";
    const skeleton = `${prefix}|  |  |\n| --- | --- |\n|  |  |`;
    view.dispatch({
      changes: { from: main.from, to: main.to, insert: skeleton },
      selection: { anchor: main.from + prefix.length + 2 },
      scrollIntoView: true,
      userEvent: "input",
    });
    view.focus();
  }, []);

  const handleEditorContextMenu = useCallback((e: React.MouseEvent) => {
    const items: MenuItem[] = [
      { label: t["editor.addQuotePrefix"], icon: <TextQuote size={14} />, onClick: () => applyQuotePrefix(true) },
      { label: t["editor.removeQuotePrefix"], icon: <TextQuote size={14} />, onClick: () => applyQuotePrefix(false) },
      { label: "", divider: true },
      { label: t["editor.insertTable"], icon: <Table size={14} />, onClick: insertTableSkeleton },
    ];
    onContextMenu(e, items);
  }, [applyQuotePrefix, insertTableSkeleton, onContextMenu, t]);

  const [mode, setMode] = useState<EditorMode>("read");
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [docText, setDocText] = useState("");

  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const crlfRef = useRef(false);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNowRef = useRef<() => void>(() => {});
  const notePathRef = useRef(notePath);
  notePathRef.current = notePath;
  const editScrollRef = useRef(0);
  const readScrollRef = useRef(0);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);

  const doSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const view = viewRef.current;
    if (!view || !dirtyRef.current) return;
    const savedPath = notePathRef.current;
    let content = view.state.doc.toString();
    if (crlfRef.current) content = content.replace(/\n/g, "\r\n");
    // Clear the flag before the await — edits made during the write schedule
    // a fresh save instead of being silently swallowed
    dirtyRef.current = false;
    setDirty(false);
    void window.prism.saveNote(savedPath, content)
      .then(() => setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })))
      .catch(() => {
        showToast(t["editor.noteDeleted"]);
        onNoteGone(savedPath);
      });
  }, [onNoteGone, showToast, t]);

  useEffect(() => {
    saveNowRef.current = doSave;
  }, [doSave]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    setDirty(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveNowRef.current();
    }, AUTOSAVE_DELAY);
  }, []);

  // ---- Editor lifecycle ----

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoadFailed(false);
    setSavedAt(null);
    setDirty(false);
    dirtyRef.current = false;
    setDocText("");

    (async () => {
      let note: Awaited<ReturnType<typeof window.prism.readNote>>;
      try {
        note = await window.prism.readNote(notePath);
      } catch {
        if (cancelled) return;
        setLoadFailed(true);
        return;
      }
      if (cancelled || !mountRef.current) return;
      crlfRef.current = note.content.includes("\r\n");
      setDocText(note.content);
      const view = new EditorView({
        parent: mountRef.current,
        state: EditorState.create({
          doc: note.content,
          extensions: [
            ...buildExtensions({
              onSave: () => saveNowRef.current(),
              onOpenWikilink,
              onOpenLink: (url) => void window.prism.openUrl(url),
              onPasteImage: async (file) => {
                try {
                  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
                  const buf = await file.arrayBuffer();
                  const ref = await window.prism.saveAttachment(vaultPath, ext, buf);
                  return `![](${await markdownImagePath(ref, vaultPath, notePath)})`;
                } catch {
                  showToast(t["editor.pasteImageFailed"]);
                  return null;
                }
              },
            }),
            EditorView.updateListener.of((u) => {
              if (!u.docChanged) return;
              // Programmatic doc swaps (external reload) carry the remote
              // annotation — they must not feed back into autosave
              const allRemote = u.transactions.every((tr) => tr.annotation(Transaction.remote) === true);
              if (allRemote) return;
              scheduleSave();
            }),
          ],
        }),
      });
      if (cancelled) {
        view.destroy();
        return;
      }
      viewRef.current = view;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      // Flush pending edits while the view is still alive
      saveNowRef.current();
      viewRef.current?.destroy();
      viewRef.current = null;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [notePath, scheduleSave]);

  // ---- External modifications reload the doc unless there are unsaved edits ----

  useEffect(() => {
    return window.prism.onVaultUpdated((changedVault) => {
      if (norm(changedVault) !== norm(vaultPath) || dirtyRef.current) return;
      const view = viewRef.current;
      if (!view) return;
      void (async () => {
        try {
          const note = await window.prism.readNote(notePathRef.current);
          const incoming = note.content.replace(/\r\n/g, "\n");
          crlfRef.current = note.content.includes("\r\n");
          if (dirtyRef.current || !viewRef.current) return;
          if (incoming !== view.state.doc.toString()) {
            view.dispatch({
              changes: { from: 0, to: view.state.doc.length, insert: incoming },
              // External reloads are not undoable — Ctrl+Z should step back
              // through the user's own edits, not revert the file watcher
              annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
              filter: false,
            });
            setDocText(incoming);
          }
        } catch { /* note vanished externally; deletion handled on next save */ }
      })();
    });
  }, [vaultPath, notePath]);

  // ---- Mode switching: keep per-mode scroll offsets ----

  const switchMode = (next: EditorMode) => {
    if (next === mode) return;
    if (next === "read") {
      editScrollRef.current = viewRef.current?.scrollDOM.scrollTop ?? 0;
      setDocText(viewRef.current?.state.doc.toString() ?? "");
    } else {
      readScrollRef.current = previewScrollRef.current?.scrollTop ?? 0;
    }
    setMode(next);
  };

  useEffect(() => {
    if (mode === "edit") {
      const view = viewRef.current;
      if (view) {
        // The editor may have been created while hidden (loading state) —
        // re-measure once it becomes visible
        view.requestMeasure();
        view.scrollDOM.scrollTop = editScrollRef.current;
      }
    } else if (previewScrollRef.current) {
      previewScrollRef.current.scrollTop = readScrollRef.current;
    }
  }, [mode, ready]);

  const handleToggleTask = (taskIndex: number) => {
    const view = viewRef.current;
    if (!view) return;
    const updated = toggleTaskInSource(view.state.doc.toString(), taskIndex);
    if (updated) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: updated } });
      setDocText(updated);
    }
  };

  if (loadFailed) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 anim-fade-in">
        <p className="text-sm text-secondary">{t["editor.noteDeleted"]}</p>
        <Button variant="secondary" size="sm" onClick={() => onNoteGone(notePath)}>
          {t["editor.closeTab"]}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-11 flex-shrink-0 flex items-center gap-2 px-4 border-b border-line/50 glass bg-tint/[0.04]">
        <span className="text-sm font-medium text-primary truncate flex-1" title={notePath}>{title}</span>
        {dirty ? (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" title={t["editor.unsaved"]} />
        ) : savedAt ? (
          <span className="text-[11px] text-faint flex-shrink-0 whitespace-nowrap">
            {t["editor.savedAt"].replace("{time}", savedAt)}
          </span>
        ) : null}
        <div className="flex rounded-md border border-line/60 p-0.5 flex-shrink-0">
          <button
            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${mode === "edit" ? "bg-[var(--accent-muted)] text-[var(--accent-text)]" : "text-muted hover:text-secondary"}`}
            onClick={() => switchMode("edit")}
          >
            <Pencil size={12} />
            {t["editor.edit"]}
          </button>
          <button
            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${mode === "read" ? "bg-[var(--accent-muted)] text-[var(--accent-text)]" : "text-muted hover:text-secondary"}`}
            onClick={() => switchMode("read")}
          >
            <BookOpen size={12} />
            {t["editor.reading"]}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <RefreshCw size={20} className="animate-spin text-muted" />
          </div>
        ) : null}
        <div ref={mountRef} className={mode === "edit" && ready ? "h-full" : "hidden"} onContextMenu={handleEditorContextMenu} />
        {mode === "read" && ready && (
          <MarkdownPreview
            content={docText}
            assetContext={{ vaultPath, noteDir: notePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/") }}
            foldScope={notePath}
            scrollRef={previewScrollRef}
            onToggleTask={handleToggleTask}
            onOpenWikilink={onOpenWikilink}
            onResolveRelativeLink={(href) => onOpenWikilink(resolveRelativeLink(href, notePath))}
          />
        )}
      </div>
    </div>
  );
}
