import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EditorState, type Text as CMText, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import { ArrowLeft, BookOpen, Columns3, Pencil, Plus, Table, TextQuote, X } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { useSettings } from "../../lib/settings";
import { useTheme } from "../../theme/ThemeProvider";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import { type MenuItem } from "../ContextMenu";
import Button from "../Button";
import Input from "../Input";
import SegmentedToggle from "../SegmentedToggle";
import Spinner from "../Spinner";
import { buildExtensions, indentCompartment, schemeCompartment, wrapCompartment } from "./cmExtensions";
import { type EmbedLabels } from "./livePreview";
import type { EmbedOpenTarget } from "../embeds/model";
import { imagePathFor } from "./imagePath";
import InsertModal from "./InsertModal";
import MarkdownPreview from "./MarkdownPreview";
import OutlineCard, { type OutlineItem } from "./OutlineCard";
import { toggleTaskInSource } from "./markdown";
import { resolveRelativeLink } from "./linkResolver";
import { SHORTCUT_EVENT, type ShortcutEventDetail } from "../../shared/shortcuts";

type EditorMode = "edit" | "read";

interface Props {
  vaultPath: string;
  notePath: string;
  title: string;
  focused: boolean;
  toolbarScope: string;
  splitOpen: boolean;
  onToggleSplit: () => void;
  onBackToLibrary: () => void;
  onClose: () => void;
  onNoteGone: (path: string) => void;
  onNoteRenamed: (newPath: string, newTitle: string) => void;
  onOpenWikilink: (target: string) => void;
  onOpenEmbed: (target: EmbedOpenTarget) => void;
}

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

const PREVIEW_HEADING_SEL = ".markdown-preview h1, .markdown-preview h2, .markdown-preview h3, .markdown-preview h4, .markdown-preview h5, .markdown-preview h6";

// ATX headings of the source document, skipping fenced code blocks. Order
// matches the rendered headings in MarkdownPreview, so index i in the source
// list is the same heading as element i in the preview DOM. Takes an iterator
// of lines so CM documents can be scanned without materializing them as one
// string first.
interface SourceHeading { line: number; level: number; text: string }
function sourceHeadings(lines: Iterable<string>): SourceHeading[] {
  const out: SourceHeading[] = [];
  let fence = false;
  let n = 0;
  for (const text of lines) {
    n++;
    if (/^\s*(```|~~~)/.test(text)) fence = !fence;
    if (fence) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(text);
    if (m) {
      out.push({
        line: n,
        level: m[1].length,
        // Drop optional closing hashes and inline marks for display
        text: m[2].replace(/\s+#+$/, "").replace(/[*_~=`$]+/g, "").trim(),
      });
    }
  }
  return out;
}

const sourceHeadingLines = (doc: CMText): number[] => sourceHeadings(doc.iterLines()).map((h) => h.line);

// Edit-mode outline items: id = 1-based line number (jump target)
const outlineItemsOf = (lines: Iterable<string>): OutlineItem[] =>
  sourceHeadings(lines).map((h) => ({ id: String(h.line), level: h.level, text: h.text }));

const sameOutline = (a: OutlineItem[], b: OutlineItem[]): boolean =>
  a.length === b.length && a.every((it, i) => it.id === b[i].id && it.level === b[i].level && it.text === b[i].text);

interface ScrollAnchor {
  // Index of the heading at/above the viewport center, in document order.
  // Mode-independent: edit (source headings) and read (rendered headings) use
  // the same order, unlike their per-mode ids (line number vs "hd-N").
  section: number; // -1 = the note has no headings
  frac: number; // 0..1 progress of the viewport center within that heading's section
  ratio: number; // scrollTop ratio, fallback when the note has no headings
  token: string | null; // visible text at the center — the exact cross-mode anchor
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

// First run of word characters (≥4) at/after `from`. Markdown syntax breaks
// runs, so the result is plain text that exists verbatim in both the source
// and the rendered HTML — used to line up the two modes at the same words.
function textTokenAt(text: string, from: number, maxLen = 24): string | null {
  const limit = Math.min(text.length, Math.max(0, from) + 240);
  let i = Math.max(0, from);
  while (i < limit) {
    if (!WORD_CHAR.test(text[i])) { i++; continue; }
    let j = i;
    while (j < limit && WORD_CHAR.test(text[j])) j++;
    if (j - i >= 4) return text.slice(i, Math.min(j, i + maxLen));
    i = j;
  }
  return null;
}

// Text node under a viewport point (Chromium ships both APIs; use either)
function caretTextAt(x: number, y: number): { node: Text; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) return pos.offsetNode instanceof Text ? { node: pos.offsetNode, offset: pos.offset } : null;
  const range = doc.caretRangeFromPoint?.(x, y);
  if (range && range.startContainer instanceof Text) {
    return { node: range.startContainer, offset: range.startOffset };
  }
  return null;
}

