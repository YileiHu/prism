import { useEffect, useRef, useState } from "react";
import { FileWarning } from "lucide-react";
import { Skeleton } from "../Skeleton";
import { renderFirstPageJpeg } from "./pdfjs";
import { pdfCoverUrl, pdfDocumentUrl, type PdfDocument } from "./types";

interface CoverResult {
  version: number;
  pageCount: number;
}

interface Job {
  doc: PdfDocument;
  resolve: (result: CoverResult | null) => void;
}

const queue: Job[] = [];
// A cover that fails twice in one session stays failed; the list re-generates
// them after an external change (modified_at differs).
const failed = new Map<number, string>();
let active = 0;
const MAX_CONCURRENT = 2;

async function generateCover(doc: PdfDocument): Promise<CoverResult | null> {
  try {
    const cover = await renderFirstPageJpeg(pdfDocumentUrl(doc.id), 360);
    const result = await window.prism.savePdfCover(doc.id, cover.jpeg, cover.pageCount);
    return { version: result.coverVersion, pageCount: cover.pageCount };
  } catch {
    return null;
  }
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!;
    active++;
    void generateCover(job.doc)
      .then((version) => job.resolve(version))
      .finally(() => {
        active--;
        pump();
      });
  }
}

function requestCover(doc: PdfDocument): Promise<CoverResult | null> {
  return new Promise((resolve) => {
    queue.push({ doc, resolve });
    pump();
  });
}

interface Props {
  doc: PdfDocument;
  onGenerated: (id: number, version: number, pageCount: number) => void;
}

type Status = "idle" | "loading" | "ready" | "error";

function initialStatus(doc: PdfDocument): Status {
  if (!doc.coverPath || doc.coverDirty) {
    return failed.get(doc.id) === doc.modifiedAt ? "error" : "idle";
  }
  return "ready";
}

export default function PdfCover({ doc, onGenerated }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [version, setVersion] = useState(doc.coverVersion);
  const [status, setStatus] = useState<Status>(() => initialStatus(doc));
  const retriedRef = useRef(false);

  useEffect(() => {
    setVersion(doc.coverVersion);
    retriedRef.current = false;
    setStatus(initialStatus(doc));
  }, [doc.id, doc.coverVersion, doc.coverDirty, doc.coverPath, doc.modifiedAt]);

  useEffect(() => {
    if (status !== "idle") return;
    const host = hostRef.current;
    if (!host) return;
    if (failed.get(doc.id) === doc.modifiedAt) {
      setStatus("error");
      return;
    }
    let cancelled = false;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setStatus("loading");
      void requestCover(doc).then((result) => {
        if (cancelled) return;
        if (result === null) {
          failed.set(doc.id, doc.modifiedAt);
          setStatus("error");
          return;
        }
        setVersion(result.version);
        setStatus("ready");
        onGenerated(doc.id, result.version, result.pageCount);
      });
    }, { rootMargin: "240px" });
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [status, doc, onGenerated]);

  return (
    <div ref={hostRef} className="absolute inset-0 bg-elevated">
      {status === "ready" && version > 0 ? (
        <img
          src={pdfCoverUrl(doc.id, version)}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => {
            if (retriedRef.current) {
              setStatus("error");
              return;
            }
            retriedRef.current = true;
            setStatus("idle");
          }}
        />
      ) : status === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-faint">
          <FileWarning size={26} strokeWidth={1.5} />
        </div>
      ) : (
        <Skeleton className="absolute inset-0 rounded-none" />
      )}
    </div>
  );
}
