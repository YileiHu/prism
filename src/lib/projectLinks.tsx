import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GtdFileProjectRef } from "../shared/models";
import { normalizePath } from "./paths";

const REFRESH_DEBOUNCE_MS = 120;

interface ProjectLinksContextValue {
  projectsFor: (filePath: string) => GtdFileProjectRef[];
  refresh: () => void;
}

const ProjectLinksContext = createContext<ProjectLinksContextValue | null>(null);

function buildIndex(entries: GtdFileProjectRef[]): Map<string, GtdFileProjectRef[]> {
  const index = new Map<string, GtdFileProjectRef[]>();
  for (const entry of entries) {
    const key = normalizePath(entry.filePath);
    const list = index.get(key);
    if (list) list.push(entry);
    else index.set(key, [entry]);
  }
  return index;
}

export function ProjectLinksProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<Map<string, GtdFileProjectRef[]>>(new Map());
  const [refreshKey, setRefreshKey] = useState(0);
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    window.prism
      .getGtdProjectLinkIndex()
      .then((entries) => {
        if (seq === seqRef.current) setIndex(buildIndex(entries));
      })
      .catch(() => { /* keep the previous index */ });
  }, [refreshKey]);

  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        setRefreshKey((key) => key + 1);
      }, REFRESH_DEBOUNCE_MS);
    };
    window.addEventListener("gtd-project-links-changed", schedule);
    return () => {
      window.removeEventListener("gtd-project-links-changed", schedule);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  const projectsFor = useCallback(
    (filePath: string) => (filePath ? index.get(normalizePath(filePath)) ?? [] : []),
    [index],
  );

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  const value = useMemo<ProjectLinksContextValue>(
    () => ({ projectsFor, refresh }),
    [projectsFor, refresh],
  );

  return <ProjectLinksContext.Provider value={value}>{children}</ProjectLinksContext.Provider>;
}

export function useProjectLinks(): ProjectLinksContextValue {
  const value = useContext(ProjectLinksContext);
  if (!value) throw new Error("useProjectLinks must be used inside ProjectLinksProvider");
  return value;
}

export function jumpToProject(project: GtdFileProjectRef): void {
  window.dispatchEvent(new CustomEvent("prism:open-project", {
    detail: {
      projectId: project.projectId,
      archived: project.archived,
    },
  }));
}
