import {
  CheckSquare2,
  CircleDot,
  Flag,
  Link2,
  Timer,
  type LucideIcon,
} from "lucide-react";
import type { BuiltInWorkflowNodeKind } from "./index.ts";

export type WorkflowNodeCatalogItem = {
  kind: BuiltInWorkflowNodeKind;
  title: string;
  detail: string;
  icon: LucideIcon;
};

export const WORKFLOW_NODE_CATALOG: readonly WorkflowNodeCatalogItem[] = [
  {
    kind: "terminator",
    title: "Terminator",
    detail: "Start or end the workflow",
    icon: CircleDot,
  },
  {
    kind: "task",
    title: "Task",
    detail: "Name, completion, and subtasks",
    icon: CheckSquare2,
  },
  {
    kind: "timer",
    title: "Timer",
    detail: "A focused, timed workflow step",
    icon: Timer,
  },
  {
    kind: "milestone",
    title: "Milestone",
    detail: "Mark a meaningful checkpoint",
    icon: Flag,
  },
  {
    kind: "link",
    title: "Workflow Link",
    detail: "Open another workflow",
    icon: Link2,
  },
];

export function workflowNodeCatalogItem(
  kind: BuiltInWorkflowNodeKind,
): WorkflowNodeCatalogItem {
  return (
    WORKFLOW_NODE_CATALOG.find((item) => item.kind === kind) ??
    WORKFLOW_NODE_CATALOG[1]
  );
}
