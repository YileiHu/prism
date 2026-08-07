import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { useT } from "../i18n";
import Button from "./Button";
import { DropdownMenu, DropdownMenuItem } from "./DropdownMenu";

interface Props {
  selectedCount: number;
  collections: { id: string; name: string }[];
  onAddToCollection: (collectionId: string) => void;
  onDelete: () => void;
}

export default function BatchActionBar({ selectedCount, collections, onAddToCollection, onDelete }: Props) {
  const { t } = useT();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-2.5 glass bg-elevated/85 border-t border-strong shadow-lg z-20 anim-bar">
      <span className="text-sm text-secondary font-medium">
        {t["batch.selected"].replace("{count}", String(selectedCount))}
      </span>

      {/* Add to collection dropdown */}
      <div ref={anchorRef}>
        <Button
          variant="primary"
          size="xs"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          {t["batch.addToCollection"]}
          <ChevronDown size={14} />
        </Button>
        <DropdownMenu open={dropdownOpen} onClose={() => setDropdownOpen(false)} anchorRef={anchorRef} side="top" className="min-w-[180px] max-h-64 overflow-y-auto">
          {collections.map((c) => (
            <DropdownMenuItem key={c.id} onClick={() => { onAddToCollection(c.id); setDropdownOpen(false); }}>
              {c.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenu>
      </div>

      {/* Delete */}
      <Button
        variant="danger-subtle"
        size="xs"
        onClick={onDelete}
      >
        {t["batch.delete"]}
      </Button>
    </div>
  );
}
