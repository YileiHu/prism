import { useEffect, useMemo, useState } from "react";
import { BookOpen, FileText, Frame, Image as ImageIcon, Link2, Plus } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { normalizeTargetUrl } from "../../lib/canvas/targets";
import Button from "../Button";
import Input from "../Input";
import Modal from "../Modal";
import SearchInput from "../SearchInput";
import SegmentedToggle from "../SegmentedToggle";
import Spinner from "../Spinner";
import { serializeEmbedSpec } from "../embeds/model";
import { imagePathFor } from "./imagePath";

type InsertKind = "image" | "canvas" | "note" | "pdf" | "link";

interface Props {
  vaultPath: string;
  notePath: string;
  onInsert: (syntax: string) => void;
  onClose: () => void;
}

interface Item {
  key: string;
  target: string;
  title: string;
  hint: string;
}

function vaultRelative(filePath: string, vaultPath: string): string {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const file = norm(filePath);
  const vault = norm(vaultPath);
  if (file.toLowerCase().startsWith(vault.toLowerCase() + "/")) {
    return file.slice(vault.length + 1);
  }
  return file;
}

export default function InsertModal({ vaultPath, notePath, onInsert, onClose }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [kind, setKind] = useState<InsertKind>("image");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");

  useEffect(() => {
    setQuery("");
  }, [kind]);

  useEffect(() => {
    if (kind !== "canvas" && kind !== "note" && kind !== "pdf") return;
    let cancelled = false;
    setItems(null);
    setFailed(false);
    const load = async (): Promise<Item[]> => {
      if (kind === "pdf") {
        // PDFs live in their own repo; the embed target is the repo-relative path.
        const rows = await window.prism.listPdfs();
        return rows.map((doc) => ({
          key: `${doc.repoPath}|${doc.relPath}`,
          target: doc.relPath,
          title: doc.title,
          hint: doc.relPath,
        }));
      }
      const rows = kind === "canvas"
        ? await window.prism.listCanvases(vaultPath)
        : await window.prism.getNoteList(vaultPath);
      return rows.map((item) => {
        const rel = vaultRelative(item.path, vaultPath);
        return { key: item.path, target: rel, title: item.title, hint: rel };
      });
    };
    void load()
      .then((next) => {
        if (!cancelled) setItems(next);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setFailed(true);
        }
      });
    return () => { cancelled = true; };
  }, [kind, vaultPath]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!items) return null;
    if (!q) return items;
    return items.filter((item) =>
      item.title.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q));
  }, [items, query]);

  const insert = (syntax: string) => {
    onInsert(syntax);
    onClose();
  };

  const pickImage = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const ref = await window.prism.pickAttachment(vaultPath);
      if (!ref) return;
      const target = await imagePathFor(ref, vaultPath, notePath);
      insert(`![[${serializeEmbedSpec({ kind: "image", target, size: null })}]]`);
    } catch {
      showToast(t["insert.pickImageFailed"], "error");
    } finally {
      setPicking(false);
    }
  };

  const normalizedUrl = normalizeTargetUrl(url);

  const insertLink = () => {
    if (!normalizedUrl) return;
    insert(`![[${serializeEmbedSpec({ kind: "link", target: normalizedUrl, label: label.trim() || undefined, size: null })}]]`);
  };

  const body = (() => {
    if (kind === "image") {
      return (
        <div className="flex flex-col items-center gap-3 py-6">
          <Button variant="primary" size="sm" onClick={() => { void pickImage(); }} disabled={picking}>
            {picking ? <Spinner size={14} /> : <ImageIcon size={14} />}
            {t["insert.pickImage"]}
          </Button>
          <p className="text-caption text-muted">{t["insert.imageHint"]}</p>
        </div>
      );
    }

    if (kind === "link") {
      return (
        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t["insert.urlPlaceholder"]}
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                insertLink();
              }
            }}
          />
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t["insert.labelPlaceholder"]}
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                insertLink();
              }
            }}
          />
          {url.trim() && !normalizedUrl && (
            <p className="text-caption text-muted">{t["insert.invalidUrl"]}</p>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder={t["insert.search"]} />
        <div className="max-h-72 overflow-y-auto rounded-control border border-line/50">
          {!filtered ? (
            <div className="flex items-center justify-center py-8 text-muted">
              <Spinner size={16} />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-caption text-muted">
              {failed ? t["insert.loadFailed"] : t["insert.empty"]}
            </p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  insert(`![[${serializeEmbedSpec({ kind, target: item.target, size: null })}]]`);
                }}
                className="flex w-full min-w-0 flex-col items-start gap-0.5 border-b border-line/40 px-3 py-2 text-left last:border-b-0 hover:bg-hover"
              >
                <span className="w-full truncate text-body text-primary">{item.title}</span>
                <span className="w-full truncate text-caption text-muted">{item.hint}</span>
              </button>
            ))
          )}
        </div>
      </div>
    );
  })();

  return (
    <Modal
      open
      onClose={onClose}
      title={t["insert.title"]}
      icon={Plus}
      size="md"
      footer={(
        <>
          {kind === "link" && (
            <Button variant="primary" size="sm" onClick={insertLink} disabled={!normalizedUrl}>
              {t["insert.confirm"]}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["insert.cancel"]}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        <SegmentedToggle
          value={kind}
          onChange={setKind}
          stretch
          options={[
            { value: "image", label: t["insert.image"], icon: ImageIcon },
            { value: "canvas", label: t["insert.canvas"], icon: Frame },
            { value: "note", label: t["insert.note"], icon: FileText },
            { value: "pdf", label: t["insert.pdf"], icon: BookOpen },
            { value: "link", label: t["insert.link"], icon: Link2 },
          ]}
        />
        {body}
      </div>
    </Modal>
  );
}
