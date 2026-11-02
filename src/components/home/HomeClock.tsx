import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";

export default function HomeClock() {
  const { lang } = useT();
  const { values } = useSettings();
  const [now, setNow] = useState(() => new Date());

  // Tick on the next minute boundary, then every minute — no per-second work
  useEffect(() => {
    const start = new Date();
    const delay = 60_000 - (start.getSeconds() * 1000 + start.getMilliseconds());
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, delay);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const time = now.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: values.clock_format === "12",
  });
  const date = now.toLocaleDateString(locale, { month: "long", day: "numeric" });
  const weekday = now.toLocaleDateString(locale, { weekday: "long" });
  const year = now.toLocaleDateString(locale, { year: "numeric" });

  return (
    <div className="rounded-card bg-surface/20 bg-gradient-to-br from-[rgb(var(--accent-rgb)/0.18)] to-[rgb(var(--accent-rgb)/0.07)] px-5 py-4 flex-shrink-0 select-none">
      <div className="text-[40px] leading-none font-semibold tabular-nums tracking-tight text-primary">
        {time}
      </div>
      <div className="mt-3 flex items-center gap-3 text-section">
        <span className="text-secondary">{date}</span>
        <span className="text-[var(--accent-text)]">{weekday}</span>
        <span className="text-muted">{year}</span>
      </div>
    </div>
  );
}
