import { renderToStaticMarkup } from "react-dom/server";
import {
  AlertOctagon, AlertTriangle, Bug, Check, CheckCircle2, FileText,
  Flame, HelpCircle, Info, List, ListChecks, Pencil, Quote, XCircle, Zap,
  type LucideIcon,
} from "lucide-react";

// Icons per canonical callout family (see CALLOUT_FAMILIES in callouts.ts).
// Also reused by the callout type picker in the editor's block menu.
export const CALLOUT_ICONS: Record<string, LucideIcon> = {
  note: Pencil,
  info: Info,
  todo: CheckCircle2,
  abstract: ListChecks,
  tip: Flame,
  success: Check,
  question: HelpCircle,
  warning: AlertTriangle,
  failure: XCircle,
  danger: Zap,
  error: AlertOctagon,
  bug: Bug,
  example: List,
  quote: Quote,
};

// lucide is React-side, so serialize the icon once and splice it into the
// rendered callout title
export function decorateCalloutIcons(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".callout").forEach((el) => {
    const title = el.querySelector(".callout-title");
    if (!title || title.querySelector(".callout-title-icon")) return;
    const Icon = CALLOUT_ICONS[el.getAttribute("data-callout") ?? ""] ?? FileText;
    const holder = document.createElement("span");
    holder.className = "callout-title-icon";
    holder.innerHTML = renderToStaticMarkup(<Icon size={14} className="shrink-0" />);
    title.prepend(holder);
  });
}
