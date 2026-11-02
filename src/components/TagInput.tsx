import { useState, useMemo } from "react";
import { X, Tag } from "lucide-react";
import Input from "./Input";

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
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const available = suggestions.filter((s) => !tags.includes(s.name));
    const q = input.toLowerCase().trim();
    if (!q) return available.slice(0, 8);
    return available.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [suggestions, input, tags]);

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

  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag) => {
            const c = colorForTag(tag);
            return (
              <span key={tag} className="inline-flex items-center gap-1 text-caption px-2.5 py-1 rounded-full" style={{ color: c.name, backgroundColor: c.bg }}>
                <Tag size={10} />
                {tag}
                <button onClick={() => onChange(tags.filter((t) => t !== tag))} className="hover:text-danger ml-0.5">
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="relative">
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
        {open && filtered.length > 0 && (
          <div className="absolute top-full mt-1 left-0 z-30 glass bg-elevated/85 border border-strong rounded-control shadow-popover p-1 w-full">
            {filtered.map((s) => (
              <button
                key={s.name}
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
          </div>
        )}
      </div>
    </div>
  );
}
