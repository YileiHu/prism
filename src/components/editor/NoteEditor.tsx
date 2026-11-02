import { useCallback, useEffect, useRef, useState } from "react";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import { BookOpen, Pencil, Table, TextQuote } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { useSettings } from "../../lib/settings";
import { useTheme } from "../../theme/ThemeProvider";
import { type MenuItem } from "../ContextMenu";
import Button from "../Button";
import Spinner from "../Spinner";
import { buildExtensions, indentCompartment, schemeCompartment, wrapCompartment } from "./cmExtensions";
import { type ImageToolbarLabels } from "./livePreview";
import MarkdownPreview from "./MarkdownPreview";
import OutlineCard, { type OutlineItem } from "./OutlineCard";
import { toggleTaskInSource } from "./markdown";
import { resolveRelativeLink } from "./linkResolver";
import { SHORTCUT_EVENT, type ShortcutEventDetail } from "../../shared/shortcuts";

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

const PREVIEW_HEADING_SEL = ".markdown-preview h1, .markdown-preview h2, .markdown-preview h3, .markdown-preview h4, .markdown-preview h5, .markdown-preview h6";

// ATX headings of the source document, skipping fenced code blocks. Order
// matches the rendered headings in MarkdownPreview, so index i in the source
// list is the same heading as element i in the preview DOM.
interface SourceHeading { line: number; level: number; text: string }
function sourceHeadings(doc: string): SourceHeading[] {
  const out: SourceHeading[] = [];
  let fence = false;
  doc.split("\n").forEach((text, i) => {
    if (/^\s*(```|~~~)/.test(text)) fence = !fence;
    if (fence) return;
    const m = /^(#{1,6})\s+(.*)$/.exec(text);
    if (m) {
      out.push({
        line: i + 1,
        level: m[1].length,
        // Drop optional closing hashes and inline marks for display
        text: m[2].replace(/\s+#+$/, "").replace(/[*_~=`$]+/g, "").trim(),
      });
    }
  });
  return out;
}

const sourceHeadingLines = (doc: string): number[] => sourceHeadings(doc).map((h) => h.line);

// Edit-mode outline items: id = 1-based line number (jump target)
const outlineItemsOf = (doc: string): OutlineItem[] =>
  sourceHeadings(doc).map((h) => ({ id: String(h.line), level: h.level, text: h.text }));

const sameOutline = (a: OutlineItem[], b: OutlineItem[]): boolean =>
  a.length === b.length && a.every((it, i) => it.id === b[i].id && it.level === b[i].level && it.text === b[i].text);

