import { ChevronDown } from "lucide-react";
import { useState } from "react";
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

  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-2.5 bg-gray-800 border-t border-gray-700 shadow-lg z-20">
      <span className="text-sm text-gray-300 font-medium">
        {t["batch.selected"].replace("{count}", String(selectedCount))}
      </span>

      {/* Add to collection dropdown */}
      <div className="relative">
        <Button
          variant="primary"
          size="xs"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          {t["batch.addToCollection"]}
          <ChevronDown size={14} />
        </Button>
        <DropdownMenu open={dropdownOpen} onClose={() => setDropdownOpen(false)} className="bottom-full mb-1 left-0 min-w-[180px]">
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
