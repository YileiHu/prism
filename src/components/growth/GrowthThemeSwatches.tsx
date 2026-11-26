import { TAG_COLORS, type TagColorKey } from "../../lib/colors";

interface Props {
  value: TagColorKey;
  onChange: (key: TagColorKey) => void;
  /** 24px in the season form, 20px in the domain list. */
  size?: "sm" | "md";
}

/** One palette swatch row shared by the season and domain forms. */
export default function GrowthThemeSwatches({ value, onChange, size = "md" }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {TAG_COLORS.map((color) => {
        const active = color.key === value;
        return (
          <button
            key={color.key}
            type="button"
            aria-pressed={active}
            aria-label={color.key}
            onClick={() => onChange(color.key)}
            className={`${size === "md" ? "h-6 w-6" : "h-5 w-5"} rounded-full transition-transform ${
              active
                ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-surface"
                : "ring-1 ring-strong/40 hover:scale-110"
            }`}
            style={{ backgroundColor: color.bar }}
          />
        );
      })}
    </div>
  );
}