interface ScrollAnchor {
  h: number; // index of the topmost visible heading, -1 = none
  frac: number; // 0..1 progress of the viewport top within that heading's section
  ratio: number; // scrollTop ratio, fallback when the note has no headings
}

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
      { label: t["editor.insertTable"], icon: <Table size={14} />, onClick: insertTableSkeleton },
    ];
    onContextMenu(e, items);
  }, [applyQuotePrefix, insertTableSkeleton, onContextMenu, t]);

  const { values: settings, ready: settingsReady, get: getSetting } = useSettings();
  const { resolvedMode } = useTheme();
  const [mode, setMode] = useState<EditorMode>("read");
  // default_view applies to each newly opened note, not to the note on screen
  // when the preference changes
  const defaultViewAppliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!settingsReady || defaultViewAppliedFor.current === notePath) return;
    defaultViewAppliedFor.current = notePath;
    setMode(getSetting("default_view"));
  }, [notePath, settingsReady, getSetting]);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [docText, setDocText] = useState("");
  // Edit-mode outline: heading items derived from the live CM document
  const [editOutline, setEditOutline] = useState<OutlineItem[]>([]);

  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const crlfRef = useRef(false);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNowRef = useRef<() => void>(() => {});
  const notePathRef = useRef(notePath);
  notePathRef.current = notePath;
  const editScrollRef = useRef(0);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollAnchorRef = useRef<ScrollAnchor>({ h: -1, frac: 0, ratio: 0 });
  // Read at widget-render time so a language switch updates the toolbar
  // without rebuilding the editor view
  const imageToolbarLabelsRef = useRef<ImageToolbarLabels>({
    title: t["editor.imageSizeTitle"],
    original: t["editor.imageSizeOriginal"],
    scale: t["editor.imageSizeScale"],
  });
  imageToolbarLabelsRef.current = {
    title: t["editor.imageSizeTitle"],
    original: t["editor.imageSizeOriginal"],
    scale: t["editor.imageSizeScale"],
  };

  // Capture where the viewport is, anchored to the nearest heading at/above
  // the top of the view (pixel offsets don't survive the mode swap because
  // rendered and source layouts have different heights). frac is the
  // viewport top's PIXEL progress inside that heading's section, measured in
  // whichever mode we're leaving. Must key off the CURRENT mode — the editor
  // view stays mounted (hidden) while reading, so element existence can't
  // tell the modes apart.
  const captureScrollAnchor = useCallback((from: EditorMode) => {
    const ratioOf = (el: HTMLElement) =>
      el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0;
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    if (from === "edit") {
      const view = viewRef.current;
      if (!view) return;
      const topLine = view.state.doc.lineAt(view.visibleRanges[0]?.from ?? 0).number;
      const heads = sourceHeadingLines(view.state.doc.toString());
      let h = -1;
      for (let i = 0; i < heads.length && heads[i] <= topLine; i++) h = i;
      let frac = 0;
      if (h >= 0) {
        // documentTop is the doc start in viewport coords (negative when
        // scrolled down); block .top is doc-relative — the difference maps
        // the viewport top into the section's pixel range
        const viewTopDocY = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
        const endLineNo = h + 1 < heads.length ? heads[h + 1] : view.state.doc.lines;
        const sTop = view.lineBlockAt(view.state.doc.line(heads[h]).from).top;
        const eTop = view.lineBlockAt(view.state.doc.line(endLineNo).from).top;
        frac = clamp01((viewTopDocY - sTop) / Math.max(1, eTop - sTop));
      }
      scrollAnchorRef.current = { h, frac, ratio: ratioOf(view.scrollDOM) };
    } else {
      const container = previewScrollRef.current;
      if (!container) return;
      const els = container.querySelectorAll<HTMLElement>(PREVIEW_HEADING_SEL);
      const containerTop = container.getBoundingClientRect().top;
      const ctop = container.scrollTop;
      // rect diff + scrollTop → element position in content coordinates
      const contentTopOf = (el: HTMLElement) => el.getBoundingClientRect().top - containerTop + ctop;
      let h = -1;
      els.forEach((el, i) => {
        if (el.getBoundingClientRect().top <= containerTop + 4) h = i;
      });
      let frac = 0;
      if (h >= 0) {
        const startC = contentTopOf(els[h]);
        const endC = h + 1 < els.length ? contentTopOf(els[h + 1]) : container.scrollHeight;
        frac = clamp01((ctop - startC) / Math.max(1, endC - startC));
      }
      scrollAnchorRef.current = { h, frac, ratio: ratioOf(container) };
    }
  }, []);

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
        showToast(t["editor.noteDeleted"], "error");
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
    }, getSetting("autosave_delay"));
  }, [getSetting]);

  // ---- Editor lifecycle ----

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoadFailed(false);
    setSavedAt(null);
    setDirty(false);
    dirtyRef.current = false;
    setDocText("");
    setEditOutline([]);

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
      setEditOutline(outlineItemsOf(note.content));
      const view = new EditorView({
        parent: mountRef.current,
        state: EditorState.create({
          doc: note.content,
          extensions: [
            ...buildExtensions({
              onSave: () => saveNowRef.current(),
              onOpenWikilink,
              onOpenLink: (url) => void window.prism.openUrl(url),
              assetCtx: { vaultPath, noteDir: notePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/") },
              imageToolbarLabels: () => imageToolbarLabelsRef.current,
              onPasteImage: async (file) => {
                try {
                  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
                  const buf = await file.arrayBuffer();
                  const ref = await window.prism.saveAttachment(vaultPath, ext, buf);
                  return `![](${await markdownImagePath(ref, vaultPath, notePath)})`;
                } catch {
                  showToast(t["editor.pasteImageFailed"], "error");
                  return null;
                }
              },
            }, {
              dark: resolvedMode === "dark",
              indentWidth: getSetting("indent_width"),
              lineWrapping: getSetting("line_wrapping"),
            }),
            EditorView.updateListener.of((u) => {
              if (!u.docChanged) return;
              // Keep the edit-mode outline in sync (no-op unless the heading
              // set actually changed)
              const nextOutline = outlineItemsOf(u.state.doc.toString());
              setEditOutline((prev) => (sameOutline(prev, nextOutline) ? prev : nextOutline));
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

  // Editor scheme/indent/wrap follow the live settings without a rebuild
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        schemeCompartment.reconfigure(EditorView.darkTheme.of(resolvedMode === "dark")),
        indentCompartment.reconfigure(indentUnit.of(" ".repeat(settings.indent_width))),
        wrapCompartment.reconfigure(settings.line_wrapping ? EditorView.lineWrapping : []),
      ],
    });
  }, [resolvedMode, settings.indent_width, settings.line_wrapping]);

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

  // ---- Mode switching: restore the viewport to the same region ----

  const switchMode = useCallback((next: EditorMode) => {
    if (next === mode) return;
    captureScrollAnchor(mode);
    if (next === "read") {
      setDocText(viewRef.current?.state.doc.toString() ?? "");
    }
    setMode(next);
  }, [mode, captureScrollAnchor]);

  // App shortcut: only the editor inside the active vault pane reacts (the
  // event carries the vault path).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ShortcutEventDetail>).detail;
      if (detail?.action !== "toggleReadEdit" || detail.vaultPath !== vaultPath || !ready) return;
      switchMode(mode === "edit" ? "read" : "edit");
    };
    window.addEventListener(SHORTCUT_EVENT, handler);
    return () => window.removeEventListener(SHORTCUT_EVENT, handler);
  }, [vaultPath, ready, mode, switchMode]);

  useEffect(() => {
    if (mode === "edit") {
      const view = viewRef.current;
      if (!view) return;
      // The editor may have been created while hidden (loading state) —
      // re-measure once it becomes visible, then jump on the next frame so
      // the layout is actually flushed
      view.requestMeasure();
      const raf = requestAnimationFrame(() => {
        const { h, frac, ratio } = scrollAnchorRef.current;
        const heads = sourceHeadingLines(view.state.doc.toString());
        if (h >= 0 && heads[h]) {
          const headLine = view.state.doc.line(heads[h]);
          view.dispatch({ effects: EditorView.scrollIntoView(headLine.from, { y: "start" }) });
          if (frac > 0) {
            // Snap to the section start first, then shift by the captured
            // in-section progress — measure once the scroll has been applied
            requestAnimationFrame(() => {
              const nextLineNo = h + 1 < heads.length ? heads[h + 1] : view.state.doc.lines;
              const from = view.lineBlockAt(headLine.from);
              const to = view.lineBlockAt(view.state.doc.line(nextLineNo).from);
              view.scrollDOM.scrollTop += frac * Math.max(0, to.top - from.top);
            });
          }
          return;
        }
        const sd = view.scrollDOM;
        sd.scrollTop = ratio * Math.max(0, sd.scrollHeight - sd.clientHeight);
      });
      return () => cancelAnimationFrame(raf);
    }
    const raf = requestAnimationFrame(() => {
      const container = previewScrollRef.current;
      if (!container) return;
      const { h, frac, ratio } = scrollAnchorRef.current;
      if (h >= 0) {
        const els = container.querySelectorAll<HTMLElement>(PREVIEW_HEADING_SEL);
        const el = els[h];
        if (el) {
          const containerTop = container.getBoundingClientRect().top;
          const ctop = container.scrollTop;
          const contentTopOf = (e: HTMLElement) => e.getBoundingClientRect().top - containerTop + ctop;
          const elTopC = contentTopOf(el);
          const endC = h + 1 < els.length ? contentTopOf(els[h + 1]) : container.scrollHeight;
          container.scrollTop = Math.max(0, elTopC - 8 + frac * Math.max(0, endC - elTopC));
          return;
        }
      }
      container.scrollTop = ratio * Math.max(0, container.scrollHeight - container.clientHeight);
    });
    return () => cancelAnimationFrame(raf);
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

  // Outline jump in edit mode: cursor onto the heading line + smooth scroll
  const jumpToEditHeading = (id: string) => {
    const view = viewRef.current;
    if (!view) return;
    const lineNo = Number(id);
    if (lineNo < 1 || lineNo > view.state.doc.lines) return;
    const line = view.state.doc.line(lineNo);
    view.dispatch({ selection: { anchor: line.from } });
    view.scrollDOM.scrollTo({ top: Math.max(0, view.lineBlockAt(line.from).top - 12), behavior: "smooth" });
    view.focus();
  };

  if (loadFailed) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 anim-fade-in">
        <p className="text-body text-secondary">{t["editor.noteDeleted"]}</p>
        <Button variant="secondary" size="sm" onClick={() => onNoteGone(notePath)}>
          {t["editor.closeTab"]}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-11 flex-shrink-0 flex items-center gap-2 px-4 border-b border-line/50 glass bg-tint/[0.04]">
        <span className="text-body font-medium text-primary truncate flex-1" title={notePath}>{title}</span>
        {dirty ? (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" title={t["editor.unsaved"]} />
        ) : savedAt ? (
          <span className="text-meta text-faint flex-shrink-0 whitespace-nowrap">
            {t["editor.savedAt"].replace("{time}", savedAt)}
          </span>
        ) : null}
        <div className="flex rounded-control border border-line/50 p-0.5 flex-shrink-0">
          <button
            className={`flex items-center gap-1 px-2 py-0.5 text-caption rounded-chip transition-colors ${mode === "edit" ? "bg-[var(--accent-muted)] text-[var(--accent-text)]" : "text-muted hover:text-secondary"}`}
            onClick={() => switchMode("edit")}
          >
            <Pencil size={12} />
            {t["editor.edit"]}
          </button>
          <button
            className={`flex items-center gap-1 px-2 py-0.5 text-caption rounded-chip transition-colors ${mode === "read" ? "bg-[var(--accent-muted)] text-[var(--accent-text)]" : "text-muted hover:text-secondary"}`}
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
            <Spinner size={20} className="text-muted" />
          </div>
        ) : null}
        <div ref={mountRef} className={mode === "edit" && ready ? "h-full" : "hidden"} onContextMenu={handleEditorContextMenu} />
        {mode === "edit" && ready && (
          <OutlineCard items={editOutline} onJump={jumpToEditHeading} />
        )}
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
