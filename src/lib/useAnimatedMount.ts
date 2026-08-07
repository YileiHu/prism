import { useEffect, useRef, useState } from "react";

// Keeps a component mounted briefly after `open` flips to false so an exit
// animation can play. Returns { mounted, exiting } — render when mounted,
// swap to the exit class when exiting.
export function useAnimatedMount(open: boolean, exitMs = 120) {
  const [state, setState] = useState<"closed" | "open" | "exiting">(open ? "open" : "closed");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setState("open");
    } else if (wasOpen.current) {
      setState("exiting");
      timer.current = setTimeout(() => {
        timer.current = null;
        setState("closed");
      }, exitMs);
    }
    wasOpen.current = open;
  }, [open, exitMs]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { mounted: state !== "closed", exiting: state === "exiting" };
}
