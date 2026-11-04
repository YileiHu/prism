import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import { useNow } from "./useNow";

export default function ToolbarClock() {
  const { lang } = useT();
  const { values } = useSettings();
  const now = useNow("minute");

  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const time = now.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: values.clock_format === "12",
  });

  return (
    <span className="select-none text-control font-medium tabular-nums text-primary">
      {time}
    </span>
  );
}
