import { useEffect, useMemo, useState } from "react";
import { BookOpen, FileText, Frame, Link2, Loader2 } from "lucide-react";
import { useT } from "../../i18n";
import type { CanvasTarget } from "../../lib/canvas/model";
import { normalizeTargetUrl } from "../../lib/canvas/targets";
import { normalizePath } from "../../lib/workspace/types";
import type { CanvasFile, NoteBrief, PdfDocument } from "../../shared/models";
import Button from "../Button";
import Input from "../Input";
import Modal from "../Modal";

type Tab = "note" | "pdf" | "canvas" | "url";

interface Props {
  vaultPath: string;
  currentCanvasPath: string;
  onPick: (target: CanvasTarget) => void;
  onClose: () => void;
}

const TABS: { id: Tab; icon: typeof FileText; labelKey: "canvas.pickNote" | "canvas.pickPdf" | "canvas.pickCanvas" | "canvas.pickUrl" }[] = [
  { id: "note", icon: FileText, labelKey: "canvas.pickNote" },
  { id: "pdf", icon: BookOpen, labelKey: "canvas.pickPdf" },
  { id: "canvas", icon: Frame, labelKey: "canvas.pickCanvas" },
  { id: "url", icon: Link2, labelKey: "canvas.pickUrl" },
];

export default function TargetPickerModal({ vaultPath, currentCanvasPath, onPick, onClose }: Props) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("note");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<NoteBrief[]>([]);
  const [pdfs, setPdfs] = useState<PdfDocument[]>([]);
  const [canvases, setCanvases] = useState<CanvasFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void Promise.all([
      window.prism.getNoteList(vaultPath),
      window.prism.listPdfs(),
      window.prism.listCanvases(vaultPath),
    ])
      .then(([noteRows, pdfRows, canvasRows]) => {
        if (cancelled) return;
        setNotes(noteRows);
        setPdfs(pdfRows);
        setCanvases(canvasRows.filter(
          (file) => normalizePath(file.path) !== normalizePath(currentCanvasPath),
        ));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentCanvasPath, vaultPath]);

  const needle = query.trim().toLowerCase();

  const visibleNotes = useMemo(
    () => notes.filter((note) => !needle || note.title.toLowerCase().includes(needle) || note.path.toLowerCase().includes(needle)),
    [needle, notes],
  );
  const visiblePdfs = useMemo(
    () => pdfs.filter((pdf) => !needle || pdf.title.toLowerCase().includes(needle) || pdf.relPath.toLowerCase().includes(needle)),
    [needle, pdfs],
  );
  const visibleCanvases = useMemo(
    () => canvases.filter((file) => !needle || file.title.toLowerCase().includes(needle)),
    [canvases, needle],
  );

  const submitUrl = () => {
    const normalized = normalizeTargetUrl(url);
    if (!normalized) {
      setUrlError(true);
      return;
    }
    onPick({ kind: "url", url: normalized });
  };

  const rows = tab === "note"
    ? visibleNotes.map((note) => ({
      key: note.path,
      label: note.title,
      hint: note.path,
      onSelect: () => onPick({ kind: "note", path: note.path, title: note.title }),
    }))
    : tab === "pdf"
      ? visiblePdfs.map((pdf) => ({
        key: `${pdf.repoPath}|${pdf.relPath}`,
        label: pdf.title,
        hint: pdf.relPath,
        onSelect: () => onPick({ kind: "pdf", repoPath: pdf.repoPath, relPath: pdf.relPath, title: pdf.title }),
      }))
      : tab === "canvas"
        ? visibleCanvases.map((file) => ({
          key: file.path,
          label: file.title,
          hint: file.path,
          onSelect: () => onPick({ kind: "canvas", path: file.path, title: file.title }),
        }))
        : [];

  return (
    <Modal
      open
      onClose={onClose}
      position="center"
      size="md"
      title={t["canvas.pickTargetTitle"]}
      icon={Link2}
    >
      <div className="flex items-center gap-1 mb-3">
        {TABS.map(({ id, icon: Icon, labelKey }) => (
          <Button
            key={id}
            variant={tab === id ? "secondary" : "ghost"}
            size="xs"
            onClick={() => { setTab(id); setQuery(""); setUrlError(false); }}
          >
            <Icon size={12} />
            {t[labelKey]}
          </Button>
        ))}
      </div>

      {tab === "url" ? (
        <div className="space-y-2">
          <Input
            autoFocus
            value={url}
            spellCheck={false}
            placeholder={t["canvas.urlPlaceholder"]}
            onChange={(event) => { setUrl(event.target.value); setUrlError(false); }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitUrl();
              }
            }}
            className="w-full"
          />
          {urlError && <p className="text-caption text-danger">{t["canvas.urlInvalid"]}</p>}
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={submitUrl}>
              {t["canvas.linkUrl"]}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Input
            autoFocus
            value={query}
            spellCheck={false}
            placeholder={t["canvas.pickSearch"]}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full mb-2"
          />
          <div className="max-h-72 overflow-y-auto -mx-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-caption">{t["canvas.loading"]}</span>
              </div>
            ) : failed ? (
              <p className="px-3 py-6 text-center text-caption text-danger">
                {t["canvas.pickLoadFailed"]}
              </p>
            ) : rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-caption text-muted">
                {t["canvas.pickEmpty"]}
              </p>
            ) : (
              rows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={row.onSelect}
                  className="w-full rounded-chip px-2.5 py-2 text-left hover:bg-hover/60 cursor-pointer"
                >
                  <span className="block truncate text-body text-primary">{row.label}</span>
                  <span className="block truncate text-meta text-faint">{row.hint}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
