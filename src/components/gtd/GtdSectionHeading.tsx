interface Props {
  label: string;
  count: number;
  tone?: "danger";
}

/** Shared group heading for the Upcoming and Completed lists. */
export default function GtdSectionHeading({ label, count, tone }: Props) {
  return (
    <div
      className={`flex items-center gap-2 px-3 pb-1 pt-3 text-caption font-medium ${
        tone === "danger" ? "text-danger" : "text-muted"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums opacity-70">{count}</span>
    </div>
  );
}
