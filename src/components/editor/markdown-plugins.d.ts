declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";
  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  function taskLists(md: MarkdownIt, options?: TaskListsOptions): void;
  export default taskLists;
}

declare module "markdown-it-mark" {
  import type MarkdownIt from "markdown-it";
  function mark(md: MarkdownIt): void;
  export default mark;
}
