import { useEffect, useRef, useState } from "react";
import { FolderKanban } from "lucide-react";
import Button from "../Button";
import { DropdownMenu, DropdownMenuItem } from "../DropdownMenu";
import { useT } from "../../i18n";
import { resolveTagColor } from "../../lib/colors";
import type { GtdProject } from "../../shared/models";

interface Props {
  filePath: string;
}

export default function ProjectJumpButton({ filePath }: Props) {
  const { t } = useT();
  const [projects, setProjects] = useState<GtdProject[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const currentPathRef = useRef(filePath);

  useEffect(() => {
    let cancelled = false;
    if (currentPathRef.current !== filePath) {
      currentPathRef.current = filePath;
      setProjects([]);
    }
    if (!filePath) {
      setProjects([]);
      return;
    }
    window.prism
      .getGtdProjectsForFile(filePath)
      .then((next) => { if (!cancelled) setProjects(next); })
      .catch(() => { if (!cancelled) setProjects([]); });
    return () => { cancelled = true; };
  }, [filePath, refreshKey]);

  useEffect(() => {
    const refresh = () => setRefreshKey((key) => key + 1);
    window.addEventListener("gtd-project-links-changed", refresh);
    return () => window.removeEventListener("gtd-project-links-changed", refresh);
  }, []);

  useEffect(() => {
    if (projects.length <= 1) setOpen(false);
  }, [projects.length]);

  if (projects.length === 0) return null;

  const jump = (project: GtdProject) => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("prism:open-project", {
      detail: {
        projectId: project.id,
        archived: project.archivedAt !== null,
      },
    }));
  };

  const button = (
    <Button
      ref={projects.length > 1 ? anchorRef : undefined}
      variant="ghost"
      size="icon-sm"
      active={open}
      title={t["gtd.openLinkedProject"]}
      aria-label={t["gtd.openLinkedProject"]}
      aria-haspopup={projects.length > 1 ? "menu" : undefined}
      aria-expanded={projects.length > 1 ? open : undefined}
      onClick={() => {
        if (projects.length === 1) jump(projects[0]);
        else setOpen((value) => !value);
      }}
    >
      <FolderKanban size={15} />
    </Button>
  );

  if (projects.length === 1) return button;

  return (
    <>
      {button}
      <DropdownMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        align="right"
      >
        {projects.map((project) => (
          <DropdownMenuItem key={project.id} onClick={() => jump(project)}>
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: resolveTagColor(project.title, project.color).bar }}
            />
            <span className="min-w-0 flex-1 truncate">{project.title}</span>
            {project.archivedAt && (
              <span className="flex-shrink-0 text-meta text-faint">{t["gtd.archived"]}</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
    </>
  );
}
