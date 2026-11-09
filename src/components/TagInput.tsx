import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Tag } from "lucide-react";
import Badge from "./Badge";
import Input from "./Input";
import { useT } from "../i18n";

interface TagSuggestion {
  name: string;
  count: number;
}

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: TagSuggestion[];
  placeholder?: string;
  colorForTag: (name: string) => { name: string; bg: string };
}

export default function TagInput({ tags, onChange, suggestions, placeholder, colorForTag }: Props) {
  const { t } = useT();
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);

  const filtered = useMemo(() => {
    const available = suggestions.filter((s) => !tags.includes(s.name));
    const q = input.toLowerCase().trim();
    if (!q) return available.slice(0, 8);
    return available.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [suggestions, input, tags]);

  // The dropdown portals to <body> so a scrolling modal can't clip it; keep
  // it pinned to the input while the surrounding surface scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setAnchor({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const addTag = (name: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(input);
      return;
    }
    // Layered Escape: suggestions → draft text → let the enclosing modal close
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        return;
      }
      if (input) {
        e.preventDefault();
        e.stopPropagation();
        setInput("");
      }
    }
  };

  const showDropdown = open && filtered.length > 0 && anchor !== null;

  return (
    <div>
      <div ref={anchorRef} className="relative">
        <Input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder={placeholder}
          className="w-full"
        />
        {showDropdown && createPortal(
          <div
            role="listbox"
            className="fixed z-menu bg-elevated border border-strong rounded-control shadow-popover p-1"
            style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
          >
            {filtered.map((s) => (
              <button
                key={s.name}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => addTag(s.name, e)}
                className="w-full text-left px-3 py-2 text-body text-secondary hover:bg-hover flex items-center justify-between rounded-chip"
              >
                <span className="flex items-center gap-2">
                  <Tag size={12} className="text-muted" />
                  {s.name}
                </span>
                <span className="text-caption text-muted">{s.count}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tags.map((tag) => {
            const c = colorForTag(tag);
            return (
              <Badge key={tag} palette={c} className="gap-1">
                <Tag size={10} />
                {tag}
                <button
                  type="button"
                  onClick={() => onChange(tags.filter((t) => t !== tag))}
                  aria-label={`${t["common.remove"]} ${tag}`}
                  className="hover:text-danger"
                >
                  <X size={12} />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
