import type { RememberedWorkflowNode } from "@/components/workflow-node-tool";

export const WORKFLOW_NODE_DRAG_TYPE = "application/x-productivity-os-workflow-node";

export function writeWorkflowNodeDrag(
  transfer: DataTransfer,
  choice: RememberedWorkflowNode,
): void {
  transfer.effectAllowed = "copy";
  transfer.setData(WORKFLOW_NODE_DRAG_TYPE, JSON.stringify(choice));
  transfer.setData("text/plain", choice.kind === "plugin" ? choice.nodeType : choice.kind);
}

export function readWorkflowNodeDrag(transfer: DataTransfer): RememberedWorkflowNode | null {
  const encoded = transfer.getData(WORKFLOW_NODE_DRAG_TYPE);
  if (!encoded) return null;
  try {
    const value = JSON.parse(encoded) as Partial<RememberedWorkflowNode>;
    if (value.kind === "plugin" && typeof value.pluginId === "string" && typeof value.nodeType === "string")
      return { kind: "plugin", pluginId: value.pluginId, nodeType: value.nodeType };
    if (["terminator", "task", "timer", "milestone", "link"].includes(String(value.kind)))
      return { kind: value.kind } as RememberedWorkflowNode;
  } catch {
    return null;
  }
  return null;
}
