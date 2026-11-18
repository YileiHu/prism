import { useEffect, useRef, useState } from "react";
import { FolderKanban } from "lucide-react";
import Button from "./Button";
import { DropdownMenu, DropdownMenuItem } from "./DropdownMenu";
import { useT } from "../i18n";
import { resolveTagColor } from "../lib/colors";
import { jumpToProject, useProjectLinks } from "../lib/projectLinks";

interface Props {
  filePath: string;
  variant?: "inline" | "toolbar";
}

/**
 * Marks a note/canvas that is linked to one or more GTD projects. Clicking
 * jumps to the project (or opens a picker when there are several). Bindings
 * come from the shared project-link index, so lists and editors stay in sync.
 */
export default function ProjectLinkMarker({ filePath, variant = "inline" }: Props) {
  const { t } = useT();
  const { projectsFor } = useProjectLinks();
  const projects = projectsFor(filePath);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (projects.length <= 1) setOpen(false);
  }, [projects.length]);

  if (projects.length === 0) return null;

  const first = projects[0];
  const color = resolveTagColor(first.title, first.color);
  const multiple = projects.length > 1;
  const tooltip = multiple
    ? t["gtd.projectLink.multiple"].replace("{count}", String(projects.length))
    : `${t["gtd.openLinkedProject"]}: ${first.title}`;

  const handleClick = () => {
    if (multiple) setOpen((value) => !value);
    else jumpToProject(first);
  };

  const menu = multiple ? (
    <DropdownMenu
      open={open}
      onClose={() => setOpen(false)}
      anchorRef={anchorRef}
      align="right"
    >
      {projects.map((project) => (
        <DropdownMenuItem
          key={project.projectId}
          onClick={() => {
            setOpen(false);
            jumpToProject(project);
          }}
        >
          <span
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ backgroundColor: resolveTagColor(project.title, project.color).bar }}
          />
          <span className="min-w-0 flex-1 truncate">{project.title}</span>
          {project.archived && (
            <span className="flex-shrink-0 text-meta text-faint">{t["gtd.archived"]}</span>
          )}
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  ) : null;

  const stopPointer = (event: React.PointerEvent) => event.stopPropagation();

  if (variant === "toolbar") {
    return (
      <>
        <Button
          ref={anchorRef}
          variant="ghost"
          size="icon-sm"
          active={open}
          title={tooltip}
          aria-label={t["gtd.openLinkedProject"]}
          aria-haspopup={multiple ? "menu" : undefined}
          aria-expanded={multiple ? open : undefined}
          onPointerDown={stopPointer}
          onClick={(event) => {
            event.stopPropagation();
            handleClick();
          }}
        >
          <FolderKanban size={15} />
        </Button>
        {menu}
      </>
    );
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        title={tooltip}
        aria-label={tooltip}
        aria-haspopup={multiple ? "menu" : undefined}
        aria-expanded={multiple ? open : undefined}
        onPointerDown={stopPointer}
        onClick={(event) => {
          event.stopPropagation();
          handleClick();
        }}
        onKeyDown={(event) => event.stopPropagation()}
        className="inline-flex max-w-full flex-shrink-0 items-center gap-1 rounded-chip border border-line/40 px-1 py-0.5 text-meta text-tertiary transition-colors hover:bg-hover hover:text-secondary"
      >
        <span
          className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: color.bar }}
        />
        <FolderKanban size={11} className="flex-shrink-0" />
        {multiple ? (
          <span className="tabular-nums">
            {t["gtd.projectLink.more"].replace("{count}", String(projects.length))}
          </span>
        ) : (
          <span className="max-w-[88px] truncate">{first.title}</span>
        )}
      </button>
      {menu}
    </>
  );
}