// Occurrence of `token` in a source range closest to the fractional estimate
function nearestTokenIndex(haystack: string, token: string, from: number, to: number, frac: number): number | null {
  const estimate = from + frac * Math.max(0, to - from);
  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = haystack.indexOf(token, from); i !== -1 && i < to; i = haystack.indexOf(token, i + 1)) {
    const d = Math.abs(i - estimate);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// Content-coordinate top of the visible occurrence of `token` in a rendered
// section closest to the fractional estimate, skipping folded (laid-out-less)
// content
function nearestRenderedTokenTop(
  container: HTMLElement,
  sectionStart: Element,
  sectionEnd: Element | null,
  token: string,
  estimateC: number,
  containerTop: number,
  scrollTop: number,
): number | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let bestTop: number | null = null;
  let bestDist = Infinity;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (!parent || parent.getClientRects().length === 0) continue;
    if (!(sectionStart.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    if (sectionEnd && sectionEnd.contains(text)) continue;
    const value = text.nodeValue ?? "";
    for (let i = value.indexOf(token); i !== -1; i = value.indexOf(token, i + 1)) {
      const range = document.createRange();
      range.setStart(text, i);
      range.setEnd(text, i + token.length);
      const r = range.getBoundingClientRect();
      if (r.height === 0) continue;
      const top = r.top - containerTop + scrollTop;
      const d = Math.abs(top - estimateC);
      if (d < bestDist) { bestDist = d; bestTop = top; }
    }
  }
  return bestTop;
}

export default function NoteEditor({
  vaultPath,
  notePath,
  title,
  focused,
  toolbarScope,
  splitOpen,
  onToggleSplit,
  onBackToLibrary,
  onClose,
  onNoteGone,
  onNoteRenamed,
  onOpenWikilink,
  onOpenEmbed,
}: Props) {
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

  // Insert an embed at the current selection. The edit view stays mounted while
  // reading, so this works right after the mode switch.
  const insertAtCursor = useCallback((text: string) => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      scrollIntoView: true,
      userEvent: "input",
    });
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
  const [insertOpen, setInsertOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [docText, setDocText] = useState("");
  // Edit-mode outline: heading items derived from the live CM document
  const [editOutline, setEditOutline] = useState<OutlineItem[]>([]);
  // Heading whose line sits at the center of the edit viewport (outline highlight)
  const [editActiveId, setEditActiveId] = useState<string | null>(null);
  const jumpLockRef = useRef<string | null>(null);
  const jumpSettledRef = useRef(false);
  const jumpLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const crlfRef = useRef(false);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNowRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const notePathRef = useRef(notePath);
  notePathRef.current = notePath;
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollAnchorRef = useRef<ScrollAnchor>({ section: -1, frac: 0, ratio: 0, token: null });
  // Read at widget-render time so a language switch updates the toolbox
  // without rebuilding the editor view
  const embedLabelsRef = useRef<EmbedLabels>({
    open: t["embed.open"],
    size: t["embed.size"],
    label: t["embed.label"],
    loading: t["embed.loading"],
    missing: t["embed.missing"],
    corrupt: t["embed.corrupt"],
    emptyCanvas: t["embed.emptyCanvas"],
    imageFailed: t["embed.imageFailed"],
    pageCount: t["embed.pageCount"],
  });
  embedLabelsRef.current = {
    open: t["embed.open"],
    size: t["embed.size"],
    label: t["embed.label"],
    loading: t["embed.loading"],
    missing: t["embed.missing"],
    corrupt: t["embed.corrupt"],
    emptyCanvas: t["embed.emptyCanvas"],
    imageFailed: t["embed.imageFailed"],
    pageCount: t["embed.pageCount"],
  };
  const embedLabels = useMemo<EmbedLabels>(() => embedLabelsRef.current, [t]);
  const assetContext = useMemo(
    () => ({ vaultPath, noteDir: notePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/") }),
    [vaultPath, notePath],
  );
  const onOpenEmbedRef = useRef(onOpenEmbed);
  onOpenEmbedRef.current = onOpenEmbed;

  // Capture where the viewport is. Pixel offsets don't survive the mode swap
  // (rendered and source layouts have different heights), so the anchor is a
  // section index + in-section fraction PLUS the visible text at the vertical
  // center; the token is preferred on restore because it puts the same words
  // on the center line in the other mode. Must key off the CURRENT mode — the
  // editor view stays mounted (hidden) while reading, so element existence
  // can't tell the modes apart.
  const captureScrollAnchor = useCallback((from: EditorMode) => {
    const ratioOf = (el: HTMLElement) =>
      el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0;
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    if (from === "edit") {
      const view = viewRef.current;
      if (!view) return;
      const doc = view.state.doc;
      const heads = sourceHeadingLines(doc);
      const scroller = view.scrollDOM;
      // documentTop is the doc start in viewport coords (negative when
      // scrolled down); block .top is doc-relative — the difference maps the
      // viewport center into the document's pixel space
      const rect = scroller.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const centerDocY = centerY - view.documentTop;
      let h = -1;
      for (let i = 0; i < heads.length; i++) {
        if (view.lineBlockAt(doc.line(heads[i]).from).top <= centerDocY) h = i;
        else break;
      }
      let frac = 0;
      if (h >= 0) {
        const endLineNo = h + 1 < heads.length ? heads[h + 1] : doc.lines;
        const sTop = view.lineBlockAt(doc.line(heads[h]).from).top;
        const eTop = view.lineBlockAt(doc.line(endLineNo).from).top;
        frac = clamp01((centerDocY - sTop) / Math.max(1, eTop - sTop));
      }
      const centerPos = view.posAtCoords({ x: centerX, y: centerY });
      const token = centerPos != null ? textTokenAt(doc.sliceString(centerPos, centerPos + 240), 0) : null;
      scrollAnchorRef.current = { section: h, frac, ratio: ratioOf(scroller), token };
    } else {
      const container = previewScrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const ctop = container.scrollTop;
      // rect diff + scrollTop → element position in content coordinates
      const contentTopOf = (el: HTMLElement) => el.getBoundingClientRect().top - rect.top + ctop;
      const centerC = ctop + container.clientHeight / 2;
      // Index into ALL headings (not just visible ones): the index must mean
      // the same heading in edit mode. Headings inside collapsed fold bodies
      // have no box, so they can't be picked as the center's section.
      const allHeads = Array.from(container.querySelectorAll<HTMLElement>(PREVIEW_HEADING_SEL));
      let h = -1;
      for (let i = 0; i < allHeads.length; i++) {
        const el = allHeads[i];
        if (el.getClientRects().length === 0) continue;
        if (contentTopOf(el) <= centerC) h = i;
        else break;
      }
      let frac = 0;
      if (h >= 0) {
        const startC = contentTopOf(allHeads[h]);
        const endC = h + 1 < allHeads.length ? contentTopOf(allHeads[h + 1]) : container.scrollHeight;
        frac = clamp01((centerC - startC) / Math.max(1, endC - startC));
      }
      const caret = caretTextAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
      // Only trust text that belongs to the note (the outline overlay can
      // cover the center point in a narrow pane)
      const token = caret && container.contains(caret.node)
        ? textTokenAt(caret.node.nodeValue ?? "", caret.offset)
        : null;
      scrollAnchorRef.current = { section: h, frac, ratio: ratioOf(container), token };
    }
  }, []);

  const doSave = useCallback((): Promise<void> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const view = viewRef.current;
    if (!view || !dirtyRef.current) return Promise.resolve();
    const savedPath = notePathRef.current;
    let content = view.state.doc.toString();
    if (crlfRef.current) content = content.replace(/\n/g, "\r\n");
    // Clear the flag before the await — edits made during the write schedule
    // a fresh save instead of being silently swallowed
    dirtyRef.current = false;
    setDirty(false);
    return window.prism.saveNote(savedPath, content)
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
      setEditOutline(outlineItemsOf(note.content.split("\n")));
      const view = new EditorView({
        parent: mountRef.current,
        state: EditorState.create({
          doc: note.content,
          extensions: [
            ...buildExtensions({
              onSave: () => saveNowRef.current(),
              onOpenWikilink,
              onOpenLink: (url) => void window.prism.openUrl(url),
              onOpenEmbed: (target) => onOpenEmbedRef.current(target),
              assetCtx: assetContext,
              embedLabels: () => embedLabelsRef.current,
              onPasteImage: async (file) => {
                try {
                  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
                  const buf = await file.arrayBuffer();
                  const ref = await window.prism.saveAttachment(vaultPath, ext, buf);
                  const target = await imagePathFor(ref, vaultPath, notePath);
                  return `![[${target}]]`;
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
              // Keep the edit-mode outline in sync. Only an edit that touches
              // heading syntax, a fence marker, a line start or an existing
              // heading line can change the heading set — skip the full scan
              // for ordinary typing.
              let headingsMayChange = false;
              u.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
                if (headingsMayChange) return;
                const removed = u.startState.doc.sliceString(fromA, toA);
                const line = u.startState.doc.lineAt(fromA);
                headingsMayChange =
                  /[\n#`~]/.test(inserted.toString()) ||
                  /[\n#`~]/.test(removed) ||
                  /^#{1,6}\s/.test(line.text) ||
                  // Un-indenting an already-"#"-prefixed line promotes it
                  (fromA === line.from && line.text.includes("#"));
              });
              if (headingsMayChange) {
                const nextOutline = outlineItemsOf(u.state.doc.iterLines());
                setEditOutline((prev) => (sameOutline(prev, nextOutline) ? prev : nextOutline));
              }
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
      void saveNowRef.current();
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
      if (!focused) return;
      switchMode(mode === "edit" ? "read" : "edit");
    };
    window.addEventListener(SHORTCUT_EVENT, handler);
    return () => window.removeEventListener(SHORTCUT_EVENT, handler);
  }, [vaultPath, ready, mode, switchMode, focused]);

  // Layout effect so the restored scroll position is applied before the first
  // paint — otherwise the switched-to view shows its stale/top position first
  useLayoutEffect(() => {
    if (mode === "edit") {
      const view = viewRef.current;
      if (!view) return;
      const sd = view.scrollDOM;
      // The editor may have been created while hidden — apply a cheap estimate
      // (via the captured scroll ratio) before paint, then refine once the
      // visible layout has been measured
      const { ratio: estRatio } = scrollAnchorRef.current;
      sd.scrollTop = estRatio * Math.max(0, sd.scrollHeight - sd.clientHeight);
      view.requestMeasure();
      let cancelled = false;
      const raf = requestAnimationFrame(() => {
        if (cancelled) return;
        const doc = view.state.doc;
        const { section, frac, ratio, token } = scrollAnchorRef.current;
        const heads = sourceHeadingLines(doc);
        if (section < 0 || section >= heads.length) {
          sd.scrollTop = ratio * Math.max(0, sd.scrollHeight - sd.clientHeight);
          return;
        }
        const headLine = doc.line(heads[section]);
        // Prefer the exact text captured at the center: find the same words in
        // this section and let CodeMirror center them (its measure loop handles
        // expanding the viewport for a far jump)
        const sectionTo = section + 1 < heads.length ? doc.line(heads[section + 1]).from : doc.length;
        const sectionText = doc.sliceString(headLine.from, sectionTo);
        const localPos = token ? nearestTokenIndex(sectionText, token, 0, sectionText.length, frac) : null;
        if (localPos != null) {
          view.dispatch({ effects: EditorView.scrollIntoView(headLine.from + localPos, { y: "center" }) });
          return;
        }
        // Fallback: snap the heading into view so its block gets measured, then
        // place the captured section point at the vertical center
        view.dispatch({ effects: EditorView.scrollIntoView(headLine.from, { y: "start" }) });
        requestAnimationFrame(() => {
          if (cancelled) return;
          const nextLineNo = section + 1 < heads.length ? heads[section + 1] : doc.lines;
          const from = view.lineBlockAt(headLine.from);
          const to = view.lineBlockAt(doc.line(nextLineNo).from);
          const targetY = from.top + frac * Math.max(0, to.top - from.top);
          // doc Y is measured from the first line, while scrollTop counts from
          // the scroll content's top — map through documentTop so the content
          // padding isn't added as a vertical offset
          const rect = sd.getBoundingClientRect();
          const delta = view.documentTop + targetY - (rect.top + rect.height / 2);
          sd.scrollTop = Math.max(0, sd.scrollTop + delta);
        });
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
      };
    }
    // Reading view: measure and restore synchronously — the preview's DOM is
    // committed here, so this lands before the first paint (no top flash)
    const container = previewScrollRef.current;
    if (!container) return;
    const { section, frac, ratio, token } = scrollAnchorRef.current;
    const allHeads = Array.from(container.querySelectorAll<HTMLElement>(PREVIEW_HEADING_SEL));
    const el = section >= 0 && section < allHeads.length ? allHeads[section] : null;
    // A heading inside a collapsed fold body has no box and can't be centered
    if (el && el.getClientRects().length > 0) {
      const rect = container.getBoundingClientRect();
      const ctop = container.scrollTop;
      const contentTopOf = (e: HTMLElement) => e.getBoundingClientRect().top - rect.top + ctop;
      const startC = contentTopOf(el);
      const endEl = section + 1 < allHeads.length ? allHeads[section + 1] : null;
      const endC = endEl ? contentTopOf(endEl) : container.scrollHeight;
      const estimateC = startC + frac * Math.max(0, endC - startC);
      // Prefer the exact text captured at the center
      const tokenTop = token
        ? nearestRenderedTokenTop(container, el, endEl, token, estimateC, rect.top, ctop)
        : null;
      if (tokenTop != null) {
        container.scrollTop = Math.max(0, tokenTop - container.clientHeight / 2);
        return;
      }
      container.scrollTop = Math.max(0, estimateC - container.clientHeight / 2);
      return;
    }
    container.scrollTop = ratio * Math.max(0, container.scrollHeight - container.clientHeight);
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
    setEditActiveId(id);
    jumpLockRef.current = id;
    jumpSettledRef.current = false;
    if (jumpLockTimerRef.current) clearTimeout(jumpLockTimerRef.current);
    // Fallback when the jump doesn't scroll (already at the target)
    jumpLockTimerRef.current = setTimeout(() => {
      jumpSettledRef.current = true;
    }, 1000);
    view.dispatch({ selection: { anchor: line.from } });
    view.scrollDOM.scrollTo({ top: Math.max(0, view.lineBlockAt(line.from).top - 12), behavior: "smooth" });
    view.focus();
  };

  // Keep the outline highlight in sync with the line crossing the edit
  // viewport's vertical center. Keyed off editOutline so heading-line shifts
  // after edits recompute it.
  const prevModeRef = useRef<EditorMode>(mode);
  useEffect(() => {
    const switchedIn = mode === "edit" && prevModeRef.current !== "edit";
    prevModeRef.current = mode;
    if (mode !== "edit" || !ready) return;
    const view = viewRef.current;
    if (!view) return;
    const heads = editOutline.map((item) => Number(item.id));
    let raf = 0;
    const compute = () => {
      raf = 0;
      if (jumpLockRef.current) return;
      const rect = view.scrollDOM.getBoundingClientRect();
      // posAtCoords returns null below the last line; fall back to the top line
      const pos = view.posAtCoords({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        ?? view.visibleRanges[0]?.from
        ?? 0;
      const centerLine = view.state.doc.lineAt(pos).number;
      // At the top before the first heading, the first section counts as current
      let next: string | null = heads.length > 0 ? String(heads[0]) : null;
      for (let i = 0; i < heads.length && heads[i] <= centerLine; i++) next = String(heads[i]);
      setEditActiveId((prev) => (prev === next ? prev : next));
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(compute);
    };
    // Programmatic jump scrolls keep the clicked entry highlighted; the lock
    // releases on the first scroll after the animation has settled
    const onScroll = () => {
      if (jumpLockRef.current) {
        if (!jumpSettledRef.current) return;
        jumpLockRef.current = null;
      }
      schedule();
    };
    const onScrollEnd = () => {
      if (jumpLockRef.current) jumpSettledRef.current = true;
    };
    if (switchedIn) {
      // Seed from the mode-switch anchor — the restore scroll is still pending,
      // so computing now (against the stale hidden-editor position) would flash
      // the wrong entry. The restore's scroll event recomputes.
      const { section } = scrollAnchorRef.current;
      const target = section >= 0 && section < heads.length
        ? String(heads[section])
        : heads.length > 0 ? String(heads[0]) : null;
      setEditActiveId((prev) => (prev === target ? prev : target));
    } else {
      compute();
    }
    const scroller = view.scrollDOM;
    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("scrollend", onScrollEnd);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("scrollend", onScrollEnd);
    };
  }, [mode, ready, editOutline]);

  useEffect(() => () => {
    if (jumpLockTimerRef.current) clearTimeout(jumpLockTimerRef.current);
  }, []);

  // ---- Inline rename from the toolbar title ----

  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const renamingRef = useRef(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback(() => {
    if (renamingRef.current) return;
    setDraftTitle(title);
    renamingRef.current = true;
    setRenaming(true);
  }, [title]);

  const finishRename = useCallback((save: boolean) => {
    if (!renamingRef.current) return;
    renamingRef.current = false;
    setRenaming(false);
    const nextTitle = draftTitle.trim();
    if (!save || !nextTitle || nextTitle === title) return;
    void (async () => {
      // Flush pending edits before the file moves, so the dirty content lands
      // on the old path and the remount at the new path reads it back intact
      await saveNowRef.current();
      try {
        const result = await window.prism.renameNote(vaultPath, notePath, nextTitle);
        onNoteRenamed(result.path, result.title);
        showToast(t["vault.renamed"].replace("{name}", result.title));
      } catch {
        showToast(t["vault.renameFailed"], "error");
      }
    })();
  }, [draftTitle, notePath, onNoteRenamed, showToast, t, title, vaultPath]);

  useEffect(() => {
    if (!renaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renaming]);

  const openInsert = useCallback(() => {
    if (mode === "read") switchMode("edit");
    setInsertOpen(true);
  }, [mode, switchMode]);

  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: (
      <>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBackToLibrary}
          title={t["workspace.backToLibrary"]}
        >
          <ArrowLeft size={15} />
        </Button>
        {renaming ? (
          <Input
            ref={renameInputRef}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={() => finishRename(true)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter") {
                e.preventDefault();
                finishRename(true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                finishRename(false);
              }
            }}
            aria-label={t["menu.rename"]}
            spellCheck={false}
            className="min-w-0 w-64 max-w-[50vw] font-medium"
          />
        ) : (
          <button
            type="button"
            onClick={startRename}
            title={`${t["menu.rename"]}\n${notePath}`}
            className="min-w-0 max-w-full truncate text-left text-body font-medium text-primary rounded-chip px-1 -mx-1 cursor-text hover:bg-hover"
          >
            {title}
          </button>
        )}
        {dirty ? (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" title={t["editor.unsaved"]} />
        ) : savedAt ? (
          <span className="text-meta text-faint flex-shrink-0 whitespace-nowrap">
            {t["editor.savedAt"].replace("{time}", savedAt)}
          </span>
        ) : null}
      </>
    ),
    controls: (
      <SegmentedToggle
        value={mode}
        onChange={switchMode}
        options={[
          { value: "edit", label: t["editor.edit"], icon: Pencil },
          { value: "read", label: t["editor.reading"], icon: BookOpen },
        ]}
      />
    ),
    actions: (
      <>
        <Button variant="ghost" size="icon-sm" onClick={openInsert} title={t["insert.title"]}>
          <Plus size={15} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          active={splitOpen}
          onClick={onToggleSplit}
          title={splitOpen ? t["workspace.closeSplit"] : t["workspace.openSplit"]}
        >
          <Columns3 size={15} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} title={t["editor.closeTab"]}>
          <X size={15} />
        </Button>
      </>
    ),
  }), [
    dirty, draftTitle, finishRename, mode, notePath, onBackToLibrary, onClose, onToggleSplit,
    openInsert, renaming, savedAt, splitOpen, startRename, switchMode, t, title,
  ]);

  useToolbarContribution(toolbarScope, toolbar);

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
      <div className="flex-1 min-h-0 relative">
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner size={20} className="text-muted" />
          </div>
        ) : null}
        <div ref={mountRef} className={mode === "edit" && ready ? "h-full" : "hidden"} onContextMenu={handleEditorContextMenu} />
        {mode === "edit" && ready && (
          <OutlineCard items={editOutline} onJump={jumpToEditHeading} activeId={editActiveId} />
        )}
        {mode === "read" && ready && (
          <MarkdownPreview
            content={docText}
            assetContext={assetContext}
            foldScope={notePath}
            scrollRef={previewScrollRef}
            initialSection={scrollAnchorRef.current.section}
            onToggleTask={handleToggleTask}
            onOpenWikilink={onOpenWikilink}
            onResolveRelativeLink={(href) => onOpenWikilink(resolveRelativeLink(href, notePath))}
            onOpenEmbed={onOpenEmbed}
            embedLabels={embedLabels}
          />
        )}
      </div>
      {insertOpen && (
        <InsertModal
          vaultPath={vaultPath}
          notePath={notePath}
          onInsert={insertAtCursor}
          onClose={() => setInsertOpen(false)}
        />
      )}
    </div>
  );
}
