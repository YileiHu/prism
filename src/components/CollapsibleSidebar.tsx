import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import { useSidebarCollapsed } from "../lib/sidebarState";

interface Props {
  children: ReactNode;
  footer?: ReactNode;
}

export default function CollapsibleSidebar({ children, footer }: Props) {
  const collapsed = useSidebarCollapsed();
  return (
    <div
      className={`h-full flex-shrink-0 grid transition-[grid-template-columns] duration-200 ease-out ${
        collapsed ? "grid-cols-[0fr]" : "grid-cols-[1fr]"
      }`}
    >
      <div className="overflow-hidden min-w-0 h-full flex">
        <Sidebar footer={footer}>{children}</Sidebar>
      </div>
    </div>
  );
}
