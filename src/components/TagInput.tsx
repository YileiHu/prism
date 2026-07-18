import { useState, useMemo } from "react";
import { X, Tag } from "lucide-react";

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
    const q = input.toLowerCase().trim();
    if (!q) return suggestions.slice(0, 8);
    return suggestions.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [suggestions, input]);

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
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
        {tags.map((tag) => {
          const c = colorForTag(tag);
          return (
            <span key={tag} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{ color: c.name, backgroundColor: c.bg }}>
              <Tag size={10} />
              {tag}
              <button onClick={() => onChange(tags.filter((t) => t !== tag))} className="hover:text-red-400 ml-0.5">
                <X size={12} />
              </button>
            </span>
          );
        })}
      </div>
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder={placeholder}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
        {open && filtered.length > 0 && (
          <div className="absolute top-full mt-1 left-0 z-30 bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-1 w-full">
            {filtered.map((s) => (
              <button
                key={s.name}
                onMouseDown={(e) => addTag(s.name, e)}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center justify-between rounded-md"
              >
                <span className="flex items-center gap-2">
                  <Tag size={12} className="text-gray-500" />
                  {s.name}
                </span>
                <span className="text-xs text-gray-500">{s.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
