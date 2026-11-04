import { useEffect, useState } from "react";

type Granularity = "minute" | "day";

function nextBoundaryDelay(now: Date, granularity: Granularity): number {
  if (granularity === "day") {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return Math.max(1000, next.getTime() - now.getTime());
  }
  return 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
}

/** Re-renders on the next minute or local midnight boundary, not every second. */
export function useNow(granularity: Granularity = "minute"): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const current = new Date();
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, nextBoundaryDelay(current, granularity));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [granularity]);

  return now;
}
