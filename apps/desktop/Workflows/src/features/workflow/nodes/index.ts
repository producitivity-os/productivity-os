import type { CanvasObject } from "../../../../../../packages/canvas/src/core/model/object.ts";
import { WorkflowLinkNode } from "./link/node.ts";
import { WorkflowMilestoneNode } from "./milestone/node.ts";
import { WorkflowPluginNode } from "./plugin/node.ts";
import { WorkflowTaskNode } from "./task/node.ts";
import { WorkflowTerminatorNode } from "./terminator/node.ts";
import { WorkflowTimerNode } from "./timer/node.ts";
import type { WorkflowNode, WorkflowNodeInit } from "./model.ts";

export * from "./model.ts";
export * from "./link/node.ts";
export * from "./milestone/node.ts";
export * from "./plugin/node.ts";
export * from "./task/node.ts";
export * from "./terminator/node.ts";
export * from "./timer/node.ts";

export function hydrateWorkflowNode(object: CanvasObject): WorkflowNode {
  const init = object as unknown as WorkflowNodeInit;
  if (
    !["terminator", "task", "timer", "milestone", "link", "plugin", "start"].includes(
      init.nodeKind,
    ) &&
    typeof init.durationMs === "number" &&
    typeof init.timerStatus === "string"
  )
    return new WorkflowTimerNode(init);
  switch (init.nodeKind) {
    case "start":
      return new WorkflowTerminatorNode({ ...init, nodeKind: "start", role: "Start" });
    case "terminator":
      return new WorkflowTerminatorNode({ ...init, nodeKind: "terminator" });
    case "milestone":
      return new WorkflowMilestoneNode(init);
    case "timer":
      return new WorkflowTimerNode(init);
    case "link":
      return new WorkflowLinkNode(init);
    case "plugin":
      return new WorkflowPluginNode(init);
    default:
      return new WorkflowTaskNode(init);
  }
}

export function isWorkflowNode(
  object: CanvasObject | null | undefined,
): object is WorkflowNode {
  return object?.type === "workflow-node";
}
