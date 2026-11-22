import { useT } from "../../i18n";
import type { Translation } from "../../i18n/zh";

interface Props {
  limit: number;
  messageKey: Extract<keyof Translation, "vault.resultLimitHint" | "pdf.resultLimitHint">;
  className?: string;
}

// The "showing the first N results" hint shared by note, PDF, resource and
// content-search lists.
export default function SearchLimitHint({
  limit,
  messageKey,
  className = "px-4 py-1.5 text-caption text-faint",
}: Props) {
  const { t } = useT();
  return (
    <div className={className}>
      {t[messageKey].replace("{count}", String(limit))}
    </div>
  );
}
