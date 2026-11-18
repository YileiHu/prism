import ProjectLinkMarker from "../ProjectLinkMarker";

interface Props {
  filePath: string;
}

/** Toolbar entry point for jumping from an open note/canvas to its project. */
export default function ProjectJumpButton({ filePath }: Props) {
  return <ProjectLinkMarker filePath={filePath} variant="toolbar" />;
}
